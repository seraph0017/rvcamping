/**
 * 工作人员端客户端逻辑
 *  - 单击核销（不用长按，见 DESIGN §7.2）
 *  - 5 秒撤销 toast
 *  - outbox 状态机 pending/sent/confirmed/voided/rejected（DESIGN §12.3）
 *  - 离线优先：先本地记，联网批量同步
 *  - 服务端 seq 定权威，本地只做乐观合并
 */

import jsQR from 'jsqr'

// randomUUID is restricted to secure contexts; getRandomValues also works on HTTP.
function operationId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
}

type Op = {
  opId: string
  groupId: string
  token: string
  type: 'checkin' | 'gift'
  clientMs: number
  deviceId: string
  status: 'pending' | 'sent' | 'confirmed' | 'voided' | 'rejected'
  /** 已同步但用户要撤销：同步完成后必须马上调 undo */
  needsUndo?: boolean
  attempts: number
  reason?: string
}

type Snapshot = {
  families: {
    code: string
    token: string
    display_name: string
    head_name: string | null
    party_size: number
    campsite: string | null
    checkin_at: number | null
    checkin_by: string | null
    gift_at: number | null
    gift_by: string | null
  }[]
  summary: { total: number; checkedIn: number; giftGiven: number; conflicts: number }
  settings: { giftName: string; contactName: string }
  generated_at: number
}

const DB_NAME = 'rv'
const DB_VER = 1
const STORE = 'kv'

let dbp: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbp) return dbp
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER)
    req.onupgradeneeded = () => {
      const d = req.result
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbp
}

async function kvGet<T>(key: string): Promise<T | null> {
  const d = await openDb()
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readonly')
    const r = tx.objectStore(STORE).get(key)
    r.onsuccess = () => resolve((r.result as T) ?? null)
    r.onerror = () => reject(r.error)
  })
}

async function kvSet(key: string, value: unknown): Promise<void> {
  const d = await openDb()
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function getDeviceId(): Promise<string> {
  let id = await kvGet<string>('deviceId')
  if (!id) {
    id = Math.random().toString(16).slice(2, 10) + Math.random().toString(16).slice(2, 10)
    await kvSet('deviceId', id)
  }
  return id
}

async function getOutbox(): Promise<Op[]> {
  return (await kvGet<Op[]>('outbox')) ?? []
}

async function setOutbox(ops: Op[]): Promise<void> {
  await kvSet('outbox', ops)
}

// ---------- toast ----------

const toastEl = () => document.getElementById('toast')
const toastText = () => document.getElementById('toast-text')
const toastUndo = () => document.getElementById('toast-undo') as HTMLButtonElement | null

let toastTimer: number | undefined
/** 核销后延迟刷新权威状态；撤销时必须取消，否则 toast 窗口被打断 */
let authorityReloadTimer: number | undefined

function cancelAuthorityReload() {
  if (authorityReloadTimer) {
    clearTimeout(authorityReloadTimer)
    authorityReloadTimer = undefined
  }
}

function showToast(message: string, kind: 'ok' | 'warn' | 'err' | 'plain' = 'ok', undoFn?: () => void) {
  const el = toastEl()
  const text = toastText()
  const undo = toastUndo()
  if (!el || !text || !undo) return
  el.hidden = false
  el.className = 'toast' + (kind === 'ok' ? ' toast--ok' : kind === 'warn' ? ' toast--warn' : kind === 'err' ? ' toast--err' : '')
  text.textContent = message

  if (undoFn) {
    undo.hidden = false
    undo.onclick = async () => {
      undo.hidden = true
      el.hidden = true
      await undoFn()
    }
  } else {
    undo.hidden = true
    undo.onclick = null
  }

  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    el.hidden = true
    undo.hidden = true
  }, undoFn ? 5200 : 2600)
}

function flashOk() {
  const div = document.createElement('div')
  div.className = 'flash is-on'
  document.body.appendChild(div)
  requestAnimationFrame(() => {
    div.style.opacity = '0'
    setTimeout(() => div.remove(), 320)
  })
}

