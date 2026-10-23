import { Hono, type Context } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { html } from 'hono/html'
import QRCode from 'qrcode'

import { config } from './config.ts'
import {
  allSettings,
  db,
  getFamilyByCode,
  getFamilyByToken,
  importCsv,
  listFamilies,
  seedIfEmpty,
  setSetting,
  type Staff,
} from './db.ts'
import { api, clearSession, currentStaff, issueSession } from './api.ts'
import { listConflicts, resolveConflict, submitOps, summary } from './ops.ts'
import { readDoc, readSettingsFile } from './content.ts'
import { errorPage, layout } from './ui.ts'
import { familyPage } from './pages/family.ts'
import { staffPage, loginPage, conflictsPage } from './pages/staff.ts'
import { adminPage, paperSheetPage, printPage } from './pages/admin.ts'
import { villagePage } from './pages/village.ts'

seedIfEmpty()

// 首次启动把 content/settings.json 灌进库（之后以后台编辑为准）
for (const [k, v] of Object.entries(readSettingsFile())) {
  if (!allSettings()[k]) setSetting(k, String(v))
}

const app = new Hono()

// ---------------- 安全 & 缓存中间件 ----------------

app.use('*', async (c, next) => {
  await next()
  c.header('x-content-type-options', 'nosniff')
  c.header('x-frame-options', 'SAMEORIGIN')
  const p = c.req.path
  // token 在 URL 里 → 禁止外链 referer 泄露（DESIGN §13）
  if (p.startsWith('/v/')) c.header('referrer-policy', 'no-referrer')
  // HTML/接口一律 no-store：否则安卓微信秒开旧页面，会重复核销（DESIGN §15.1）
  const noStore =
    p.startsWith('/v/') ||
    p.startsWith('/staff') ||
    p.startsWith('/ops') ||
    p.startsWith('/admin') ||
    p.startsWith('/api/') ||
    p === '/'
  if (noStore) c.header('cache-control', 'no-store, must-revalidate')
})

// 访问日志脱敏：/v/<token> 只记前 8 位
app.use('*', async (c, next) => {
  const start = Date.now()
  await next()
  const p = c.req.path
  const safe = p.replace(/(\/(?:api\/)?v\/)([A-Z2-7]{8})[A-Z2-7]*/g, '$1$2…')
  const ms = Date.now() - start
  if (config.isProd) console.log(`${c.req.method} ${safe} ${c.res.status} ${ms}ms`)
  else if (!p.startsWith('/assets/')) console.log(`${c.req.method} ${safe} ${c.res.status} ${ms}ms`)
})

// ---------------- 静态 ----------------

// /assets/* → ./public/*（去掉 /assets 前缀，否则会去找 public/assets/…）
app.use(
  '/assets/*',
  serveStatic({
    root: './public',
    rewriteRequestPath: (p) => p.replace(/^\/assets/, ''),
  }),
)
app.use('/manifest.webmanifest', serveStatic({ path: './public/manifest.webmanifest' }))
// SW 必须在根路径可达（scope 才能覆盖 /staff 与 /assets）
app.use('/sw.js', serveStatic({ path: './public/sw.js' }))

// ---------------- 页面 ----------------

app.get('/', (c) => {
  return c.html(villagePage())
})

app.get('/v/:token', (c) => {
  const f = getFamilyByToken(c.req.param('token'))
  if (!f) {
    return c.html(errorPage('找不到这张卡', '这个链接可能已经失效，或者二维码没扫全。'), 404)
  }
  const staff = currentStaff(c)
  if (!staff) return c.html(villagePage(f))
  const s = allSettings()
  const all = listFamilies()
  const idx = all.findIndex((x) => x.id === f.id)
  return c.html(
    familyPage({
      family: f,
      staff,
      contactName: s.contactName ?? '小林',
      giftName: s.giftName ?? '村民礼品',
      refresh: c.req.query('r') !== undefined,
      neighbors: {
        prev: idx > 0 ? all[idx - 1]! : null,
        next: idx >= 0 && idx < all.length - 1 ? all[idx + 1]! : null,
      },
    }),
  )
})

app.get('/v/:token/map', (c) => {
  const f = getFamilyByToken(c.req.param('token'))
  if (!f) return c.html(errorPage('找不到这张卡', '这个链接可能已经失效。'), 404)
  return c.html(villagePage(f, 'map'))
})

app.get('/map', (c) => c.html(villagePage(null, 'map')))
app.get('/camp-map', (c) => c.html(villagePage(null, 'campmap')))
app.get('/guestbook', (c) => c.html(villagePage(null, 'guestbook')))

for (const [path, view] of [
  ['/tips', 'tips'], ['/charter', 'rules'], ['/nearby', 'tips'],
] as const) {
  app.get(path, (c) => {
    return c.html(villagePage(null, view))
  })
}

