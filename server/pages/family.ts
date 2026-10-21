import { html, raw } from 'hono/html'
import { campsiteInfo, type FamilyWithState, type Staff } from '../db.ts'
import { abs, fmtTime, layout, seal, statusStamp, villagerHeader, footer } from '../ui.ts'

type Opts = {
  family: FamilyWithState
  staff: Staff | null
  contactName: string
  giftName: string
  refresh?: boolean
}

/** 村民视角：只读。工作人员视角：同一 URL + 会话，顶部多一条核销条。 */
export function familyPage(o: Opts) {
  const f = o.family
  const info = campsiteInfo(f.campsite)
  const checkedIn = f.checkin_ms !== null
  const giftDone = f.gift_ms !== null
  const staffMode = !!o.staff

  const title = staffMode
    ? `${String(f.code)} ${f.display_name} · 核销`
    : `${f.display_name} · Retro Village 村民服务站`

  const desc = `${f.campsite ?? '营位待定'} 营位 · 一月一露西郊林场`

  // 主按钮文案随状态自适应（DESIGN §8.3）
  const primary = !checkedIn && !giftDone
    ? { action: 'both', label: '签到 + 领礼品' }
    : checkedIn && !giftDone
      ? { action: 'gift', label: '领礼品' }
      : !checkedIn && giftDone
        ? { action: 'checkin', label: '签到' }
        : null

  const zoneText = info ? `${info.zone} 区 · 第 ${info.index} 位` : '营位待定'

  const body = staffMode
    ? staffCard({ family: f, staff: o.staff!, primary, checkedIn, giftDone, zoneText })
    : villagerCard({
        family: f,
        checkedIn,
        giftDone,
        zoneText,
        contactName: o.contactName,
        giftName: o.giftName,
        refresh: o.refresh,
      })

  return layout(
    {
      title,
      description: desc,
      cover: abs('/assets/cover.png'),
      bodyClass: staffMode ? 'is-staff' : 'is-villager',
      script: staffMode ? 'staff' : null,
      bodyAttrs: staffMode ? `data-token="${f.token}" data-code="${f.code}" data-mode="card"` : '',
    },
    body,
  )
}

type VillagerOpts = {
  family: FamilyWithState
  checkedIn: boolean
  giftDone: boolean
  zoneText: string
  contactName: string
  giftName: string
  refresh?: boolean
}

function villagerCard(o: VillagerOpts) {
  const f = o.family
  return html`
${villagerHeader(html`<a class="topbar__link" href="/v/${f.token}/map">地图</a>`)}

<!-- 分享卡片封面：必须是页面第一张真实 <img>，微信取它当缩略图（DESIGN §8.6） -->
<img class="cover" src="${abs('/assets/cover.png')}" width="800" height="400"
     alt="Retro Village 复古露营 · ${f.display_name}" />

<main class="card-page">
  <div class="card-head">
    <div class="card-code">No.${f.code}</div>
    <h1 class="card-name">${f.display_name}</h1>
  </div>

  <section class="plot">
    <div class="plot__campsite">${f.campsite ?? '—'}</div>
    <div class="plot__meta">
      <span>${o.zoneText}</span>
      <span class="dot">·</span>
      <span>${f.party_size} 人${f.kids > 0 ? `（含 ${f.kids} 位小朋友）` : ''}</span>
    </div>
    <a class="plot__map" href="/v/${f.token}/map">看地图找营位 →</a>
  </section>

  <section class="stamps">
    ${statusStamp('签到', o.checkedIn, o.checkedIn ? `${fmtTime(f.checkin_ms)}` : '到服务站办理')}
    ${statusStamp('礼品', o.giftDone, o.giftDone ? `${fmtTime(f.gift_ms)}` : '1 份 / 家')}
  </section>

  <p class="stamps-note">
    ${o.checkedIn
      ? '已签到。礼品在服务站领取，工作人员扫码确认。'
      : '到服务站找工作人员，扫这张卡上的二维码即可签到并领取礼品。'}
  </p>

  <nav class="links">
    <div class="links__title">村庄指北</div>
    <a class="links__item" href="/v/${f.token}/map">
      <span class="links__label">营地地图</span>
      <span class="links__hint">找到自己的营位</span>
    </a>
    <a class="links__item" href="/tips">
      <span class="links__label">营地 TIPS</span>
      <span class="links__hint">第一次来？先看这个</span>
    </a>
    <a class="links__item" href="/charter">
      <span class="links__label">村庄公约</span>
      <span class="links__hint">一起遵守的几件小事</span>
    </a>
    <a class="links__item" href="/nearby">
      <span class="links__label">周边吃饭与住宿</span>
      <span class="links__hint">营地外的好去处</span>
    </a>
  </nav>

  <div class="help">
    <span class="help__seal">${seal('帮')}</span>
    <div>
      <strong>有问题？找服务站</strong>
      <p>现场联系人：${o.contactName}</p>
    </div>
  </div>

  ${o.refresh === false
    ? ''
    : html`<p class="refresh"><a href="/v/${f.token}?r=1">刷新状态</a></p>`}
</main>
${footer()}`
}

