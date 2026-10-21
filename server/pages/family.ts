import { html } from 'hono/html'
import { campsiteInfo, type FamilyWithState, type Staff } from '../db.ts'
import { abs, eyebrow, fmtTime, footer, icon, layout, seal, statusStamp, villagerHeader } from '../ui.ts'

type Neighbor = Pick<FamilyWithState, 'display_name' | 'campsite' | 'code'> | null

type Opts = {
  family: FamilyWithState
  staff: Staff | null
  contactName: string
  giftName: string
  refresh?: boolean
  neighbors?: { prev: Neighbor; next: Neighbor }
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
        neighbors: o.neighbors,
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
  neighbors?: { prev: Neighbor; next: Neighbor }
}

function villagerCard(o: VillagerOpts) {
  const f = o.family
  const kidsText = f.kids > 0 ? `含 ${f.kids} 位小朋友` : '大人局'
  return html`
${villagerHeader(html`<a class="topbar__link" href="/v/${f.token}/map">${icon('map')} 地图</a>`)}

<!-- 分享卡片封面：必须是页面第一张真实 <img>，微信取它当缩略图（DESIGN §8.6） -->
<div class="share-cover">
  <img class="cover" src="${abs('/assets/cover.png')}" width="800" height="400"
       alt="Retro Village 复古露营 · ${f.display_name}" />
  <div class="share-cover__label"><span>RETRO VILLAGE</span><i>村民专属营位卡</i></div>
</div>

<main class="card-page">
  <section class="pass">
    <span class="pass__notch pass__notch--l" aria-hidden="true"></span>
    <span class="pass__notch pass__notch--r" aria-hidden="true"></span>

    <div class="pass__top">
      <span class="pass__no">NO. ${f.code}</span>
      <span class="pass__badge">${o.checkedIn && o.giftDone ? '全部完成' : o.checkedIn ? '已签到' : '待签到'}</span>
    </div>

    <div class="pass__head">
      <div>
        ${eyebrow('CAMPER FAMILY', '欢迎回到西郊林场')}
        <h1 class="pass__name">${f.display_name}</h1>
      </div>
      <div class="pass__seal">${seal('营')}</div>
    </div>

    <div class="pass__plot">
      <div class="pass__plot-main">
        <span class="pass__plot-label">YOUR CAMPSITE</span>
        <div class="pass__plot-no">${f.campsite ?? '—'}</div>
        <div class="pass__plot-meta">
          <span>${o.zoneText}</span>
          <span class="dot">·</span>
          <span>${f.party_size} 人</span>
        </div>
      </div>
      <div class="pass__compass">
        ${icon('compass')}
        <span>N</span>
      </div>
    </div>

    <div class="pass__chips">
      <span>${icon('users')} ${f.party_size} 人</span>
      <span>${icon('heart')} ${kidsText}</span>
      <span>${icon('tree')} ${campsiteInfo(f.campsite)?.zone ?? '—'} 区</span>
    </div>

    <div class="pass__perf" aria-hidden="true"><span>✦</span></div>

    <a class="pass__map" href="/v/${f.token}/map">
      <span>${icon('route')} 看地图找营位</span>
      <span class="pass__map-arrow">${icon('arrow')}</span>
    </a>
  </section>

  <section class="status-section">
    <div class="section-head section-head--compact">
      <div>
        <span class="section-head__en">CHECK-IN STATUS</span>
        <h2>今日状态</h2>
      </div>
      <span class="section-head__no">${o.checkedIn && o.giftDone ? '2 / 2' : o.checkedIn || o.giftDone ? '1 / 2' : '0 / 2'}</span>
    </div>
    <div class="stamps">
      ${statusStamp('签到', o.checkedIn, o.checkedIn ? `${fmtTime(f.checkin_ms)} 已完成` : '到服务站办理', 'checkin')}
      ${statusStamp('礼品', o.giftDone, o.giftDone ? `${fmtTime(f.gift_ms)} 已领取` : `${o.giftName} · 1 份 / 家`, 'gift')}
    </div>
    <p class="stamps-note">
      ${o.checkedIn
        ? o.giftDone
          ? '这一家都办好了。祝你们在西郊林场玩得开心。'
          : '已签到。礼品在服务站领取，工作人员扫码确认。'
        : '到服务站找工作人员，扫这张卡上的二维码即可签到并领取礼品。'}
    </p>
  </section>

  ${o.neighbors && (o.neighbors.prev || o.neighbors.next)
    ? html`<section class="neighbors">
  <div class="neighbors__label">${icon('handshake')} 你的邻居</div>
  <div class="neighbors__row">
    ${o.neighbors.prev
      ? html`<div class="neighbor"><span>← ${o.neighbors.prev.campsite ?? '—'}</span><strong>${o.neighbors.prev.display_name}</strong></div>`
      : html`<div class="neighbor neighbor--empty"><span>←</span><strong>营地边界</strong></div>`}
    ${o.neighbors.next
      ? html`<div class="neighbor neighbor--right"><span>${o.neighbors.next.campsite ?? '—'} →</span><strong>${o.neighbors.next.display_name}</strong></div>`
      : html`<div class="neighbor neighbor--right neighbor--empty"><span>→</span><strong>营地边界</strong></div>`}
  </div>
</section>`
    : ''}

  <section class="home-section home-section--tight">
    <div class="section-head section-head--compact">
      <div>
        <span class="section-head__en">VILLAGE GUIDE</span>
        <h2>村庄指北</h2>
      </div>
      <span class="section-head__no">04 页</span>
    </div>

    <nav class="nav-grid nav-grid--compact">
      <a class="nav-card nav-card--navy" href="/v/${f.token}/map">
        <span class="nav-card__no">01</span>
        <span class="nav-card__icon">${icon('map')}</span>
        <strong>营地地图</strong><em>找到自己的营位</em>
        <span class="nav-card__arrow">${icon('arrow')}</span>
      </a>
      <a class="nav-card nav-card--mustard" href="/tips">
        <span class="nav-card__no">02</span>
        <span class="nav-card__icon">${icon('lantern')}</span>
        <strong>营地 TIPS</strong><em>第一次来先看</em>
        <span class="nav-card__arrow">${icon('arrow')}</span>
      </a>
      <a class="nav-card nav-card--brick" href="/charter">
        <span class="nav-card__no">03</span>
        <span class="nav-card__icon">${icon('flag')}</span>
        <strong>村庄公约</strong><em>一起遵守的小事</em>
        <span class="nav-card__arrow">${icon('arrow')}</span>
      </a>
      <a class="nav-card nav-card--forest" href="/nearby">
        <span class="nav-card__no">04</span>
        <span class="nav-card__icon">${icon('cup')}</span>
        <strong>周边推荐</strong><em>营地外的好去处</em>
        <span class="nav-card__arrow">${icon('arrow')}</span>
      </a>
    </nav>
  </section>

  <section class="help">
    <span class="help__seal">${seal('帮')}</span>
    <div class="help__body">
      <span class="help__en">NEED A HAND?</span>
      <strong>有问题？找服务站</strong>
      <p>现场联系人：${o.contactName} · 签到 / 礼品 / 找营位 / 充电</p>
    </div>
  </section>

  ${o.refresh === false
    ? ''
    : html`<p class="refresh"><button class="refresh__btn" onclick="location.reload()">${icon('sync')} 刷新最新状态</button></p>`}
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
  const complete = o.checkedIn && o.giftDone
  return html`
<header class="staffbar">
  <a class="staffbar__back" href="/ops">← 清单</a>
  <span class="staffbar__mode">工作人员模式 · ${o.staff.name}</span>
  <a class="staffbar__exit" href="/ops/logout">退出</a>
</header>

<main class="staff-page">
  <section class="scan-card ${complete ? 'is-complete' : ''}">
    <div class="scan-card__watermark">${f.code}</div>
    <div class="scan-card__top">
      <span>NO. ${f.code}</span>
      <span class="scan-card__state">${complete ? '已完成' : '核销中'}</span>
    </div>
    <h1 class="staff-name">${f.display_name}</h1>
    <p class="staff-sub">
      <strong>${f.head_name ?? '—'}</strong>
      <span class="dot">·</span> ${f.campsite ?? '—'}（${o.zoneText}）
      <span class="dot">·</span> ${f.party_size} 人
    </p>
    <div class="scan-card__chips">
      <span>${icon('pin')} ${o.zoneText}</span>
      <span>${icon('users')} ${f.party_size} 人${f.kids > 0 ? ` / ${f.kids} 位小朋友` : ''}</span>
    </div>
    ${f.note ? html`<p class="staff-note">${icon('alert')} 备注：${f.note}</p>` : ''}
  </section>

  <section class="staff-status">
    <div class="staff-status__row ${o.checkedIn ? 'is-done' : ''}">
      <span class="staff-status__icon">${icon('checkin')}</span>
      <span class="staff-status__k">签到</span>
      <span class="staff-status__v">
        ${o.checkedIn ? `✓ ${fmtTime(f.checkin_ms)} · ${f.checkin_by ?? ''}` : '未签到'}
      </span>
    </div>
    <div class="staff-status__row ${o.giftDone ? 'is-done' : ''}">
      <span class="staff-status__icon">${icon('gift')}</span>
      <span class="staff-status__k">礼品</span>
      <span class="staff-status__v">
        ${o.giftDone ? `✓ ${fmtTime(f.gift_ms)} · ${f.gift_by ?? ''}` : '未领取（1 份/家）'}
      </span>
    </div>
  </section>

  <section class="staff-actions">
    ${o.primary
      ? html`<button class="btn btn--primary" data-action="${o.primary.action}">
               <span>${o.primary.label}</span>
               <em>${icon('arrow')}</em>
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

  <p class="staff-foot" id="status-line">${icon('offline')} 离线也能核销：断网时会先记录，联网后自动同步。</p>
</main>

<div class="toast" id="toast" hidden>
  <span class="toast__text" id="toast-text"></span>
  <button class="toast__undo" id="toast-undo" hidden>撤销</button>
</div>`
}
