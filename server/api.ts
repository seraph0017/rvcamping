import { Hono, type Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { bodyLimit } from 'hono/body-limit'
import { createHmac, randomUUID } from 'node:crypto'

import { config, createToken, readToken } from './config.ts'
import { db, getStaff, listFamilies, type Staff } from './db.ts'
import { hideMessage, visibleMessages } from './messages.ts'

export type Session = { sid: number; v: number; exp: number }

const COOKIE_OPTS = {
  path: '/',
  httpOnly: true,
  sameSite: 'Lax' as const,
  secure: new URL(config.baseUrl).protocol === 'https:',
  maxAge: config.sessionDays * 24 * 3600,
}

const VISITOR_COOKIE = 'rv_visitor'
const VISITOR_OPTS = {
  path: '/',
  httpOnly: true,
  sameSite: 'Lax' as const,
  secure: new URL(config.baseUrl).protocol === 'https:',
  maxAge: 365 * 24 * 3600,
}

/** 每次鉴权都回查数据库：active / session_version / role */
export function currentStaff(c: Context): Staff | null {
  const raw = getCookie(c, config.cookieName)
  const payload = readToken<Session>(raw)
  if (!payload) return null
  if (!payload.exp || payload.exp < Date.now()) return null
  const s = getStaff(payload.sid)
  if (!s || s.active !== 1) return null
  if (s.session_version !== payload.v) return null
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

function visitorKey(c: Context): string {
  const current = getCookie(c, VISITOR_COOKIE)
  if (current && /^[A-Za-z0-9_-]{16,64}$/.test(current)) return current
  const next = randomUUID().replaceAll('-', '')
  setCookie(c, VISITOR_COOKIE, next, VISITOR_OPTS)
  return next
}

function ipKey(c: Context): string {
  const ip =
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip')?.trim() ||
    'local'
  return createHmac('sha256', config.secret).update(ip).digest('hex').slice(0, 32)
}

function charCount(value: string): number {
  return Array.from(value).length
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export const api = new Hono()

// ---------------- 公开留言板 ----------------

api.get('/guestbook', (c) => c.json({ messages: visibleMessages() }))

api.post('/guestbook', bodyLimit({ maxSize: 8192 }), async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'bad_json' }, 400)

  const input = body as { name?: unknown; message?: unknown }
  const message = typeof input.message === 'string' ? input.message.trim() : ''
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!message || charCount(message) > 300 || charCount(name) > 24) {
    return c.json({ error: '留言需为 1–300 字，称呼最多 24 字' }, 400)
  }

  const now = Date.now()
  const visitor = visitorKey(c)
  const ip = ipKey(c)

  const recentVisitor = db
    .prepare('SELECT id FROM public_messages WHERE visitor_key=? AND created_ms>? LIMIT 1')
    .get(visitor, now - 30_000)
  if (recentVisitor) return c.json({ error: '留言已收到，请在 30 秒后再发布' }, 429)

  const recentIp = db
    .prepare('SELECT COUNT(*) AS n FROM public_messages WHERE ip_key=? AND created_ms>?')
    .get(ip, now - 10 * 60_000) as { n: number }
  if (recentIp.n >= 10) return c.json({ error: '这个网络留言太频繁了，请稍后再试' }, 429)

  const result = db
    .prepare(
      'INSERT INTO public_messages(visitor_key,ip_key,name,message,created_ms) VALUES(?,?,?,?,?)',
    )
    .run(visitor, ip, name || '匿名村民', message, now)
  return c.json({ id: `public:${Number(result.lastInsertRowid)}`, created_ms: now }, 201)
})

// ---------------- 管理 ----------------

api.post('/admin/guestbook/:id/hide', (c) => {
  const staff = currentStaff(c)
  if (!staff || staff.role !== 'admin') return c.json({ error: 'forbidden' }, 403)
  return c.json({ ok: true, changed: hideMessage(c.req.param('id')) })
})

api.get('/admin/export-families.csv', (c) => {
  const staff = currentStaff(c)
  if (!staff || staff.role !== 'admin') return c.json({ error: 'forbidden' }, 403)
  const rows = listFamilies(true)
  const header = 'code,family,head_name,campsite,party_size,kids,phone,note'
  const lines = rows.map((f) =>
    [
      f.code,
      csvCell(f.display_name),
      csvCell(f.head_name ?? ''),
      csvCell(f.campsite ?? ''),
      f.party_size,
      f.kids,
      csvCell(f.phone ?? ''),
      csvCell(f.note ?? ''),
    ].join(','),
  )
  c.header('content-type', 'text/csv; charset=utf-8')
  c.header('content-disposition', 'attachment; filename="rvcamping-families.csv"')
  return c.body(`\uFEFF${header}\n${lines.join('\n')}\n`)
})

api.get('/map', (c) => {
  const rows = listFamilies().map((f) => ({
    code: f.code,
    display_name: f.display_name,
    campsite: f.campsite,
  }))
  return c.json({ families: rows })
})

// ---------------- 已停用的电子核销接口 ----------------

const retired = (c: Context) =>
  c.json({ error: 'retired', message: '电子核销已停用，请使用现场纸质签字表。' }, 410)

api.all('/ops', retired)
api.all('/v/:token', retired)
api.all('/v/:token/qr.svg', retired)
api.all('/groups/:id/undo', retired)
api.all('/admin/export-ops.csv', retired)
api.all('/staff', retired)
api.all('/staff/*', retired)
