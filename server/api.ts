import { Hono, type Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { config, createToken, readToken } from './config.ts'
import QRCode from 'qrcode'
import { bodyLimit } from 'hono/body-limit'
import {
  db,
  getFamilyByToken,
  toPublicCard,
  getSetting,
  listFamilies,
  loginBlocked,
  recordLoginAttempt,
  findStaffByPin,
  getStaff,
  type Staff,
} from './db.ts'
import {
  listConflicts,
  opIdsForDevice,
  resolveConflict,
  submitOps,
  summary,
  toCard,
  undoGroup,
  undoOp,
} from './ops.ts'

export type Session = { sid: number; v: number; exp: number }

const COOKIE_OPTS = {
  path: '/',
  httpOnly: true,
  sameSite: 'Lax' as const,
  secure: new URL(config.baseUrl).protocol === 'https:',
  maxAge: config.sessionDays * 24 * 3600,
}

/** 每次鉴权都回查数据库：active / session_version / role（DESIGN §13） */
export function currentStaff(c: Context): Staff | null {
  const raw = getCookie(c, config.cookieName)
  const payload = readToken<Session>(raw)
  if (!payload) return null
  if (!payload.exp || payload.exp < Date.now()) return null
  const s = getStaff(payload.sid)
  if (!s || s.active !== 1) return null
  if (s.session_version !== payload.v) return null // session_version++ 即吊销
  return s
}

export function issueSession(c: Context, staff: Staff) {
  const payload: Session = {
    sid: staff.id,
    v: staff.session_version,
    exp: Date.now() + config.sessionDays * 24 * 3600 * 1000,
  }
  setCookie(c, config.cookieName, createToken(payload), COOKIE_OPTS)
}

export function clearSession(c: Context) {
  deleteCookie(c, config.cookieName, { path: '/' })
}

export const api = new Hono()

// ---------------- 公开 ----------------

api.get('/v/:token', (c) => {
  const f = getFamilyByToken(c.req.param('token'))
  if (!f) return c.json({ error: 'not_found' }, 404)
  // 公开接口：永久剔除 phone / head_name / 操作人姓名
  return c.json({ family: toPublicCard(f) })
})

api.get('/v/:token/qr.svg', async (c) => {
  const f = getFamilyByToken(c.req.param('token'))
  if (!f) return c.json({ error: 'not_found' }, 404)
  const svg = await QRCode.toString(`${config.baseUrl}/v/${f.token}`, {
    type: 'svg', errorCorrectionLevel: 'M', margin: 4, width: 240,
    color: { dark: '#183653', light: '#ffffff' },
  })
  c.header('content-type', 'image/svg+xml')
  return c.body(svg)
})

api.get('/guestbook', (c) => {
  const messages = db.prepare(`SELECT id, name, message, created_ms FROM guest_messages
    WHERE hidden=0 ORDER BY id DESC LIMIT 100`).all()
  return c.json({ messages })
})

api.post('/guestbook', bodyLimit({ maxSize: 8192 }), async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'bad_json' }, 400)
  const f = typeof body.token === 'string' ? getFamilyByToken(body.token) : null
  if (!f) return c.json({ error: '请从专属村民卡进入后留言' }, 401)
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!message || message.length > 300 || name.length > 24) {
    return c.json({ error: '留言需为 1–300 字，称呼最多 24 字' }, 400)
  }
  const now = Date.now()
  // Synchronous read + insert in this single-process service: one message per family per 30s.
  const recent = db.prepare('SELECT id FROM guest_messages WHERE family_id=? AND created_ms>? LIMIT 1')
    .get(f.id, now - 30_000)
  if (recent) return c.json({ error: '留言已收到，请在 30 秒后再发布' }, 429)
  const result = db.prepare('INSERT INTO guest_messages(family_id,name,message,created_ms) VALUES(?,?,?,?)')
    .run(f.id, name || f.display_name.slice(0, 24), message, now)
  return c.json({ id: Number(result.lastInsertRowid), created_ms: now }, 201)
})

api.post('/admin/guestbook/:id/hide', (c) => {
  const staff = currentStaff(c)
  if (!staff || staff.role !== 'admin') return c.json({ error: 'forbidden' }, 403)
  const result = db.prepare('UPDATE guest_messages SET hidden=1 WHERE id=?').run(c.req.param('id'))
  return c.json({ ok: true, changed: Number(result.changes) })
})

