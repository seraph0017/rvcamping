import { html } from 'hono/html'
import type { FamilyWithState, Staff } from '../db.ts'
import type { Summary } from '../ops.ts'
import { campScene, eyebrow, footer, icon, layout, seal } from '../ui.ts'

export function loginPage(opts: { error?: string }) {
  return layout(
    {
      title: '工作人员登录 · 村民服务站',
      noindex: true,
      bodyClass: 'is-staff is-login',
    },
    html`<header class="staffbar staffbar--plain">
  <a class="staffbar__back" href="/">← 返回</a>
  <span class="staffbar__mode">FIELD STATION · OPS</span>
  <span class="staffbar__spacer"></span>
</header>

<main class="staff-login">
  <section class="login-hero">
    ${campScene('login')}
    <div class="login-hero__content">
      ${eyebrow('STAFF ONLY · 现场操作台', '工作人员入口')}
      <h1>今天，<br />由你守着服务站。</h1>
      <p>签到、发礼品、找营位。一个 PIN 进入现场清单。</p>
    </div>
  </section>

  <section class="login-card">
    <div class="login-card__head">
      <span class="login-card__seal">${seal('RV')}</span>
      <div>
        <span class="login-card__en">ACCESS TICKET</span>
        <h2>输入你的 PIN</h2>
      </div>
    </div>

    ${opts.error ? html`<p class="form-error">${icon('alert')} ${opts.error}</p>` : ''}

    <form method="post" action="/ops/login" class="staff-login__form" autocomplete="off">
      <label class="pin-field">
        <span>PIN CODE</span>
        <input
          class="pin-input"
          name="pin"
          type="password"
          inputmode="numeric"
          pattern="[0-9]*"
          maxlength="8"
          placeholder="••••"
          autocomplete="off"
          autofocus
          required
        />
      </label>
      <button class="btn btn--primary" type="submit">
        <span>进入现场清单</span>
        <em>${icon('arrow')}</em>
      </button>
    </form>

    <p class="staff-login__hint">
      ${icon('shield')} 本机记住 30 天，不用每次输。
    </p>
  </section>

  <div class="login-notes">
    <span>${icon('offline')} 断网也能核销</span>
    <span>${icon('list')} 编号 / 姓名都能查</span>
    <span>${icon('sync')} 联网自动同步</span>
  </div>

  <p class="staff-login__foot">第一次用？先点清单里的「预载离线包」，再去门口接人。</p>
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
  const doneCount = opts.summary.total - pending.length

  return layout(
    {
      title: '现场服务台 · 村民服务站',
      noindex: true,
      bodyClass: 'is-staff',
      script: 'staff',
      bodyAttrs: 'data-mode="list"',
    },
    html`<header class="staffbar">
  <a class="staffbar__back" href="/">← 返回</a>
  <span class="staffbar__mode"><i class="live-dot"></i>${opts.staff.name}${opts.staff.role === 'admin' ? ' · 管理员' : ''}</span>
  <a class="staffbar__exit" href="/ops/logout">退出</a>
</header>

<main class="staff-list ops-page">
  <section class="ops-hero">
    <div class="ops-hero__head">
      <div>
        ${eyebrow('FIELD OPERATIONS · TODAY', '现场服务台')}
        <h1>今天还有 <em>${pending.length}</em> 家<br />需要照顾</h1>
        <p>点一行直接核销，或扫村民卡。忙不过来就先预载离线包。</p>
      </div>
      <span class="ops-hero__stamp">${seal('签')}</span>
    </div>

    <div class="progress">
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
    </div>
    <div class="ops-hero__bar" aria-hidden="true"><span style="width:${opts.summary.total ? Math.round((doneCount / opts.summary.total) * 100) : 0}%"></span></div>
  </section>

  ${opts.summary.conflicts > 0
    ? html`<a class="alertbar" href="/ops/conflicts">${icon('alert')} ${opts.summary.conflicts} 条冲突待核对 <em>去处理 →</em></a>`
    : ''}

  <div class="syncbar" id="syncbar" hidden>
    <span id="syncbar-text"></span>
    <button class="linkish" id="sync-now">立即同步</button>
  </div>

  <section class="ops-tools">
    <form class="lookup" method="get" action="/ops/lookup" autocomplete="off">
      <span class="lookup__icon">${icon('search')}</span>
      <input
        class="lookup__input"
        id="lookup"
        name="q"
        type="text"
        inputmode="numeric"
        placeholder="编号 / 姓名，如 005 或 大熊家"
        value="${opts.query}"
        autocomplete="off"
      />
      <button class="btn btn--primary lookup__go" type="submit">查找</button>
    </form>

    <div class="tabs">
      <a class="tab ${opts.tab === 'pending' ? 'is-on' : ''}" href="/ops?tab=pending">待办 <b>${pending.length}</b></a>
      <a class="tab ${opts.tab === 'all' ? 'is-on' : ''}" href="/ops?tab=all">全部 <b>${opts.families.length}</b></a>
      <button class="tab tab--ghost" id="preload">${icon('download')} 预载离线包</button>
    </div>
  </section>

  <div class="section-head section-head--compact ops-listhead">
    <div>
      <span class="section-head__en">${opts.tab === 'pending' ? 'STILL WAITING' : 'ALL FAMILIES'}</span>
      <h2>${opts.tab === 'pending' ? '待办名单' : '全部名单'}</h2>
    </div>
    <span class="section-head__no">${rows.length} 家</span>
  </div>

  <ul class="rows" id="rows">
    ${rows.map((f) => {
      const done = f.checkin_ms !== null && f.gift_ms !== null
      const quick =
        done
          ? null
          : f.checkin_ms === null && f.gift_ms === null
            ? { action: 'both', label: '签到 + 领礼' }
            : f.checkin_ms === null
              ? { action: 'checkin', label: '补签到' }
              : { action: 'gift', label: '发礼品' }
      const state = done ? '已完成' : f.checkin_ms !== null ? '已签到 · 待领礼' : f.gift_ms !== null ? '已领礼 · 待签到' : '未办理'
      return html`<li class="row ${done ? 'is-done' : ''}" data-token="${f.token}">
  <a class="row__main" href="/v/${f.token}">
    <span class="row__code">${f.code}</span>
    <span class="row__body">
      <span class="row__name">${f.display_name}</span>
      <span class="row__plot">${f.campsite ?? '—'} · ${f.party_size} 人${f.kids > 0 ? ` / ${f.kids} 小` : ''} · ${state}</span>
    </span>
    <span class="row__flags" aria-label="状态">
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
    ? html`<div class="empty-rows">
  <span>${seal('✓')}</span>
  <strong>这一页清空了</strong>
  <p>${opts.tab === 'pending' ? '所有家庭都已签到并领到礼品。' : '还没有导入名单。'}</p>
</div>`
    : ''}

  <p class="staff-foot">${icon('offline')} 断网时点行内操作也会先记下，联网后自动同步。导出前请确认「0 条待同步」。</p>
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
  <span class="staffbar__spacer"></span>
</header>
<main class="staff-list conflict-page">
  <section class="conflict-hero">
    ${eyebrow('DOUBLE ENTRY · REVIEW', '冲突核对')}
    <h1>${opts.conflicts.length} 条记录<br />需要你拍板</h1>
    <p>同一个动作在两台设备上各记了一次。选一个保留，另一个作废。拿不准就问当事人。</p>
  </section>

  ${opts.conflicts.length === 0
    ? html`<div class="empty-rows">
  <span>${seal('✓')}</span>
  <strong>没有待核对的冲突</strong>
  <p>所有记录都只有一条有效流水。</p>
  <a class="btn btn--ghost btn--inline" href="/ops">回到现场清单</a>
</div>`
    : ''}

  <ul class="conflict-list">
    ${opts.conflicts.map(
      (c) => html`<li class="conflict">
  <div class="conflict__head">
    <span class="conflict__type">${icon(c.type === 'checkin' ? 'checkin' : 'gift')} ${c.type === 'checkin' ? '签到' : '礼品'}</span>
    <span class="conflict__plot">${c.campsite ?? '—'}</span>
  </div>
  <h2><span>${c.code}</span> ${c.display_name}</h2>
  <dl class="conflict__meta">
    <div><dt>操作人</dt><dd>${c.actor_name}</dd></div>
    <div><dt>设备</dt><dd>${c.device_id ?? '—'}</dd></div>
    <div><dt>事件时间</dt><dd>${t(c.client_ms)}</dd></div>
    <div><dt>同步时间</dt><dd>${t(c.server_ms)}</dd></div>
  </dl>
  ${c.late_sync ? html`<p class="conflict__warn">${icon('alert')} 设备时钟偏差较大，以服务端顺序为准。</p>` : ''}
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