// ---------- API ----------

async function postOps(ops: Op[]): Promise<void> {
  if (!ops.length) return
  const res = await fetch('/api/ops', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(
      ops.map((o) => ({
        op_id: o.opId,
        group_id: o.groupId,
        token: o.token,
        type: o.type,
        client_ms: o.clientMs,
        device_id: o.deviceId,
      })),
    ),
  })
  if (!res.ok) throw new Error('sync failed ' + res.status)
  type AuthState = {
    checkin_at: number | null
    checkin_by: string | null
    gift_at: number | null
    gift_by: string | null
  }
  const data = (await res.json()) as {
    results: {
      op_id: string
      status: string
      reason?: string
      conflict: boolean
      /** 服务端权威状态：离线同步后用它把「本地记录」换成真实时间/操作人 */
      authoritative?: AuthState
    }[]
  }

  // 关键：fetch 期间可能又有新 op 入队（连续快速核销）。
  // 必须重新读一次队列，只改动「本次发出去的那批」，绝不能拿旧快照整体覆盖。
  const sentIds = new Set(ops.map((o) => o.opId))
  const fresh = await getOutbox()
  const byId = new Map(fresh.map((o) => [o.opId, o]))
  const toUndo: Op[] = []

  for (const r of data.results) {
    const op = byId.get(r.op_id)
    if (!op) continue
    if (r.status === 'accepted' || r.status === 'duplicate') {
      if (op.status === 'voided') {
        // 已发到服务端但用户撤销了 → 立刻回头撤掉
        op.status = 'confirmed'
        toUndo.push(op)
      } else {
        op.status = 'confirmed'
      }
    } else {
      op.status = 'rejected'
      op.reason = r.reason
    }
  }

  await setOutbox(fresh)
  for (const op of toUndo) {
    await fetch(`/api/ops/${encodeURIComponent(op.opId)}/undo`, { method: 'POST' }).catch(() => {})
  }
  // 只出队「本次发出的且已确认」的；期间新入队的原样保留
  await setOutbox(fresh.filter((o) => !(sentIds.has(o.opId) && o.status === 'confirmed')))

  // 用服务端权威状态刷新界面（离线核销同步后，这一步把「本地记录」换成真实时间/操作人）
  const lastAuth = data.results.at(-1)?.authoritative
  if (lastAuth) applyAuthoritative(lastAuth)

  await refreshSyncBar()
}

/** 生成本地 op（不写库） */
function makeOps(token: string, groupId: string, deviceId: string, types: ('checkin' | 'gift')[]): Op[] {
  const now = Date.now()
  return types.map((type) => ({
    opId: operationId(),
    groupId,
    token,
    type,
    clientMs: now,
    deviceId,
    status: 'pending' as const,
    attempts: 0,
  }))
}

/** 入队 + 尝试同步 */
async function enqueue(ops: Op[]) {
  const all = await getOutbox()
  all.push(...ops)
  await setOutbox(all)
  void flush()
}

let flushing = false

async function flush(): Promise<void> {
  if (flushing) return
  if (!navigator.onLine) {
    await refreshSyncBar()
    return
  }
  flushing = true
  try {
    const all = await getOutbox()
    // rejected 不参与重试（DESIGN §12.3）
    const pending = all.filter((o) => o.status === 'pending' || o.status === 'voided' || o.status === 'sent')
    if (!pending.length) {
      await refreshSyncBar()
      return
    }
    for (const o of pending) o.status = 'sent'
    await setOutbox(all)
    await postOps(pending)
  } catch {
    const all = await getOutbox()
    for (const o of all) if (o.status === 'sent') o.status = 'pending'
    await setOutbox(all)
  } finally {
    flushing = false
    await refreshSyncBar()
  }
}

