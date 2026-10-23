import { Hono, type Context } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'

import { config } from './config.ts'
import {
  allSettings,
  findStaffByPin,
  importCsv,
  listFamilies,
  loginBlocked,
  recordLoginAttempt,
  seedIfEmpty,
  setSetting,
  type Staff,
} from './db.ts'
import { api, clearSession, currentStaff, issueSession } from './api.ts'
import { readSettingsFile } from './content.ts'
import { errorPage } from './ui.ts'
import { hideMessage, visibleMessages } from './messages.ts'
import {
  adminLoginPage,
  guestbookAdminPage,
  informationAdminPage,
  signatureSheets,
} from './pages/information-admin.ts'
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
  if (p.startsWith('/v/')) c.header('referrer-policy', 'no-referrer')
  // 活动期间页面与接口一律不缓存，避免微信内置浏览器展示旧内容。
  const noStore =
    p.startsWith('/v/') ||
    p.startsWith('/staff') ||
    p.startsWith('/ops') ||
    p.startsWith('/admin') ||
    p.startsWith('/forms/') ||
    p.startsWith('/api/') ||
    p === '/'
  if (noStore) c.header('cache-control', 'no-store, must-revalidate')
})

// 访问日志脱敏：旧 /v/<token> 链接只记前 8 位。
app.use('*', async (c, next) => {
  const start = Date.now()
  await next()
  const p = c.req.path
  const safe = p.replace(/(\/(?:api\/)?v\/)([A-Z2-7]{8})[A-Z2-7]*/g, '$1$2…')
  const ms = Date.now() - start
  if (config.isProd || !p.startsWith('/assets/')) {
    console.log(`${c.req.method} ${safe} ${c.res.status} ${ms}ms`)
  }
})

// ---------------- 静态 ----------------

app.use(
  '/assets/*',
  serveStatic({
    root: './public',
    rewriteRequestPath: (p) => p.replace(/^\/assets/, ''),
  }),
)
app.use('/manifest.webmanifest', serveStatic({ path: './public/manifest.webmanifest' }))
app.use('/sw.js', serveStatic({ path: './public/sw.js' }))

// ---------------- 公开公告站 ----------------

app.get('/', (c) => c.html(villagePage()))

// 旧村民卡链接全部回到公告首页；不再展示电子卡、二维码或签到状态。
app.get('/v/:token', (c) => c.redirect('/', 302))
app.get('/v/:token/map', (c) => c.redirect('/', 302))

app.get('/map', (c) => c.html(villagePage('map')))
app.get('/camp-map', (c) => c.html(villagePage('campmap')))
app.get('/guestbook', (c) => c.html(villagePage('guestbook')))
app.get('/schedule', (c) => c.html(villagePage('schedule')))

for (const [path, view] of [
  ['/tips', 'tips'],
  ['/charter', 'rules'],
  ['/nearby', 'tips'],
] as const) {
  app.get(path, (c) => c.html(villagePage(view)))
}

// ---------------- 纸质签领表 ----------------

// 空白 A4 模板，公开可打印；现场只签字，不做电子核销。
app.get('/forms/signatures', (c) => c.html(signatureSheets()))

// ---------------- 管理后台 ----------------

function requireAdmin(c: Context): Staff | null {
  const s = currentStaff(c)
  return s && s.role === 'admin' ? s : null
}

app.get('/admin/login', (c) => {
  if (requireAdmin(c)) return c.redirect('/admin')
  return c.html(adminLoginPage(c.req.query('e') ?? undefined))
})

app.post('/admin/login', async (c) => {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
  if (loginBlocked(ip)) {
    return c.redirect('/admin/login?e=' + encodeURIComponent('试太多次了，等 5 分钟'))
  }
  const body = await c.req.parseBody()
  const staff = findStaffByPin(String(body.pin ?? ''))
  recordLoginAttempt(ip, !!staff)
  if (!staff || staff.role !== 'admin') {
    return c.redirect('/admin/login?e=' + encodeURIComponent('管理员 PIN 不对'))
  }
  issueSession(c, staff)
  return c.redirect('/admin')
})

app.get('/admin/logout', (c) => {
  clearSession(c)
  return c.redirect('/')
})

app.get('/admin', (c) => {
  const staff = requireAdmin(c)
  if (!staff) return c.redirect('/admin/login')
  return c.html(informationAdminPage(staff, listFamilies(true), c.req.query('ok') ?? undefined))
})

app.post('/admin/import', async (c) => {
  if (!requireAdmin(c)) return c.redirect('/admin/login')
  const body = await c.req.parseBody()
  const file = body.csv
  if (file && typeof file !== 'string') {
    const result = importCsv(await (file as File).text())
    return c.redirect(
      '/admin?ok=' +
        encodeURIComponent(`导入完成：新增 ${result.inserted}，更新 ${result.updated}`),
    )
  }
  return c.redirect('/admin?ok=' + encodeURIComponent('没有收到 CSV 文件'))
})

app.get('/admin/guestbook', (c) => {
  const staff = requireAdmin(c)
  if (!staff) return c.redirect('/admin/login')
  return c.html(guestbookAdminPage(staff, visibleMessages()))
})

app.post('/admin/guestbook/:id/hide', (c) => {
  if (!requireAdmin(c)) return c.redirect('/admin/login')
  hideMessage(c.req.param('id'))
  return c.redirect('/admin/guestbook')
})

// 旧电子流程入口：停用、跳转或明确返回 410，不再产生任何核销记录。
app.get('/ops', (c) => c.redirect('/', 302))
app.get('/ops/login', (c) => c.redirect('/admin/login', 302))
app.get('/ops/logout', (c) => {
  clearSession(c)
  return c.redirect('/', 302)
})
app.all('/ops/*', (c) => c.redirect('/', 302))

app.get('/staff/login', (c) => c.redirect('/admin/login', 302))
app.get('/staff', (c) => c.redirect('/', 302))
app.all('/staff/*', (c) => c.redirect('/', 302))

app.get('/admin/paper', (c) => c.redirect('/forms/signatures', 302))
app.all('/admin/backfill', (c) => c.text('电子补录已停用，请使用现场纸质签字表。', 410))
app.all('/admin/print', (c) => c.text('专属二维码已停用，请使用现场纸质签字表。', 410))
app.all('/admin/settings', (c) => c.text('该设置入口已停用。', 410))

// ---------------- 杂项 ----------------

app.route('/api', api)

app.get('/healthz', (c) =>
  c.json({ ok: true, families: listFamilies().length, baseUrlOk: !config.baseUrlIsLocal }),
)

app.notFound((c) => c.html(errorPage('页面不存在', '这个地址没有对应的内容。'), 404))

app.onError((err, c) => {
  console.error('ERR', err)
  return c.html(errorPage('出了点问题', '刷新一下试试；如果还不行，找服务站。'), 500)
})

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`\n  Retro Village 村民服务站`)
  console.log(`  → http://localhost:${info.port}`)
  console.log(`  baseUrl: ${config.baseUrl}\n`)
})