type StaffCardOpts = {
  family: FamilyWithState
  staff: Staff
  primary: { action: string; label: string } | null
  checkedIn: boolean
  giftDone: boolean
  zoneText: string
}

function staffCard(o: StaffCardOpts) {
  const f = o.family
  return html`
<header class="staffbar">
  <a class="staffbar__back" href="/ops">← 清单</a>
  <span class="staffbar__mode">工作人员模式 · ${o.staff.name}</span>
  <a class="staffbar__exit" href="/ops/logout">退出</a>
</header>

<main class="staff-page">
  <div class="staff-head">
    <div class="staff-code">No.${f.code}</div>
    <h1 class="staff-name">${f.display_name}</h1>
    <p class="staff-sub">
      <strong>家长 ${f.head_name ?? '—'}</strong>
      <span class="dot">·</span> ${f.campsite ?? '—'}（${o.zoneText}）
      <span class="dot">·</span> ${f.party_size} 人
    </p>
    ${f.note ? html`<p class="staff-note">备注：${f.note}</p>` : ''}
  </div>

  <section class="staff-status">
    <div class="staff-status__row ${o.checkedIn ? 'is-done' : ''}">
      <span class="staff-status__k">签到</span>
      <span class="staff-status__v">
        ${o.checkedIn ? `✓ ${fmtTime(f.checkin_ms)} · ${f.checkin_by ?? ''}` : '未签到'}
      </span>
    </div>
    <div class="staff-status__row ${o.giftDone ? 'is-done' : ''}">
      <span class="staff-status__k">礼品</span>
      <span class="staff-status__v">
        ${o.giftDone ? `✓ ${fmtTime(f.gift_ms)} · ${f.gift_by ?? ''}` : '未领取（1 份/家）'}
      </span>
    </div>
  </section>

  <section class="staff-actions">
    ${o.primary
      ? html`<button class="btn btn--primary" data-action="${o.primary.action}">
               ${o.primary.label}
             </button>`
      : html`<button class="btn btn--primary" disabled>这一家都办完了 ✓</button>`}

    <div class="staff-minor">
      ${o.primary && o.primary.action === 'both'
        ? html`<button class="linkish" data-action="checkin">只签到</button>
                 <button class="linkish" data-action="gift">只领礼品</button>`
        : ''}
      ${o.checkedIn || o.giftDone
        ? html`<button class="linkish linkish--danger" data-undo="all">撤回本家操作</button>`
        : ''}
    </div>
  </section>

  <p class="staff-foot" id="status-line">离线也能核销：断网时会先记录，联网后自动同步。</p>
</main>

<div class="toast" id="toast" hidden>
  <span class="toast__text" id="toast-text"></span>
  <button class="toast__undo" id="toast-undo" hidden>撤销</button>
</div>`
}