async function refreshSyncBar() {
  const bar = document.getElementById('syncbar')
  const text = document.getElementById('syncbar-text')
  if (!bar || !text) return
  const all = await getOutbox()
  const pending = all.filter((o) => o.status !== 'confirmed').length
  if (pending === 0) {
    bar.hidden = true
    return
  }
  bar.hidden = false
  const rejected = all.filter((o) => o.status === 'rejected').length
  text.textContent = navigator.onLine
    ? `${pending} 条待同步${rejected ? `（${rejected} 条需人工处理）` : '…'}`
    : `离线中 · ${pending} 条已记录，联网后自动同步`
}

// ---------- 撤销 ----------

/**
 * 撤销「上一次动作」。
 * 不能依赖 outbox 找 op —— 同步成功后 op 已出队，队列里找不到。
 * 所以 onAct 时把 opIds 记进 lastAction，撤销直接拿这组 id 打服务端。
 */
async function undoLastAction() {
  cancelAuthorityReload()
  const la = await kvGet<{ opIds: string[]; token: string; at: number }>('lastAction')
  const ids = la?.opIds ?? []
  if (!ids.length) {
    showToast('没有可撤销的操作', 'warn')
    return
  }

  // 仍在队列里的（离线未同步）：标记 voided，让它发出去后再被撤掉。
  // 绝不直接删队列——如果这批其实已发出只是响应丢了，删队列会把误操作永久固化（DESIGN §12.3）
  const all = await getOutbox()
  let touchedLocal = false
  for (const o of all) {
    if (ids.includes(o.opId) && o.status !== 'confirmed') {
      o.status = 'voided'
      touchedLocal = true
    }
  }
  if (touchedLocal) await setOutbox(all)

  // 已同步的：直接对服务端撤销（幂等，重复调用无害）
  for (const id of ids) {
    await fetch(`/api/ops/${encodeURIComponent(id)}/undo`, { method: 'POST' }).catch(() => {})
  }
  await kvSet('lastAction', { opIds: [], token: la?.token ?? '', at: Date.now() })

  if (touchedLocal) void flush()
  else showToast('已撤销', 'ok')

  // 拉一次权威状态
  setTimeout(() => location.reload(), touchedLocal ? 700 : 350)
}

// ---------- 页面动作 ----------

async function onAct(action: string, tokenOverride?: string) {
  const body = document.body
  const token = tokenOverride ?? body.dataset.token
  const groupId = operationId()
  if (!token) return

  const types: ('checkin' | 'gift')[] =
    action === 'both' ? ['checkin', 'gift'] : action === 'checkin' ? ['checkin'] : ['gift']

  const label = action === 'both' ? '已签到 + 领礼品' : action === 'checkin' ? '已签到' : '已领礼品'
  const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

  // ---- 先给反馈，再落盘 ----
  // IndexedDB 首次写入可能 300–500ms，如果等它写完才闪屏，现场手感会「按了没反应」。
  // 所以闪屏 + 按钮置灰先做（同时也能挡住重复点击），落盘紧随其后。
  flashOk()
  if ('vibrate' in navigator) navigator.vibrate?.(40)
  if (tokenOverride) applyRowState(tokenOverride, types)
  else applyLocalState(types, time)

  const deviceId = await getDeviceId()
  const ops = makeOps(token, groupId, deviceId, types)

  await enqueue(ops)
  await kvSet('lastAction', { opIds: ops.map((o) => o.opId), token, at: Date.now() })

  showToast(`${label} · ${time}`, 'ok', async () => {
    await undoLastAction()
  })

  // 后台同步（不 reload：reload 会把撤销 toast 吃掉）
  void flush()

  // 详情页：toast 消失后拉一次权威状态。
  // 清单页绝不 reload —— 工作人员会连续核销几十家，reload 会打断操作、丢滚动位置。
  if (!tokenOverride) {
    cancelAuthorityReload()
    authorityReloadTimer = window.setTimeout(() => {
      if (navigator.onLine) location.reload()
    }, 7000)
  } else {
    cancelAuthorityReload()
  }
}

