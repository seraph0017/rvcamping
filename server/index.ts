import { Hono, type Context } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { html, raw } from 'hono/html'
import QRCode from 'qrcode'

import { config } from './config.ts'
import {
  allSettings,
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
import { contentShell, errorPage, layout } from './ui.ts'
import { familyPage } from './pages/family.ts'
import { homePage } from './pages/home.ts'
import { mapPage } from './pages/map.ts'
import { staffPage, loginPage, conflictsPage } from './pages/staff.ts'
import { adminPage, paperSheetPage, printPage } from './pages/admin.ts'

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
  const safe = p.startsWith('/v/')
    ? p.replace(/^\/v\/([A-Z2-7]{8})[A-Z2-7]*/, '/v/$1…')
    : p
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
  const s = allSettings()
  return c.html(
    homePage({
      eventName: s.eventName ?? 'Retro Village 复古露营',
      subtitle: s.eventSubtitle ?? '一月一露 · 西郊林场',
      contactName: s.contactName ?? '小林',
    }),
  )
})

app.get('/v/:token', (c) => {
  const f = getFamilyByToken(c.req.param('token'))
  if (!f) {
    return c.html(errorPage('找不到这张卡', '这个链接可能已经失效，或者二维码没扫全。'), 404)
  }
  const staff = currentStaff(c)
  const s = allSettings()
  return c.html(
    familyPage({
      family: f,
      staff,
      contactName: s.contactName ?? '小林',
      giftName: s.giftName ?? '村民礼品',
      refresh: c.req.query('r') !== undefined,
    }),
  )
})

app.get('/v/:token/map', (c) => {
  const f = getFamilyByToken(c.req.param('token'))
  if (!f) return c.html(errorPage('找不到这张卡', '这个链接可能已经失效。'), 404)
  return c.html(mapPage({ families: listFamilies(), self: f }))
})

app.get('/map', (c) => c.html(mapPage({ families: listFamilies(), self: null })))

for (const [path, file, title] of [
  ['/tips', 'tips.md', '营地 TIPS'],
  ['/charter', 'charter.md', '村庄公约'],
  ['/nearby', 'nearby.md', '周边推荐'],
] as const) {
  app.get(path, (c) => {
    const doc = readDoc(file, title)
    return c.html(
      contentShell(
        doc.title,
        doc.subtitle,
        html`${raw(doc.body)}${doc.updated ? html`<p class="prose-updated">更新于 ${doc.updated}</p>` : ''}`,
      ),
    )
  })
}

// ---------------- 工作人员 ----------------

app.get('/staff/login', (c) => {
  if (currentStaff(c)) return c.redirect('/staff')
  return c.html(loginPage({ error: c.req.query('e') ?? undefined }))
})

app.post('/staff/login', async (c) => {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
  const { findStaffByPin, loginBlocked, recordLoginAttempt } = await import('./db.ts')
  if (loginBlocked(ip)) return c.redirect('/staff/login?e=' + encodeURIComponent('试太多次了，等 5 分钟'))
  const body = await c.req.parseBody()
  const pin = String(body.pin ?? '')
  const staff = findStaffByPin(pin)
  recordLoginAttempt(ip, !!staff)
  if (!staff) return c.redirect('/staff/login?e=' + encodeURIComponent('PIN 不对'))
  issueSession(c, staff)
  return c.redirect('/staff')
})

app.get('/staff/logout', (c) => {
  clearSession(c)
  return c.redirect('/staff/login')
})

app.get('/staff', (c) => {
  const staff = currentStaff(c)
  if (!staff) return c.redirect('/staff/login')
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

app.get('/staff/lookup', (c) => {
  const staff = currentStaff(c)
  if (!staff) return c.redirect('/staff/login')
  const q = (c.req.query('q') ?? '').trim()
  if (!q) return c.redirect('/staff')

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
  <a class="btn btn--ghost" href="/staff">回到清单</a>
</div></main>`,
      ),
      404,
    )
  }
  return c.redirect(`/v/${f.token}`)
})

app.get('/staff/conflicts', (c) => {
  const staff = currentStaff(c)
  if (!staff) return c.redirect('/staff/login')
  return c.html(conflictsPage({ staff, conflicts: listConflicts() as never }))
})

app.post('/staff/conflicts/:opId/resolve', async (c) => {
  const staff = currentStaff(c)
  if (!staff) return c.redirect('/staff/login')
  const body = await c.req.parseBody()
  const resolution = body.resolution === 'void' ? 'void' : 'keep'
  resolveConflict(c.req.param('opId'), resolution, staff)
  return c.redirect('/staff/conflicts')
})

const staffTop = (staff: Staff) => html`<header class="staffbar">
  <a class="staffbar__back" href="/staff">← 清单</a>
  <span class="staffbar__mode">${staff.name}</span>
  <a class="staffbar__exit" href="/staff/logout">退出</a>
</header>`

// ---------------- 管理 ----------------

function requireAdmin(c: Context): Staff | null {
  const s = currentStaff(c)
  return s && s.role === 'admin' ? s : null
}

app.get('/admin', (c) => {
  const staff = requireAdmin(c)
  if (!staff) return c.redirect('/staff/login')
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
  if (!staff) return c.redirect('/staff/login')
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
  if (!staff) return c.redirect('/staff/login')
  const body = await c.req.parseBody()
  for (const k of ['eventName', 'eventSubtitle', 'giftName', 'contactName']) {
    if (typeof body[k] === 'string') setSetting(k, String(body[k]))
  }
  return c.redirect('/admin?ok=' + encodeURIComponent('设置已保存'))
})

app.post('/admin/backfill', async (c) => {
  const staff = requireAdmin(c)
  if (!staff) return c.redirect('/staff/login')
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
  if (!staff) return c.redirect('/staff/login')
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
  if (!staff) return c.redirect('/staff/login')
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