api.get('/map', (c) => {
  const rows = listFamilies().map((f) => ({
    code: f.code,
    display_name: f.display_name,
    campsite: f.campsite,
  }))
  return c.json({ families: rows })
})

// ---------------- 工作人员 ----------------

api.post('/staff/login', async (c) => {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
  if (loginBlocked(ip)) return c.json({ error: 'too_many_attempts' }, 429)

  let pin = ''
  const ct = c.req.header('content-type') ?? ''
  if (ct.includes('application/json')) {
    const body = (await c.req.json().catch(() => ({}))) as { pin?: string }
    pin = String(body.pin ?? '')
  } else {
    const body = await c.req.parseBody()
    pin = String(body.pin ?? '')
  }
  const staff = findStaffByPin(pin)
  recordLoginAttempt(ip, !!staff)
  if (!staff) return c.json({ error: 'bad_pin' }, 401)
  issueSession(c, staff)
  return c.json({ ok: true, name: staff.name, role: staff.role })
})

api.post('/staff/logout', (c) => {
  clearSession(c)
  return c.json({ ok: true })
})

api.get('/staff/snapshot', (c) => {
  const staff = currentStaff(c)
  if (!staff) return c.json({ error: 'unauthorized' }, 401)
  // 离线预载必需：不含 phone（DESIGN §13）
  const families = listFamilies().map((f) => ({
    code: f.code,
    token: f.token,
    display_name: f.display_name,
    head_name: f.head_name,
    party_size: f.party_size,
    campsite: f.campsite,
    checkin_at: f.checkin_ms,
    checkin_by: f.checkin_by,
    gift_at: f.gift_ms,
    gift_by: f.gift_by,
  }))
  return c.json({
    families,
    summary: summary(),
    settings: {
      giftName: getSetting('giftName', '村民礼品'),
      contactName: getSetting('contactName', '小林'),
    },
    version: 1,
    generated_at: Date.now(),
  })
})

api.post('/ops', async (c) => {
  const staff = currentStaff(c)
  if (!staff) {
    // 离线时可能没网，但仍然必须拒绝未授权写入
    return c.json({ error: 'unauthorized' }, 401)
  }
  let list: unknown = []
  try {
    const body = (await c.req.json()) as unknown
    list = Array.isArray(body) ? body : (body as { ops?: unknown }).ops ?? []
  } catch {
    return c.json({ error: 'bad_json' }, 400)
  }
  if (!Array.isArray(list)) return c.json({ error: 'expect_array' }, 400)
  const results = submitOps(list as never[], staff)
  return c.json({ results })
})

api.post('/ops/:opId/undo', (c) => {
  const staff = currentStaff(c)
  if (!staff) return c.json({ error: 'unauthorized' }, 401)
  const res = undoOp(c.req.param('opId'), staff, { ignoreWindow: staff.role === 'admin' })
  if (!res.ok && res.reason === 'not_found') {
    // 未知 op：客户端视为「无需撤销」，不阻塞队列
    return c.json({ ok: true, note: 'unknown_op' })
  }
  return c.json(res, res.ok ? 200 : 409)
})

api.post('/groups/:groupId/undo', (c) => {
  const staff = currentStaff(c)
  if (!staff) return c.json({ error: 'unauthorized' }, 401)
  const res = undoGroup(c.req.param('groupId'), staff, { ignoreWindow: staff.role === 'admin' })
  return c.json(res, res.ok ? 200 : 409)
})

api.get('/staff/summary', (c) => {
  const staff = currentStaff(c)
  if (!staff) return c.json({ error: 'unauthorized' }, 401)
  return c.json(summary())
})

api.get('/staff/search', (c) => {
  const staff = currentStaff(c)
  if (!staff) return c.json({ error: 'unauthorized' }, 401)
  const q = (c.req.query('q') ?? '').trim().toLowerCase()
  if (!q) return c.json({ results: [] })
  const results = listFamilies()
    .filter(
      (f) =>
        f.code.includes(q) ||
        f.display_name.toLowerCase().includes(q) ||
        (f.head_name ?? '').toLowerCase().includes(q),
    )
    .slice(0, 10)
    .map((f) => ({ code: f.code, token: f.token, display_name: f.display_name, campsite: f.campsite }))
  return c.json({ results })
})

