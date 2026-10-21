import { db, type FamilyWithState, type Staff } from './db.ts'

export type OpInput = {
  op_id?: unknown
  group_id?: unknown
  token?: unknown
  type?: unknown
  client_ms?: unknown
  device_id?: unknown
}

export type OpResult = {
  op_id: string
  status: 'accepted' | 'duplicate' | 'rejected'
  reason?: string
  conflict: boolean
  state: string
  authoritative: AuthoritativeState
}

export type AuthoritativeState = {
  checkin_at: number | null
  checkin_by: string | null
  gift_at: number | null
  gift_by: string | null
}

const LATE_SYNC_MS = 10 * 60_000

const EMPTY_STATE: AuthoritativeState = {
  checkin_at: null,
  checkin_by: null,
  gift_at: null,
  gift_by: null,
}

function authoritativeOf(familyId: number): AuthoritativeState {
  const row = db
    .prepare('SELECT checkin_ms AS checkin_at, checkin_by, gift_ms AS gift_at, gift_by FROM v_family_state WHERE family_id = ?')
    .get(familyId) as Partial<AuthoritativeState> | undefined
  return { ...EMPTY_STATE, ...row }
}

/** node:sqlite 没有 db.transaction()，手写包一层 */
function tx<A, T>(fn: (arg: A) => T, arg: A): T {
  db.exec('BEGIN')
  try {
    const out = fn(arg)
    db.exec('COMMIT')
    return out
  } catch (err) {
    try {
      db.exec('ROLLBACK')
    } catch {
      /* 已回滚或事务未开 */
    }
    throw err
  }
}

/** 批量提交，逐条返回三态结果。整批包在一个事务里。 */
export function submitOps(inputs: OpInput[], actor: Staff): OpResult[] {
  const findByOpId = db.prepare('SELECT op_id, family_id, type, state FROM ops WHERE op_id=?')
  const findByToken = db.prepare('SELECT id FROM families WHERE token=? AND active=1')
  const findEffective = db.prepare(
    "SELECT seq FROM ops WHERE family_id=? AND type=? AND state='effective' LIMIT 1",
  )
  const insert = db.prepare(`
    INSERT INTO ops(op_id,group_id,family_id,type,actor_id,actor_name,device_id,
                    client_ms,server_ms,state,conflict,late_sync)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
  `)

  const results = tx((list: OpInput[]): OpResult[] => {
    const out: OpResult[] = []
    for (const raw of list) {
      const opId = typeof raw.op_id === 'string' ? raw.op_id.trim() : ''
      const token = typeof raw.token === 'string' ? raw.token.trim() : ''
      const type = raw.type
      const clientMs = typeof raw.client_ms === 'number' ? raw.client_ms : Number(raw.client_ms)

      // ---- 显式校验：任何不合法都不写库，且不能走「已处理」分支 ----
      if (!opId || opId.length > 64) {
        out.push(reject(opId || '(empty)', 'op_id 非法', 0))
        continue
      }
      if (type !== 'checkin' && type !== 'gift') {
        out.push(reject(opId, `type 非法: ${String(type)}`, 0))
        continue
      }
      if (!Number.isFinite(clientMs)) {
        out.push(reject(opId, 'client_ms 非法', 0))
        continue
      }

      // ---- 幂等：op_id 已存在 → duplicate（绝不覆盖 undone） ----
      const existing = findByOpId.get(opId) as
        | { op_id: string; family_id: number; type: string; state: string }
        | undefined
      if (existing) {
        out.push({
          op_id: opId,
          status: 'duplicate',
          conflict: false,
          state: existing.state,
          authoritative: authoritativeOf(existing.family_id),
        })
        continue
      }

      const fam = findByToken.get(token) as { id: number } | undefined
      if (!fam) {
        out.push(reject(opId, 'token 无效或该家庭已停用', 0))
        continue
      }

      const now = Date.now()
      // ---- 对称冲突检测：只要已有 effective，就当 superseded，与时间先后无关 ----
      const eff = findEffective.get(fam.id, type) as { seq: number } | undefined
      const state = eff ? 'superseded' : 'effective'
      const conflict = eff ? 1 : 0
      const lateSync = Math.abs(clientMs - now) > LATE_SYNC_MS ? 1 : 0

      insert.run(
        opId,
        typeof raw.group_id === 'string' ? raw.group_id : null,
        fam.id,
        type,
        actor.id,
        actor.name,
        typeof raw.device_id === 'string' ? raw.device_id.slice(0, 64) : null,
        Math.round(clientMs),
        now,
        state,
        conflict,
        lateSync,
      )

      out.push({
        op_id: opId,
        status: 'accepted',
        conflict: conflict === 1,
        state,
        authoritative: authoritativeOf(fam.id),
      })
    }
    return out
  }, inputs)

  return results
}

function reject(opId: string, reason: string, familyId: number): OpResult {
  return {
    op_id: opId,
    status: 'rejected',
    reason,
    conflict: false,
    state: 'none',
    authoritative: familyId > 0 ? authoritativeOf(familyId) : { ...EMPTY_STATE },
  }
}

export type UndoOutcome = {
  ok: boolean
  reason?: string
  /** 本次是否真的把状态从 effective 改成了 undone（组撤销统计用） */
  changed?: boolean
  authority: AuthoritativeState | null
}