// ---------------- 工作人员 ----------------

app.get('/ops/login', (c) => {
  if (currentStaff(c)) return c.redirect('/ops')
  return c.html(loginPage({ error: c.req.query('e') ?? undefined }))
})

app.post('/ops/login', async (c) => {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
  const { findStaffByPin, loginBlocked, recordLoginAttempt } = await import('./db.ts')
  if (loginBlocked(ip)) return c.redirect('/ops/login?e=' + encodeURIComponent('试太多次了，等 5 分钟'))
  const body = await c.req.parseBody()
  const pin = String(body.pin ?? '')
  const staff = findStaffByPin(pin)
  recordLoginAttempt(ip, !!staff)
  if (!staff) return c.redirect('/ops/login?e=' + encodeURIComponent('PIN 不对'))
  issueSession(c, staff)
  return c.redirect('/ops')
})

// 旧入口兼容：公开页面不展示此地址，已有书签继续可用。
app.get('/staff/login', (c) => c.redirect('/ops/login', 301))
app.get('/staff', (c) => c.redirect('/ops', 301))
app.get('/staff/logout', (c) => c.redirect('/ops/logout', 301))

app.get('/ops/logout', (c) => {
  clearSession(c)
  return c.redirect('/ops/login')
})

app.get('/ops', (c) => {
  const staff = currentStaff(c)
  if (!staff) return c.redirect('/ops/login')
  const tab = c.req.query('tab') === 'all' ? 'all' : 'pending'
  return c.html(
    staffPage({
      staff,
      families: listFamilies(),
      summary: summary(),
      tab,
      query: '',
    }),
  )
})

app.get('/ops/lookup', (c) => {
  const staff = currentStaff(c)
  if (!staff) return c.redirect('/ops/login')
  const q = (c.req.query('q') ?? '').trim()
  if (!q) return c.redirect('/ops')

  try {
    const scanned = new URL(q, config.baseUrl)
    const token = /^\/v\/([A-Z2-7]{32})\/?$/.exec(scanned.pathname)?.[1]
    if (scanned.origin === new URL(config.baseUrl).origin && token && getFamilyByToken(token)) {
      return c.redirect('/v/' + token)
    }
  } catch { /* Continue with a family code or name. */ }

  const padded = /^\d{1,3}$/.test(q) ? q.padStart(3, '0') : q
  let f = getFamilyByCode(padded)
  if (!f) {
    const all = listFamilies()
    f =
      all.find((x) => x.display_name.toLowerCase() === q.toLowerCase()) ??
      all.find((x) => x.display_name.toLowerCase().includes(q.toLowerCase())) ??
      all.find((x) => (x.head_name ?? '').toLowerCase().includes(q.toLowerCase())) ??
      null
  }
  if (!f) {
    return c.html(
      layout(
        { title: '没找到', noindex: true, bodyClass: 'is-staff' },
        html`${staffTop(staff)}<main class="center-box"><div class="empty">
  <h1>没找到「${q}」</h1>
  <p>编号要三位，比如 <code>005</code>。</p>
  <a class="btn btn--ghost" href="/ops">回到清单</a>
</div></main>`,
      ),
      404,
    )
  }
  return c.redirect(`/v/${f.token}`)
})

app.get('/ops/conflicts', (c) => {
  const staff = currentStaff(c)
  if (!staff) return c.redirect('/ops/login')
  return c.html(conflictsPage({ staff, conflicts: listConflicts() as never }))
})

app.post('/ops/conflicts/:opId/resolve', async (c) => {
  const staff = currentStaff(c)
  if (!staff) return c.redirect('/ops/login')
  const body = await c.req.parseBody()
  const resolution = body.resolution === 'void' ? 'void' : 'keep'
  resolveConflict(c.req.param('opId'), resolution, staff)
  return c.redirect('/ops/conflicts')
})

const staffTop = (staff: Staff) => html`<header class="staffbar">
  <a class="staffbar__back" href="/ops">← 清单</a>
  <span class="staffbar__mode">${staff.name}</span>
  <a class="staffbar__exit" href="/ops/logout">退出</a>
</header>`

// ---------------- 管理 ----------------

function requireAdmin(c: Context): Staff | null {
  const s = currentStaff(c)
  return s && s.role === 'admin' ? s : null
}