api.get('/staff/conflicts', (c) => {
  const staff = currentStaff(c)
  if (!staff) return c.json({ error: 'unauthorized' }, 401)
  return c.json({ conflicts: listConflicts() })
})

api.post('/staff/conflicts/:opId/resolve', async (c) => {
  const staff = currentStaff(c)
  if (!staff) return c.json({ error: 'unauthorized' }, 401)
  const body = (await c.req.json().catch(() => ({}))) as { resolution?: string }
  const resolution = body.resolution === 'void' ? 'void' : 'keep'
  const res = resolveConflict(c.req.param('opId'), resolution, staff)
  return c.json(res, res.ok ? 200 : 404)
})

api.get('/staff/sync-status', (c) => {
  const staff = currentStaff(c)
  if (!staff) return c.json({ error: 'unauthorized' }, 401)
  const device = c.req.query('device_id') ?? ''
  const ids = device ? opIdsForDevice(device) : []
  return c.json({ device_id: device, op_ids: ids, count: ids.length })
})

/** 导出：一家庭一行，恒 35 行（DESIGN §11.2） */
api.get('/staff/export.csv', (c) => {
  const staff = currentStaff(c)
  if (!staff) return c.redirect('/staff/login')
  const families = listFamilies()
  const s = summary()
  const iso = (ms: number | null) => (ms ? new Date(ms).toISOString() : '')
  const head = [
    `# 导出时间 ${new Date().toISOString()}`,
    `# 服务端已收有效记录：签到 ${s.checkedIn} / 礼品 ${s.giftGiven}（共 ${s.total} 家）`,
    `# 仅含已同步记录。若现场有设备未联网，此文件不完整——请先在各设备确认「0 条待同步」`,
  ].join('\n')
  const rows = [
    'code,family,head_name,campsite,party_size,checkin_at,checkin_by,gift_at,gift_by,conflict_pending,note',
    ...families.map((f) =>
      [
        f.code,
        csvCell(f.display_name),
        csvCell(f.head_name ?? ''),
        f.campsite ?? '',
        f.party_size,
        iso(f.checkin_ms),
        csvCell(f.checkin_by ?? ''),
        iso(f.gift_ms),
        csvCell(f.gift_by ?? ''),
        '',
        csvCell(f.note ?? ''),
      ].join(','),
    ),
  ]
  c.header('content-type', 'text/csv; charset=utf-8')
  c.header('content-disposition', `attachment; filename="rvcamping-families.csv"`)
  return c.body(`\uFEFF${head}\n${rows.join('\n')}\n`)
})

/** 原始流水（admin） */
api.get('/admin/export-ops.csv', (c) => {
  const staff = currentStaff(c)
  if (!staff || staff.role !== 'admin') return c.redirect('/staff/login')
  const rows = db
    .prepare(
      `SELECT o.seq,o.op_id,o.group_id,f.code,f.display_name,o.type,o.actor_name,o.device_id,
              o.client_ms,o.server_ms,o.state,o.conflict,o.late_sync,o.resolution
       FROM ops o JOIN families f ON f.id=o.family_id ORDER BY o.seq`,
    )
    .all() as Record<string, unknown>[]
  const head = 'seq,op_id,group_id,code,family,type,actor,device_id,client_iso,server_iso,state,conflict,late_sync,resolution'
  const lines = rows.map((r) =>
    [
      r.seq,
      r.op_id,
      r.group_id ?? '',
      r.code,
      csvCell(String(r.display_name)),
      r.type,
      csvCell(String(r.actor_name)),
      r.device_id ?? '',
      new Date(Number(r.client_ms)).toISOString(),
      new Date(Number(r.server_ms)).toISOString(),
      r.state,
      r.conflict,
      r.late_sync,
      r.resolution ?? '',
    ].join(','),
  )
  c.header('content-type', 'text/csv; charset=utf-8')
  c.header('content-disposition', `attachment; filename="rvcamping-ops.csv"`)
  return c.body(`\uFEFF${head}\n${lines.join('\n')}\n`)
})

function csvCell(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