/** 撤销单条（幂等）。窗口按 server_ms 算，与设备时钟无关。 */
export function undoOp(
  opId: string,
  actor: Staff,
  opts: { ignoreWindow?: boolean } = {},
): UndoOutcome {
  const row = db
    .prepare('SELECT seq, family_id, type, state, server_ms, group_id FROM ops WHERE op_id=?')
    .get(opId) as
    | { seq: number; family_id: number; type: string; state: string; server_ms: number; group_id: string | null }
    | undefined

  if (!row) return { ok: false, reason: 'not_found', authority: null }
  if (row.state === 'undone') {
    // 幂等：已经是撤销态，视为成功但不算「这次改动」
    return { ok: true, changed: false, authority: authoritativeOf(row.family_id) }
  }
  if (row.state === 'superseded') {
    return { ok: false, reason: '这条记录本来就不生效（已被后来的核销取代）', authority: authoritativeOf(row.family_id) }
  }
  if (!opts.ignoreWindow && Date.now() - row.server_ms > 5 * 60_000) {
    return { ok: false, reason: '超过 5 分钟撤销窗口', authority: authoritativeOf(row.family_id) }
  }

  db.prepare('UPDATE ops SET state=?, resolved_ms=?, resolved_by=? WHERE op_id=?').run(
    'undone',
    Date.now(),
    actor.id,
    opId,
  )
  // 撤销后不提升 superseded，家庭回到未核销（DESIGN §10）
  return { ok: true, changed: true, authority: authoritativeOf(row.family_id) }
}

/** 按 group 事务性撤销（「签到+领礼」一次动作） */
export function undoGroup(groupId: string, actor: Staff, opts: { ignoreWindow?: boolean } = {}) {
  const rows = db.prepare('SELECT op_id FROM ops WHERE group_id=?').all(groupId) as { op_id: string }[]
  if (!rows.length) return { ok: false, reason: 'not_found', changed: 0, already: 0 }
  const result = tx((_: null) => {
    let changed = 0
    let already = 0
    for (const r of rows) {
      const res = undoOp(r.op_id, actor, opts)
      if (res.changed) changed++
      else if (res.ok) already++
    }
    return { changed, already }
  }, null)
  return { ok: result.changed > 0 || result.already > 0, ...result }
}

/** 冲突列表（未处置） */
export function listConflicts() {
  return db
    .prepare(`
      SELECT o.op_id, o.seq, o.type, o.actor_name, o.device_id, o.client_ms, o.server_ms,
             o.late_sync, f.code, f.display_name, f.campsite, f.id AS family_id
      FROM ops o JOIN families f ON f.id = o.family_id
      WHERE o.conflict = 1 AND o.state = 'superseded' AND o.resolved_ms IS NULL
      ORDER BY o.seq DESC
    `)
    .all()
}

/** 冲突处置：keep = 保留现状（该条标掉）；void = 撤掉当前有效记录、让这条生效 */
export function resolveConflict(opId: string, resolution: 'keep' | 'void', actor: Staff) {
  const row = db
    .prepare('SELECT family_id, type, state FROM ops WHERE op_id=?')
    .get(opId) as { family_id: number; type: string; state: string } | undefined
  if (!row) return { ok: false, reason: 'not_found' }

  // 已被撤销 / 已处置过的记录不能再拿来「改判」，否则会把撤销变成生效
  if (row.state === 'undone') {
    return { ok: false, reason: '该记录已被撤销，不能改判为有效' }
  }
  const already = db
    .prepare('SELECT resolved_ms FROM ops WHERE op_id=?')
    .get(opId) as { resolved_ms: number | null } | undefined
  if (already?.resolved_ms) {
    return { ok: false, reason: '这条冲突已经处置过了' }
  }

  tx((_: null) => {
    if (resolution === 'void') {
      // 把当前 effective 撤掉，再把这条提升为 effective
      db.prepare(
        "UPDATE ops SET state='undone', resolved_ms=?, resolved_by=? WHERE family_id=? AND type=? AND state='effective'",
      ).run(Date.now(), actor.id, row.family_id, row.type)
      db.prepare(
        "UPDATE ops SET state='effective', resolved_ms=?, resolved_by=?, resolution='void' WHERE op_id=?",
      ).run(Date.now(), actor.id, opId)
    } else {
      db.prepare('UPDATE ops SET resolved_ms=?, resolved_by=?, resolution=? WHERE op_id=?').run(
        Date.now(),
        actor.id,
        'keep',
        opId,
      )
    }
  }, null)
  return { ok: true }
}

export type Summary = {
  total: number
  checkedIn: number
  giftGiven: number
  conflicts: number
  pending: number
}

export function summary(): Summary {
  const total = (db.prepare('SELECT COUNT(*) AS n FROM families WHERE active=1').get() as { n: number }).n
  // COUNT(DISTINCT family_id) —— 绝不用 COUNT(*)
  const checkedIn = (
    db
      .prepare(
        "SELECT COUNT(DISTINCT family_id) AS n FROM ops WHERE type='checkin' AND state='effective'",
      )
      .get() as { n: number }
  ).n
  const giftGiven = (
    db.prepare("SELECT COUNT(DISTINCT family_id) AS n FROM ops WHERE type='gift' AND state='effective'").get() as {
      n: number
    }
  ).n
  const conflicts = (
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM ops WHERE conflict=1 AND state='superseded' AND resolved_ms IS NULL",
      )
      .get() as { n: number }
  ).n
  return { total, checkedIn, giftGiven, conflicts, pending: total - Math.min(checkedIn, total) }
}

/** 服务端已收到某设备的 op_id 集合（用于客户端算「还差几条」） */
export function opIdsForDevice(deviceId: string): string[] {
  const rows = db.prepare('SELECT op_id FROM ops WHERE device_id=?').all(deviceId) as { op_id: string }[]
  return rows.map((r) => r.op_id)
}

export function toCard(f: FamilyWithState) {
  return {
    code: f.code,
    display_name: f.display_name,
    campsite: f.campsite,
    checkin_at: f.checkin_ms,
    checkin_by: f.checkin_by,
    gift_at: f.gift_ms,
    gift_by: f.gift_by,
  }
}
