import { DatabaseSync } from 'node:sqlite'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { config, hashPin, verifyPin } from './config.ts'

mkdirSync(dirname(config.dbPath), { recursive: true })
export const db = new DatabaseSync(config.dbPath)

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS families (
  id           INTEGER PRIMARY KEY,
  code         TEXT UNIQUE NOT NULL,
  token        TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  head_name    TEXT,
  party_size   INTEGER NOT NULL DEFAULT 2,
  kids         INTEGER NOT NULL DEFAULT 0,
  campsite     TEXT,
  phone        TEXT,
  note         TEXT,
  active       INTEGER NOT NULL DEFAULT 1,
  created_ms   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS staff (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL,
  pin_hash        TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('staff','admin')),
  session_version INTEGER NOT NULL DEFAULT 0,
  active          INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS ops (
  seq          INTEGER PRIMARY KEY AUTOINCREMENT,
  op_id        TEXT UNIQUE NOT NULL,
  group_id     TEXT,
  family_id    INTEGER NOT NULL REFERENCES families(id) ON DELETE RESTRICT,
  type         TEXT NOT NULL CHECK (type IN ('checkin','gift')),
  actor_id     INTEGER REFERENCES staff(id),
  actor_name   TEXT NOT NULL,
  device_id    TEXT,
  client_ms    INTEGER NOT NULL,
  server_ms    INTEGER NOT NULL,
  state        TEXT NOT NULL DEFAULT 'effective' CHECK (state IN ('effective','superseded','undone')),
  conflict     INTEGER NOT NULL DEFAULT 0,
  late_sync    INTEGER NOT NULL DEFAULT 0,
  resolved_ms  INTEGER,
  resolved_by  INTEGER REFERENCES staff(id),
  resolution   TEXT CHECK (resolution IN ('keep','void'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ops_effective ON ops(family_id, type) WHERE state = 'effective';
CREATE INDEX IF NOT EXISTS idx_ops_family ON ops(family_id);
CREATE INDEX IF NOT EXISTS idx_ops_group  ON ops(group_id);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS login_attempts (ip TEXT NOT NULL, ms INTEGER NOT NULL, ok INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_login_ip ON login_attempts(ip, ms);

CREATE TABLE IF NOT EXISTS guest_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 24),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 300),
  created_ms INTEGER NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0,1))
);
CREATE INDEX IF NOT EXISTS idx_guest_family_time ON guest_messages(family_id, created_ms);

CREATE TABLE IF NOT EXISTS public_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_key TEXT NOT NULL,
  ip_key TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 24),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 300),
  created_ms INTEGER NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0,1))
);
CREATE INDEX IF NOT EXISTS idx_public_visitor_time ON public_messages(visitor_key, created_ms);
CREATE INDEX IF NOT EXISTS idx_public_ip_time ON public_messages(ip_key, created_ms);

CREATE VIEW IF NOT EXISTS v_family_state AS
SELECT f.id AS family_id,
       MAX(CASE WHEN o.type='checkin' THEN o.server_ms END)  AS checkin_ms,
       MAX(CASE WHEN o.type='checkin' THEN o.actor_name END) AS checkin_by,
       MAX(CASE WHEN o.type='gift'    THEN o.server_ms END)  AS gift_ms,
       MAX(CASE WHEN o.type='gift'    THEN o.actor_name END) AS gift_by
