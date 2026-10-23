import { readFileSync } from 'node:fs'
import { html } from 'hono/html'
import { listFamilies } from '../db.ts'

const template = readFileSync(new URL('../templates/village.html', import.meta.url), 'utf8')
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )

/** 公告站：六个固定栏目 + 营地地图。签到与礼品领取均为现场纸质办理。 */
export function villagePage(view = 'card') {
  const families = listFamilies()
  const zones = [
    ...new Set(
      families.map(
        (row) => row.campsite?.match(/^[A-Za-z]+/)?.[0].toUpperCase() ?? '待安排',
      ),
    ),
  ]
  const map = html`<article class="panel"><p>按分区查看营位。这里是营位索引，实际方位请参考现场指示。</p>
    ${zones.map(
      (zone) => html`<h3>${zone}${zone === '待安排' ? '' : ' 区'}</h3><div class="map">
      ${families
        .filter(
          (row) =>
            (row.campsite?.match(/^[A-Za-z]+/)?.[0].toUpperCase() ?? '待安排') === zone,
        )
        .map(
          (row) =>
            html`<div class="pitch"><strong>${row.campsite ?? row.code}</strong><span>${row.display_name}</span></div>`,
        )}
    </div>`,
    )}
  </article>`

  const values: Record<string, string> = {
    TITLE: 'Retro Village 2026｜村民服务站',
    VIEW: escape(view),
    VILLAGE_MAP: String(map),
    GUEST_NOTE: '留言发布后，所有村民都能看到。请友善交流，不要填写手机号等个人信息。',
  }

  let page = template.replace(/\[\[([A-Z_]+)\]\]/g, (_, key: string) => values[key] ?? '')
  page = page.replace(/<section id="view-([a-z]+)"([^>]*)>/g, (_, name: string, attrs: string) => {
    const visible = name === view
    let next = attrs.replace(/class="([^"]*)"/, (_: string, cls: string) => {
      const classes = cls.split(' ').filter((c) => c !== 'hide')
      if (!visible) classes.push('hide')
      return `class="${classes.join(' ')}"`
    })
    if (!attrs.includes('class=') && !visible) next += ' class="hide"'
    return `<section id="view-${name}"${next}${visible ? '' : ' inert'}>`
  })
  if (view !== 'card') {
    page = page
      .replace('id="siteHeader"', 'id="siteHeader" class="hide"')
      .replace('class="foot" id="mainFoot"', 'class="foot hide" id="mainFoot"')
  }
  return page
}