/**
 * 用服务端返回的权威状态刷新界面（不 reload）。
 * 离线核销 → 联网同步后，页面必须从「本地记录」变成服务端的真实时间与操作人，
 * 否则会出现「服务端已签到、页面还写着未签到」。
 */
function applyAuthoritative(auth: {
  checkin_at: number | null
  checkin_by: string | null
  gift_at: number | null
  gift_by: string | null
}) {
  if (document.body.dataset.mode !== 'card') return
  const rows = document.querySelectorAll<HTMLElement>('.staff-status__row')
  const fmt = (ms: number | null) => {
    if (!ms) return null
    const d = new Date(ms)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  const paint = (el: HTMLElement | undefined, at: number | null, by: string | null, pending: string) => {
    if (!el) return
    const v = el.querySelector('.staff-status__v')
    if (auth && at) {
      el.classList.add('is-done')
      if (v) v.textContent = `✓ ${fmt(at)} · ${by ?? ''}`
    } else if (v && v.textContent?.includes('本地记录')) {
      // 服务端没有这条（被撤销了）：回退显示
      el.classList.remove('is-done')
      if (v) v.textContent = pending
    }
  }
  paint(rows[0], auth.checkin_at, auth.checkin_by, '未签到')
  paint(rows[1], auth.gift_at, auth.gift_by, '未领取（1 份/家）')

  // 主按钮跟着权威状态走
  const btn = document.querySelector<HTMLButtonElement>('.btn--primary')
  if (btn) {
    const done = !!auth.checkin_at && !!auth.gift_at
    const next = !auth.checkin_at ? '签到' : '领礼品'
    btn.disabled = done
    btn.textContent = done ? '这一家都办完了 ✓' : next
    btn.dataset.action = !auth.checkin_at && !auth.gift_at ? 'both' : !auth.checkin_at ? 'checkin' : 'gift'
  }

  // 权威状态已就位，取消那次会打断体验的定时 reload
  cancelAuthorityReload()
}

/** 清单行内核销后的本地反馈 */
function applyRowState(token: string, types: string[]) {
  const row = document.querySelector<HTMLElement>(`.row[data-token="${token}"]`)
  if (!row) return
  const flags = row.querySelectorAll<HTMLElement>('.row__flags i')
  const map: Record<string, number> = { checkin: 0, gift: 1 }
  for (const t of types) {
    const el = flags[map[t]!]
    if (el) el.classList.add('on')
  }
  const btn = row.querySelector<HTMLElement>('.row__quick')
  if (btn) {
    btn.outerHTML = '<span class="row__quick row__quick--done">✓</span>'
  }
  if (flags[0]?.classList.contains('on') && flags[1]?.classList.contains('on')) {
    row.classList.add('is-done')
  }
}

function applyLocalState(types: string[], time: string) {
  const rows = document.querySelectorAll<HTMLElement>('.staff-status__row')
  const map: Record<string, number> = { checkin: 0, gift: 1 }
  for (const t of types) {
    const i = map[t]
    const row = rows[i]
    if (!row) continue
    row.classList.add('is-done')
    const v = row.querySelector('.staff-status__v')
    if (v) v.textContent = `✓ ${time} · 本地记录`
  }
  const primary = document.querySelector<HTMLButtonElement>('.btn--primary')
  if (primary) {
    primary.disabled = true
    primary.textContent = '已记录'
  }
}

async function onUndoAll() {
  await undoLastAction()
}

// ---------- 清单页 ----------

async function preload() {
  const btn = document.getElementById('preload')
  if (btn) btn.textContent = '预载中…'
  try {
    const res = await fetch('/api/staff/snapshot')
    if (!res.ok) throw new Error('bad status ' + res.status)
    const snap = (await res.json()) as Snapshot
    await kvSet('snapshot', snap)
    await kvSet('snapshotAt', Date.now())

    // 预缓存 /staff 相关静态资源（SW 已在根 scope 注册）
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready
      const urls = ['/ops', '/assets/app.css', '/assets/staff.js', '/assets/cover.png']
      await Promise.all(urls.map((u) => reg.active?.postMessage({ type: 'PRECACHE', url: u })))
    }
    showToast(`离线就绪 ✓ ${snap.families.length} 家 · ${new Date().toLocaleTimeString('zh-CN')}`, 'ok')
    if (btn) btn.textContent = '已预载 ✓'
  } catch (err) {
    showToast('预载失败：' + (err as Error).message, 'err')
    if (btn) btn.textContent = '预载离线包'
  }
}