app.get('/admin/guestbook', (c) => {
  if (!requireAdmin(c)) return c.redirect('/ops/login')
  const messages = db.prepare('SELECT id,name,message,created_ms FROM guest_messages WHERE hidden=0 ORDER BY id DESC LIMIT 100').all() as { id: number; name: string; message: string; created_ms: number }[]
  return c.html(layout({ title: '留言管理', noindex: true, bodyClass: 'is-staff' }, html`
    <header class="staffbar"><a href="/admin">← 后台</a><span>留言管理</span></header>
    <main class="staff-list"><h1>村民留言</h1>${messages.length ? messages.map(m => html`<article class="admin-block"><h2>${m.name}</h2><p class="moderation-message">${m.message}</p><small>${new Date(m.created_ms).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</small><form method="post" action="/admin/guestbook/${m.id}/hide"><button class="btn btn--ghost" type="submit">隐藏这条留言</button></form></article>`) : html`<p>暂无留言。</p>`}</main>`))
})

app.post('/admin/guestbook/:id/hide', (c) => {
  if (!requireAdmin(c)) return c.redirect('/ops/login')
  db.prepare('UPDATE guest_messages SET hidden=1 WHERE id=?').run(c.req.param('id'))
  return c.redirect('/admin/guestbook')
})

app.get('/admin', (c) => {
  const staff = requireAdmin(c)
  if (!staff) return c.redirect('/ops/login')
  return c.html(
    adminPage({
      staff,
      families: listFamilies(true),
      summary: summary(),
      settings: allSettings(),
      imported: c.req.query('ok') ?? undefined,
    }),
  )
})

app.post('/admin/import', async (c) => {
  const staff = requireAdmin(c)
  if (!staff) return c.redirect('/ops/login')
  const body = await c.req.parseBody()
  const file = body.csv
  if (file && typeof file !== 'string') {
    const text = await (file as File).text()
    const res = importCsv(text)
    return c.redirect(
      '/admin?ok=' + encodeURIComponent(`导入完成：新增 ${res.inserted}，更新 ${res.updated}`),
    )
  }
  return c.redirect('/admin')
})

app.post('/admin/settings', async (c) => {
  const staff = requireAdmin(c)
  if (!staff) return c.redirect('/ops/login')
  const body = await c.req.parseBody()
  for (const k of ['eventName', 'eventSubtitle', 'giftName', 'contactName']) {
    if (typeof body[k] === 'string') setSetting(k, String(body[k]))
  }
  return c.redirect('/admin?ok=' + encodeURIComponent('设置已保存'))
})

app.post('/admin/backfill', async (c) => {
  const staff = requireAdmin(c)
  if (!staff) return c.redirect('/ops/login')
  const body = await c.req.parseBody()
  const code = String(body.code ?? '').trim().padStart(3, '0')
  const type = String(body.type ?? 'both')
  const f = getFamilyByCode(code)
  if (!f) return c.redirect('/admin?ok=' + encodeURIComponent(`没找到编号 ${code}`))

  const types = type === 'both' ? ['checkin', 'gift'] : [type]
  const groupId = crypto.randomUUID()
  const ops = types.map((t) => ({
    op_id: crypto.randomUUID(),
    group_id: groupId,
    token: f.token,
    type: t,
    client_ms: Date.now(),
    device_id: 'backfill',
  }))
  submitOps(ops as never[], staff)
  return c.redirect('/admin?ok=' + encodeURIComponent(`已补录 ${code} ${f.display_name}`))
})

app.get('/admin/print', async (c) => {
  const staff = requireAdmin(c)
  if (!staff) return c.redirect('/ops/login')
  const families = await Promise.all(
    listFamilies().map(async (f) => ({
      ...f,
      qr: await QRCode.toString(`${config.baseUrl}/v/${f.token}`, {
        type: 'svg',
        errorCorrectionLevel: 'H',
        margin: 0,
        width: 240,
        color: { dark: '#2E2418', light: '#0000' },
      }),
    })),
  )
  return c.html(
    printPage({
      families,
      staff,
      baseUrl: config.baseUrl,
      warnLocalUrl: config.baseUrlIsLocal,
    }),
  )
})

app.get('/admin/paper', (c) => {
  const staff = requireAdmin(c)
  if (!staff) return c.redirect('/ops/login')
  return c.html(paperSheetPage({ families: listFamilies() }))
})

// ---------------- 杂项 ----------------

app.route('/api', api)

app.get('/healthz', (c) =>
  c.json({ ok: true, families: listFamilies().length, baseUrlOk: !config.baseUrlIsLocal }),
)

app.notFound((c) =>
  c.html(errorPage('页面不存在', '这个地址没有对应的内容。'), 404),
)

app.onError((err, c) => {
  console.error('ERR', err)
  return c.html(errorPage('出了点问题', '刷新一下试试；如果还不行，找服务站。'), 500)
})

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`\n  Retro Village 村民服务站`)
  console.log(`  → http://localhost:${info.port}`)
  console.log(`  baseUrl: ${config.baseUrl}\n`)
})
