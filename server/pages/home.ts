import { html } from 'hono/html'
import { campScene, eyebrow, footer, icon, layout, seal, villagerHeader } from '../ui.ts'

type NavItem = { href: string; no: string; label: string; hint: string; icon: 'lantern' | 'flag' | 'map' | 'cup'; tone: string }

const NAV: NavItem[] = [
  { href: '/tips', no: '01', label: '营地 TIPS', hint: '第一次来？先看这个', icon: 'lantern', tone: 'mustard' },
  { href: '/charter', no: '02', label: '村庄公约', hint: '一起遵守的几件小事', icon: 'flag', tone: 'brick' },
  { href: '/map', no: '03', label: '营地地图', hint: '找到自己的营位', icon: 'map', tone: 'navy' },
  { href: '/nearby', no: '04', label: '周边吃饭与住宿', hint: '营地外的好去处', icon: 'cup', tone: 'forest' },
]

export function homePage(opts: { eventName: string; subtitle: string; contactName: string; address?: string }) {
  return layout(
    {
      title: 'Retro Village 村民服务站',
      description: '扫你手上的卡片二维码，看营位、读 TIPS、找服务站。',
      bodyClass: 'is-home',
    },
    html`
${villagerHeader(html`<a class="topbar__link" href="/map">营地地图</a>`)}

<main class="home">
  <section class="home-hero">
    ${campScene('home')}
    <div class="home-hero__content">
      ${eyebrow('ONE MONTH ONE DEW · FIELD STATION', '第 01 号营地手册')}
      <h1>${opts.eventName}<br /><span>村民服务站</span></h1>
      <p class="home-hero__sub">${opts.subtitle}</p>
      <div class="home-hero__meta">
        <span>${icon('calendar')} 2026 · 秋</span>
        <span>${icon('pin')} 松江 · 西郊林场</span>
      </div>
    </div>
  </section>

  <section class="ticket-note">
    <div class="ticket-note__icon">${icon('sparkle')}</div>
    <div>
      <strong>先找你的专属二维码</strong>
      <p>打开微信扫卡片上的二维码，或点家人转发给你的链接。每家一张，里面有自己的营位与状态。</p>
    </div>
    <span class="ticket-note__tear" aria-hidden="true"></span>
  </section>

  <section class="home-section">
    <div class="section-head">
      <div>
        <span class="section-head__en">VILLAGE GUIDE</span>
        <h2>村庄指北</h2>
      </div>
      <span class="section-head__no">04 页</span>
    </div>

    <nav class="nav-grid">
      ${NAV.map(
        (n) => html`<a class="nav-card nav-card--${n.tone}" href="${n.href}">
  <span class="nav-card__no">${n.no}</span>
  <span class="nav-card__icon">${icon(n.icon)}</span>
  <strong>${n.label}</strong>
  <em>${n.hint}</em>
  <span class="nav-card__arrow">${icon('arrow')}</span>
</a>`,
      )}
    </nav>
  </section>

  <section class="station-card">
    <div class="station-card__badge">${seal('帮')}</div>
    <div class="station-card__body">
      <span class="station-card__en">SERVICE STATION</span>
      <h2>有问题，来服务站</h2>
      <p>签到、领礼品、找营位、借充电线，都可以来找我们。</p>
      <div class="station-card__facts">
        <span>${icon('users')} 现场联系人 ${opts.contactName}</span>
        <span>${icon('pin')} ${opts.address ?? '松江区西茹路 1 号'}</span>
      </div>
    </div>
  </section>

  <div class="home-stamp">
    <span>EST.</span><strong>2026</strong><span>SHANGHAI</span>
  </div>
</main>
${footer()}`,
  )
}