async function checkSyncStatus() {
  const id = await getDeviceId()
  try {
    const res = await fetch(`/api/staff/sync-status?device_id=${encodeURIComponent(id)}`)
    if (!res.ok) return
    const data = (await res.json()) as { op_ids: string[] }
    const all = await getOutbox()
    const server = new Set(data.op_ids)
    const missing = all.filter((o) => o.status !== 'confirmed' && !server.has(o.opId))
    if (missing.length === 0) {
      showToast('本机无待同步记录 ✓', 'ok')
      await setOutbox(all.filter((o) => o.status !== 'confirmed'))
    } else {
      showToast(`本机还有 ${missing.length} 条未上传`, 'warn')
    }
    await refreshSyncBar()
  } catch {
    showToast('网络不通，稍后再试', 'warn')
  }
}

// ---------- 绑定 ----------

function bind() {
  const qrPhoto = document.getElementById('qr-photo') as HTMLInputElement | null
  qrPhoto?.addEventListener('change', async () => {
    const file = qrPhoto.files?.[0]
    if (!file) return
    showToast('正在识别二维码…', 'warn')
    const src = URL.createObjectURL(file)
    try {
      const image = new Image()
      image.src = src
      await image.decode()
      const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(image.naturalWidth * scale)
      canvas.height = Math.round(image.naturalHeight * scale)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const qr = jsQR(pixels.data, pixels.width, pixels.height)
      if (!qr) throw new Error('没识别到二维码，请靠近拍清楚，或输入卡片编号')
      const url = new URL(qr.data, location.origin)
      const match = /^\/v\/([A-Z2-7]{32})\/?$/.exec(url.pathname)
      if (url.origin !== location.origin || !match) throw new Error('请扫描本活动的村民卡二维码')
      location.assign('/v/' + match[1])
    } catch (error) { showToast((error as Error).message || '识别失败，请输入卡片编号', 'err') }
    finally { URL.revokeObjectURL(src); qrPhoto.value = '' }
  })
  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement | null
    if (!t) return
    const act = t.closest<HTMLButtonElement>('[data-action]')
    if (act) {
      e.preventDefault()
      void onAct(act.dataset.action ?? '', act.dataset.token)
      return
    }
    if (t.closest('[data-undo="all"]')) {
      e.preventDefault()
      void onUndoAll()
      return
    }
    if (t.id === 'preload') {
      e.preventDefault()
      void preload()
    }
    if (t.id === 'sync-now') {
      e.preventDefault()
      void checkSyncStatus()
    }
  })

  // 屏蔽长按/右键系统菜单，避免微信弹「选择/复制」
  document.addEventListener('contextmenu', (e) => e.preventDefault())

  window.addEventListener('online', () => void flush())
  window.addEventListener('offline', () => void refreshSyncBar())
  setInterval(() => void flush(), 60_000)

  // 编号输入：聚焦自动全选，回车直接查
  const lookup = document.getElementById('lookup') as HTMLInputElement | null
  if (lookup) {
    lookup.addEventListener('focus', () => lookup.select())
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})
  }

  void refreshSyncBar()

  // 首次进入 /staff 时若没预载过，提示
  if (document.body.dataset.mode === 'list') {
    void (async () => {
      const at = await kvGet<number>('snapshotAt')
      if (!at) {
        showToast('建议先点「预载离线包」，断网也能核销', 'warn')
      }
    })()
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind)
else bind()
