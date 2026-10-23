import { readFileSync } from 'node:fs'
import { html } from 'hono/html'
import { listFamilies, type FamilyWithState } from '../db.ts'

const template = readFileSync(new URL('../templates/village.html', import.meta.url), 'utf8')
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export function villagePage(family: FamilyWithState | null = null, view = 'card') {
  const f = family
  const pass = f ? html`<article class="pass">
    <div class="pass-head"><div><div class="smallcap">VILLAGER PASS · 电子村民卡</div>
      <h1 class="family" id="familyName">${f.display_name}</h1>
      <div class="unit">No. ${f.code} · 营位 ${f.campsite ?? '待安排'} · ${f.party_size} 人</div>
    </div><div class="date">NOV 28–29</div></div>
    <div class="pass-main"><div><div class="qrbox" id="qrbox"><img src="/api/v/${f.token}/qr.svg" width="160" height="160" alt="${f.display_name}的专属签到二维码" /></div>
      <div class="qrnote">出示二维码办理签到</div></div>
      <div class="statuses">
        <div class="status ${f.checkin_ms ? 'done' : ''}" id="checkinStatus"><div class="status-icon">✓</div><div><strong>入村签到</strong><small id="checkinText">${f.checkin_ms ? '已完成签到' : '等待工作人员确认'}</small></div><div class="state" id="checkinState">${f.checkin_ms ? '已签到' : '待签到'}</div></div>
        <div class="status ${f.gift_ms ? 'done' : ''}" id="giftStatus"><div class="status-icon">✦</div><div><strong>村礼领取</strong><small id="giftText">${f.gift_ms ? '已完成领取' : '每户一份'}</small></div><div class="state" id="giftState">${f.gift_ms ? '已领取' : '待领取'}</div></div>
      </div>
    </div><p class="sync-note" id="cardSync" role="status">状态由服务站同步</p>
  </article>` : html`<article class="pass welcome"><div class="smallcap">RETRO VILLAGE 2026</div>
    <h1 class="family">欢迎来到复古村庄</h1><p>扫你的专属二维码，查看营位、签到与村礼状态。</p>
    <p class="unit">还没有村民卡？请联系现场服务站。</p></article>`
  const families = listFamilies()
  const zones = [...new Set(families.map(row => row.campsite?.match(/^[A-Za-z]+/)?.[0].toUpperCase() ?? '待安排'))]
  const map = html`<article class="panel"><p>按分区查看营位。这里是营位索引，实际方位请参考现场指示。</p>
    ${f ? html`<p class="my-pitch">你的营位：<strong>${f.campsite ?? '待安排'}</strong></p>` : ''}
    ${zones.map(zone => html`<h3>${zone}${zone === '待安排' ? '' : ' 区'}</h3><div class="map">
      ${families.filter(row => (row.campsite?.match(/^[A-Za-z]+/)?.[0].toUpperCase() ?? '待安排') === zone)
        .map(row => html`<div class="pitch ${row.id === f?.id ? 'active' : ''}"><strong>${row.campsite ?? row.code}</strong><span>${row.display_name}</span></div>`)}
    </div>`)}
  </article>`
  const values: Record<string, string> = {
    TITLE: escape(f ? `${f.display_name} · Retro Village 村民服务站` : 'Retro Village 2026｜村民服务站'),
    TOKEN: escape(f?.token ?? ''), VIEW: escape(view), PASS: String(pass), VILLAGE_MAP: String(map),
    GUEST_NOTE: f ? '留言发布后，所有村民都能看到。请友善交流，不要填写手机号等个人信息。' : '欢迎浏览村民留言。请从你的专属村民卡进入后发布。',
  }
  let page = template.replace(/\[\[([A-Z_]+)\]\]/g, (_, key: string) => values[key] ?? '')
  page = page.replace(/<section id="view-([a-z]+)"([^>]*)>/g, (_, name: string, attrs: string) => {
    const visible = name === view
    let next = attrs.replace(/class="([^"]*)"/, (_: string, cls: string) => `class="${cls.split(' ').filter(c => c !== 'hide').concat(visible ? [] : ['hide']).join(' ')}"`)
    if (!attrs.includes('class=') && !visible) next += ' class="hide"'
    return `<section id="view-${name}"${next}${visible ? '' : ' inert'}>`
  })
  if (view !== 'card') page = page.replace('id="siteHeader"', 'id="siteHeader" class="hide"').replace('class="foot" id="mainFoot"', 'class="foot hide" id="mainFoot"')
  return page
}
