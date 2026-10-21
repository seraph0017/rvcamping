import { html } from 'hono/html'
import type { FamilyWithState, Staff } from '../db.ts'
import type { Summary } from '../ops.ts'
import { footer, layout, seal } from '../ui.ts'

export function loginPage(opts: { error?: string }) {
  return layout(
    {
      title: '工作人员登录 · 村民服务站',
      noindex: true,
      bodyClass: 'is-staff',
    },
    html`<header class="staffbar staffbar--plain">
  <a class="staffbar__back" href="/">← 返回</a>
  <span class="staffbar__mode">现场操作台</span>
  <span></span>
</header>
<main class="staff-login">
  <div class="staff-login__seal">${seal('RV')}</div>
  <h1>工作人员登录</h1>
  <p class="staff-login__hint">输入你的 PIN。本机记住 30 天，不用每次输。</p>
  ${opts.error ? html`<p class="form-error">${opts.error}</p>` : ''}
  <form method="post" action="/ops/login" class="staff-login__form" autocomplete="off">
    <input
      class="pin-input"
      name="pin"
      type="password"
      inputmode="numeric"
      pattern="[0-9]*"
      maxlength="8"
      placeholder="PIN"
      autocomplete="off"
      autofocus
      required
    />
    <button class="btn btn--primary" type="submit">进入</button>
  </form>
  <p class="staff-login__foot">第一次用？先看一页上岗卡：扫码能核销，断网用编号。</p>
</main>`,
  )
}

export function staffPage(opts: {
  staff: Staff
  families: FamilyWithState[]
  summary: Summary
  tab: 'pending' | 'all'
  query: string
}) {
  const pending = opts.families.filter((f) => f.checkin_ms === null || f.gift_ms === null)
  const rows = opts.tab === 'pending' ? pending : opts.families

  return layout(
    {
      title: '服务台 · 村民服务站',
      noindex: true,
      bodyClass: 'is-staff',
      script: 'staff',
      bodyAttrs: 'data-mode="list"',
    },
    html`<header class="staffbar">
  <a class="staffbar__back" href="/">← 返回</a>
  <span class="staffbar__mode">${opts.staff.name}${opts.staff.role === 'admin' ? ' · 管理员' : ''}</span>
  <a class="staffbar__exit" href="/ops/logout">退出</a>
</header>

<main class="staff-list">
  <section class="progress">
    <div class="progress__item">
      <span class="progress__n">${opts.summary.checkedIn}<i>/${opts.summary.total}</i></span>
      <span class="progress__k">已签到</span>
    </div>
    <div class="progress__item">
      <span class="progress__n">${opts.summary.giftGiven}<i>/${opts.summary.total}</i></span>
      <span class="progress__k">已领礼品</span>
    </div>
    <div class="progress__item">
      <span class="progress__n">${opts.summary.total - opts.summary.giftGiven}</span>
      <span class="progress__k">礼品余量</span>
    </div>
  </section>

  ${opts.summary.conflicts > 0
    ? html`<a class="alertbar" href="/ops/conflicts">⚠ ${opts.summary.conflicts} 条冲突待核对 →</a>`
    : ''}

  <div class="syncbar" id="syncbar" hidden>
    <span id="syncbar-text"></span>
    <button class="linkish" id="sync-now">立即同步</button>
  </div>

  <form class="lookup" method="get" action="/ops/lookup" autocomplete="off">
    <input
      class="lookup__input"
      id="lookup"
      name="q"
      type="text"
      inputmode="numeric"
      placeholder="输入编号，如 005"
      value="${opts.query}"
      autocomplete="off"
    />
    <button class="btn btn--primary lookup__go" type="submit">找</button>
  </form>

  <div class="tabs">
    <a class="tab ${opts.tab === 'pending' ? 'is-on' : ''}" href="/ops?tab=pending">待办 ${pending.length}</a>
    <a class="tab ${opts.tab === 'all' ? 'is-on' : ''}" href="/ops?tab=all">全部 ${opts.families.length}</a>
    <button class="tab tab--ghost" id="preload">预载离线包</button>
  </div>

  <ul class="rows" id="rows">
    ${rows.map((f) => {
      const done = f.checkin_ms !== null && f.gift_ms !== null
      const quick =
        done
          ? null
          : f.checkin_ms === null && f.gift_ms === null
            ? { action: 'both', label: '签到+领礼' }
            : f.checkin_ms === null
              ? { action: 'checkin', label: '补签到' }
              : { action: 'gift', label: '发礼品' }
      return html`<li class="row ${done ? 'is-done' : ''}" data-token="${f.token}">
  <a class="row__main" href="/v/${f.token}">
    <span class="row__code">${f.code}</span>
    <span class="row__name">${f.display_name}</span>
    <span class="row__plot">${f.campsite ?? '—'}</span>
    <span class="row__flags">
      <i class="${f.checkin_ms !== null ? 'on' : ''}">签</i>
      <i class="${f.gift_ms !== null ? 'on' : ''}">礼</i>
    </span>
  </a>
  ${quick
    ? html`<button class="row__quick" data-action="${quick.action}" data-token="${f.token}">${quick.label}</button>`
    : html`<span class="row__quick row__quick--done">✓</span>`}
  </li>`
    })}
  </ul>

  ${rows.length === 0
    ? html`<p class="empty-rows">没有待办的村子了 🎉</p>`
    : ''}

  <p class="staff-foot">
    断网时点行内操作也能记下，联网后自动同步。导出前请确认「0 条待同步」。
  </p>
</main>

<!-- 清单页也要有 toast：行内核销后必须能撤销（主路径） -->
<div class="toast" id="toast" hidden>
  <span class="toast__text" id="toast-text"></span>
  <button class="toast__undo" id="toast-undo" hidden>撤销</button>
</div>
${footer()}`,
  )
}

