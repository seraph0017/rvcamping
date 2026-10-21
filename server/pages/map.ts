import { html, raw } from 'hono/html'
import type { HtmlEscapedString } from 'hono/utils/html'
import { campsiteInfo, type FamilyWithState } from '../db.ts'
import { contentShell, footer, layout, villagerHeader } from '../ui.ts'

type ZoneBlock = HtmlEscapedString | Promise<HtmlEscapedString>

/** 地图：有 map.json + svg 时用真图，否则分区网格兜底（DESIGN §8.4） */
export function mapPage(opts: {
  families: FamilyWithState[]
  self: FamilyWithState | null
  mapSvg?: string | null
}) {
  const zones = new Map<string, FamilyWithState[]>()
  for (const f of opts.families) {
    const info = campsiteInfo(f.campsite)
    const zone = info?.zone ?? '·'
    const list = zones.get(zone)
    if (list) list.push(f)
    else zones.set(zone, [f])
  }
  const order = [...zones.keys()].sort()

  const zoneBlocks: ZoneBlock[] = order.map(
    (zone) => html`<section class="zone">
  <h2 class="zone__title">${zone} 区</h2>
  <div class="zone__grid">
    ${zones.get(zone)!.map((f) => {
      const isSelf = opts.self?.id === f.id
      return html`<div class="plotslot ${isSelf ? 'is-self' : ''}">
  <div class="plotslot__num">${f.campsite ?? '—'}</div>
  <div class="plotslot__name">${f.display_name}</div>
  ${isSelf ? html`<div class="plotslot__you">你在这里</div>` : ''}
</div>`
    })}
  </div>
</section>`,
  )

  const body = html`${opts.mapSvg ? html`<div class="map-figure">${raw(opts.mapSvg)}</div>` : ''}
${zoneBlocks}
${order.length === 0 ? html`<p class="placeholder">营位信息还没导入。</p>` : ''}
<p class="map-note">营位以现场标识为准。找不到就直接问服务站。</p>`

  if (opts.self) {
    const selfZone = campsiteInfo(opts.self.campsite)
    return layout(
      { title: `营地地图 · ${opts.self.display_name}`, bodyClass: 'is-map' },
      html`${villagerHeader(html`<a class="topbar__link" href="/v/${opts.self.token}">我的卡</a>`)}
<main class="map-page">
  <div class="page-title">
    <h1>营地地图</h1>
    <p class="page-title__sub">你的营位：${opts.self.campsite ?? '—'}（${selfZone?.zone ?? '?'} 区）</p>
  </div>
  ${body}
  <p class="backlink"><a href="/v/${opts.self.token}">← 返回我的营位卡</a></p>
</main>
${footer()}`,
    )
  }

  return layout(
    {
      title: '营地地图 · Retro Village',
      description: '一月一露西郊林场营位分布',
      bodyClass: 'is-map',
    },
    contentShell('营地地图', '一月一露 · 西郊林场', body, '/'),
  )
}
