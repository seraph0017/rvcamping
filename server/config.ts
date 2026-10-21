import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

function loadOrCreateSecret(): string {
  const fromEnv = process.env.SESSION_SECRET
  if (fromEnv) return fromEnv
  const p = 'data/secret.key'
  if (existsSync(p)) return readFileSync(p, 'utf8').trim()
  mkdirSync(dirname(p), { recursive: true })
  const s = randomBytes(32).toString('base64url')
  writeFileSync(p, s, { mode: 0o600 })
  return s
}

const envPort = process.env.PORT ?? 3000
const rawBaseUrl = process.env.BASE_URL ?? `http://localhost:${envPort}`

/**
 * BASE_URL 决定二维码里印什么地址。
 * 没设 → 会印出 localhost，35 张卡全废且**没有任何报错**，这是最危险的一类静默故障。
 * 所以投产前必须拦住。
 */
const baseUrlIsLocal = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(rawBaseUrl)

export const config = {
  port: Number(envPort),
  /** 用于二维码里的绝对地址。生产必须设成 https 域名。 */
  baseUrl: rawBaseUrl.replace(/\/$/, ''),
  baseUrlIsLocal,
  dbPath: process.env.DB_PATH ?? 'data/app.db',
  secret: loadOrCreateSecret(),
  /** 工作人员 PIN。生产用环境变量覆盖。 */
  staffPin: process.env.STAFF_PIN ?? '2580',
  cookieName: 'rv_session',
  sessionDays: 30,
  /** 撤销窗口（秒），管理员不受限 */
  undoWindowSec: 300,
  isProd: process.env.NODE_ENV === 'production',
}

// 生产环境用了 localhost 地址 → 直接拒绝启动，别让它静默印废卡
if (config.isProd && config.baseUrlIsLocal) {
  console.error('\n[致命] BASE_URL 未设置或指向 localhost：', config.baseUrl)
  console.error('二维码会印成内网地址，35 张卡全部无法扫描。')
  console.error('请设置 BASE_URL=https://你的域名 后重启。\n')
  process.exit(1)
}

export function hashPin(pin: string, salt?: string): string {
  const s = salt ?? randomBytes(16).toString('hex')
  const h = scryptSync(pin, s, 32).toString('hex')
  return `${s}:${h}`
}

export function verifyPin(pin: string, stored: string): boolean {
  const [salt, h] = stored.split(':')
  if (!salt || !h) return false
  const calc = scryptSync(pin, salt, 32).toString('hex')
  const a = Buffer.from(h, 'hex')
  const b = Buffer.from(calc, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

export function sign(payload: string): string {
  return createHmac('sha256', config.secret).update(payload).digest('base64url')
}

export function createToken(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body)}`
}

export function readToken<T>(raw: string | undefined): T | null {
  if (!raw) return null
  const [body, sig] = raw.split('.')
  if (!body || !sig) return null
  const expect = sign(body)
  if (sig.length !== expect.length) return null
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
}