export function conflictsPage(opts: {
  staff: Staff
  conflicts: {
    op_id: string
    type: string
    actor_name: string
    device_id: string | null
    client_ms: number
    server_ms: number
    late_sync: number
    code: string
    display_name: string
    campsite: string | null
  }[]
}) {
  const t = (ms: number) => {
    const d = new Date(ms)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
  }
  return layout(
    { title: '冲突核对 · 村民服务站', noindex: true, bodyClass: 'is-staff' },
    html`<header class="staffbar">
  <a class="staffbar__back" href="/ops">← 清单</a>
  <span class="staffbar__mode">冲突核对</span>
  <span></span>
</header>
<main class="staff-list">
  <p class="staff-foot">同一个动作在两台设备上各记了一次。选一个保留，另一个作废。</p>
  ${opts.conflicts.length === 0 ? html`<p class="empty-rows">没有待核对的冲突 ✓</p>` : ''}
  <ul class="rows">
    ${opts.conflicts.map(
      (c) => html`<li class="conflict">
  <div class="conflict__head">
    <strong>${c.code} ${c.display_name}</strong>
    <span class="conflict__plot">${c.campsite ?? '—'}</span>
  </div>
  <p class="conflict__meta">
    ${c.type === 'checkin' ? '签到' : '礼品'} · ${c.actor_name}
    · 设备 ${c.device_id ?? '—'}
    · 事件 ${t(c.client_ms)} / 同步 ${t(c.server_ms)}
    ${c.late_sync ? html`<em>（设备时钟偏差大）</em>` : ''}
  </p>
  <div class="conflict__actions">
    <form method="post" action="/ops/conflicts/${c.op_id}/resolve">
      <input type="hidden" name="resolution" value="keep" />
      <button class="btn btn--ghost" type="submit">保留现有记录</button>
    </form>
    <form method="post" action="/ops/conflicts/${c.op_id}/resolve">
      <input type="hidden" name="resolution" value="void" />
      <button class="btn btn--ghost btn--danger" type="submit">改判为这条</button>
    </form>
  </div>
</li>`,
    )}
  </ul>
</main>
${footer()}`,
  )
}