FROM families f
LEFT JOIN ops o ON o.family_id = f.id AND o.state = 'effective'
GROUP BY f.id;
`)

// ---------- types ----------

export type Staff = {
  id: number
  name: string
  role: 'staff' | 'admin'
  session_version: number
  active: number
}

export type FamilyRow = {
  id: number
  code: string
  token: string
  display_name: string
  head_name: string | null
  party_size: number
  kids: number
  campsite: string | null
  phone: string | null
  note: string | null
  active: number
}

export type FamilyState = {
  checkin_ms: number | null
  checkin_by: string | null
  gift_ms: number | null
  gift_by: string | null
}

export type FamilyWithState = FamilyRow & FamilyState

// ---------- helpers ----------

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function newToken(): string {
  // 20 bytes = 160 bit → 32 base32 chars
  const buf = randomBytes(20)
  let bits = 0
  let acc = 0
  let out = ''
  for (const byte of buf) {
    acc = (acc << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out += ALPHABET[(acc >>> bits) & 31]
    }
  }
  if (bits > 0) out += ALPHABET[(acc << (5 - bits)) & 31]
  return out.slice(0, 32)
}

// ---------- families ----------

const selFamilies = `
  SELECT f.*, s.checkin_ms, s.checkin_by, s.gift_ms, s.gift_by
  FROM families f LEFT JOIN v_family_state s ON s.family_id = f.id
`

export function listFamilies(includeInactive = false): FamilyWithState[] {
  const where = includeInactive ? '' : 'WHERE f.active = 1'
  return db.prepare(`${selFamilies} ${where} ORDER BY f.code`).all() as FamilyWithState[]
}

export function getFamilyByToken(token: string): FamilyWithState | null {
  return (db
    .prepare(`${selFamilies} WHERE f.token = ? AND f.active = 1`)
    .get(token) as FamilyWithState | undefined) ?? null
}

export function getFamilyByCode(code: string): FamilyWithState | null {
  return (db
    .prepare(`${selFamilies} WHERE f.code = ? AND f.active = 1`)
    .get(code) as FamilyWithState | undefined) ?? null
}

export function getFamilyById(id: number): FamilyWithState | null {
  return (db
    .prepare(`${selFamilies} WHERE f.id = ?`)
    .get(id) as FamilyWithState | undefined) ?? null
}

/** 只返回工作人员可见字段（永久剔除 phone） */
export function toStaffCard(f: FamilyWithState) {
  return {
    code: f.code,
    display_name: f.display_name,
    head_name: f.head_name,
    party_size: f.party_size,
    kids: f.kids,
    campsite: f.campsite,
    note: f.note,
    checkin_at: f.checkin_ms,
    checkin_by: f.checkin_by,
    gift_at: f.gift_ms,
    gift_by: f.gift_by,
  }
}

/** 公开视图：永久剔除 phone / head_name / note */
export function toPublicCard(f: FamilyWithState) {
  return {
    code: f.code,
    display_name: f.display_name,
    party_size: f.party_size,
    campsite: f.campsite,
    checkin_at: f.checkin_ms,
    gift_at: f.gift_ms,
  }
}

/** 营位号 → 区 + 区内序号（不做邻居推导，见 DESIGN §8.2） */
export function campsiteInfo(campsite: string | null): { zone: string; index: number } | null {
  if (!campsite) return null
  const m = /^([A-Za-z]+)(\d+)$/.exec(campsite.trim())
  if (!m) return null
  return { zone: m[1]!.toUpperCase(), index: Number(m[2]) }
}

// ---------- staff ----------

export function listStaff(): Staff[] {
  return db.prepare('SELECT id,name,role,session_version,active FROM staff ORDER BY id').all() as Staff[]
}

export function getStaff(id: number): Staff | null {
  return (db
    .prepare('SELECT id,name,role,session_version,active FROM staff WHERE id=?')
    .get(id) as Staff | undefined) ?? null
}

export function findStaffByPin(pin: string): Staff | null {
  const rows = db
    .prepare('SELECT id,name,pin_hash,role,session_version,active FROM staff WHERE active=1')
    .all() as (Staff & { pin_hash: string })[]
  // 逐个比对，避免提前 return 泄露「哪个 PIN 存在」
  let hit: (Staff & { pin_hash: string }) | null = null
  for (const r of rows) {
    if (verifyPin(pin, r.pin_hash)) hit = r
  }
  if (!hit) return null
  return { id: hit.id, name: hit.name, role: hit.role, session_version: hit.session_version, active: hit.active }
}

export function bumpSessionVersion(id: number) {
  db.prepare('UPDATE staff SET session_version = session_version + 1 WHERE id=?').run(id)
}

// ---------- setting ----------

export function getSetting(key: string, fallback = ''): string {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key) as { value: string } | undefined
  return row?.value ?? fallback
}

export function setSetting(key: string, value: string) {
  db.prepare(
    'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
  ).run(key, value)
}

export function allSettings(): Record<string, string> {
  const rows = db.prepare('SELECT key,value FROM settings').all() as { key: string; value: string }[]
  const out: Record<string, string> = {}
  for (const r of rows) out[r.key] = r.value
  return out
}

// ---------- login rate limit ----------

export function recordLoginAttempt(ip: string, ok: boolean) {
  db.prepare('INSERT INTO login_attempts(ip,ms,ok) VALUES(?,?,?)').run(ip, Date.now(), ok ? 1 : 0)
}

export function loginBlocked(ip: string): boolean {
  const since = Date.now() - 5 * 60_000
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE ip=? AND ms>? AND ok=0')
    .get(ip, since) as { n: number }
  return row.n >= 5
}

// ---------- seed ----------

export function seedIfEmpty() {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM families').get() as { n: number }
  if (n === 0) {
    const csvPath = 'data/families.csv'
    if (existsSync(csvPath)) importCsv(readFileSync(csvPath, 'utf8'))
  }
  const staffCount = db.prepare('SELECT COUNT(*) AS n FROM staff').get() as { n: number }
  if (staffCount.n === 0) {
    db.prepare(
      'INSERT INTO staff(name,pin_hash,role,session_version,active) VALUES(?,?,?,0,1)',
    ).run('小林', hashPin(config.staffPin), 'admin')
    db.prepare(
      'INSERT INTO staff(name,pin_hash,role,session_version,active) VALUES(?,?,?,0,1)',
    ).run('小周', hashPin('1234'), 'staff')
  }
}

export function importCsv(text: string): { inserted: number; updated: number } {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim())
  if (!lines.length) return { inserted: 0, updated: 0 }
  const header = parseCsvLine(lines[0]!)
  const idx = (name: string) => header.indexOf(name)
  let inserted = 0
  let updated = 0
  const now = Date.now()

  const selCode = db.prepare('SELECT id FROM families WHERE code=?')
  // 显式列清单：绝不更新 id / token（否则历史 ops 会变孤儿）
  const upd = db.prepare(`
    UPDATE families SET display_name=?, head_name=?, party_size=?, kids=?,
      campsite=?, phone=?, note=?, active=1 WHERE code=?
  `)
  const ins = db.prepare(`
    INSERT INTO families(code,token,display_name,head_name,party_size,kids,campsite,phone,note,active,created_ms)
    VALUES(?,?,?,?,?,?,?,?,?,1,?)
  `)

  for (const line of lines.slice(1)) {
    const c = parseCsvLine(line)
    const code = (c[idx('code')] ?? '').trim()
    if (!code) continue
    const display_name = (c[idx('display_name')] ?? code).trim()
    const head_name = (c[idx('head_name')] ?? '').trim() || null
    const party_size = Number(c[idx('party_size')] ?? 2) || 2
    const kids = Number(c[idx('kids')] ?? 0) || 0
    const campsite = (c[idx('campsite')] ?? '').trim() || null
    const phone = (c[idx('phone')] ?? '').trim() || null
    const note = (c[idx('note')] ?? '').trim() || null

    if (selCode.get(code)) {
      upd.run(display_name, head_name, party_size, kids, campsite, phone, note, code)
      updated++
    } else {
      ins.run(code, newToken(), display_name, head_name, party_size, kids, campsite, phone, note, now)
      inserted++
    }
  }
  return { inserted, updated }
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else q = false
      } else cur += ch
    } else if (ch === '"') q = true
    else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}
