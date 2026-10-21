import { html, raw } from 'hono/html'
import type { HtmlEscapedString } from 'hono/utils/html'
import { campsiteInfo, type FamilyWithState } from '../db.ts'
import { eyebrow, footer, icon, layout, seal, villagerHeader } from '../ui.ts'

type ZoneBlock = HtmlEscapedString | Promise<HtmlEscapedString>

/** 没有真实 map.svg 时，用一张手绘动线示意图兜底，而不是只给文字名单。 */
function schematicMap(
  zoneOrder: string[],
  selfZone: string | null,
  selfCampsite: string | null,
  zoneCounts: Record<string, number>,
) {
  const positions: Record<string, { x: number; y: number }> = {
    A: { x: 42, y: 52 },
    B: { x: 245, y: 86 },
    C: { x: 448, y: 52 },
  }
  const letters = zoneOrder.length ? zoneOrder.filter((z) => positions[z]) : ['A', 'B', 'C']
  const zones = letters.map((letter) => ({
    letter,
    ...positions[letter]!,
    count: `${zoneCounts[letter] ?? 0} 个营位`,
  }))

  return html`<section class="camp-schematic" aria-labelledby="camp-schematic-title">
  <div class="camp-schematic__head">
    <div>
      <span class="camp-schematic__en">HAND-DRAWN OVERVIEW</span>
      <strong id="camp-schematic-title">营地动线示意</strong>
    </div>
    <em>不是比例尺 · 现场以标识为准</em>
  </div>
  <div class="camp-schematic__frame">
    <svg class="camp-schematic__svg" viewBox="0 0 640 430" role="img" aria-label="营地动线示意图：A、B、C 三个营区、服务站、营火区与码头钓场">
      <defs>
        <pattern id="camp-grid" width="22" height="22" patternUnits="userSpaceOnUse">
          <path d="M22 0H0V22" fill="none" stroke="#c8b58f" stroke-width=".65" opacity=".55" />
        </pattern>
        <pattern id="camp-hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <path d="M0 0V9" stroke="#d9c7a0" stroke-width="2" opacity=".7" />
        </pattern>
      </defs>

      <rect width="640" height="430" fill="#f2e6ca" />
      <rect width="640" height="430" fill="url(#camp-grid)" />

      <!-- 林地边缘 -->
      <g class="camp-schematic__trees" fill="#4f6a4c" opacity=".52">
        <path d="M20 24 8 46h24L20 24Zm0 22-12 24h24L20 46Z" />
        <path d="M58 12 46 34h24L58 12Zm0 22L46 58h24L58 34Z" />
        <path d="M588 22l-12 22h24l-12-22Zm0 22-12 24h24l-12-24Z" />
        <path d="M620 6 608 28h24L620 6Zm0 22-12 24h24l-12-24Z" />
        <circle cx="34" cy="410" r="18" />
        <circle cx="63" cy="416" r="13" />
        <circle cx="604" cy="398" r="20" />
        <circle cx="632" cy="408" r="13" />
      </g>

      <!-- 营地道路 -->
      <path d="M-18 276C88 246 154 292 254 276s144-64 238-44 102 4 166-14" fill="none" stroke="#d8c49b" stroke-width="54" stroke-linecap="round" />
      <path d="M-18 276C88 246 154 292 254 276s144-64 238-44 102 4 166-14" fill="none" stroke="#9f8a63" stroke-width="1.8" stroke-dasharray="9 11" opacity=".85" />
      <text x="22" y="306" class="camp-schematic__road-label">营地道路 · CAMP ROAD</text>

      <!-- 三个营区 -->
      ${zones.map(
        (z) => html`<g transform="translate(${z.x} ${z.y})">
  <rect width="150" height="124" rx="12" fill="#fbf3df" stroke="#1d2a1f" stroke-width="2.2" />
  <rect x="8" y="8" width="134" height="108" rx="8" fill="url(#camp-hatch)" opacity=".24" />
  <text x="126" y="52" class="camp-schematic__zone-letter" text-anchor="middle">${z.letter}</text>
  <text x="16" y="37" class="camp-schematic__zone-title">${z.letter} 区</text>
  <text x="16" y="56" class="camp-schematic__zone-sub">${z.count}</text>
  <g class="camp-schematic__plots">
    ${Array.from({ length: 8 }).map(
      (_x, i) => html`<rect x="${16 + (i % 4) * 30}" y="${68 + Math.floor(i / 4) * 24}" width="24" height="16" rx="3" />`,
    )}
  </g>
  ${selfZone === z.letter
    ? html`<g transform="translate(14 88)">
  <rect width="112" height="24" rx="12" fill="#a6432b" />
  <circle cx="14" cy="12" r="4" fill="#fbf4e4" />
  <text x="24" y="16" class="camp-schematic__you">你在这里 ${selfCampsite ?? ''}</text>
</g>`
    : ''}
</g>`,
      )}

      <!-- 服务站 -->
      <g transform="translate(42 332)">
        <rect width="154" height="62" rx="10" fill="#1c2f22" stroke="#101a12" stroke-width="2" />
        <path d="M14 20h18v24H14zM18 14h10l4 6H14l4-6Z" fill="#efd48d" />
        <text x="44" y="27" class="camp-schematic__facility-title light">服务站</text>
        <text x="44" y="45" class="camp-schematic__facility-sub light">签到 · 礼品 · 问路</text>
      </g>

      <!-- 营火区 -->
      <g transform="translate(258 344)">
        <circle cx="30" cy="30" r="28" fill="#f3d9a2" opacity=".55" />
        <path d="M30 8c11 10 16 17 16 26a16 16 0 0 1-32 0c0-7 5-13 9-18 1 5 3 8 6 10-1-7 0-13 1-18Z" fill="#d97b2d" stroke="#8e3d1c" stroke-width="1.5" />
        <text x="66" y="26" class="camp-schematic__facility-title">营火区</text>
        <text x="66" y="44" class="camp-schematic__facility-sub">明火只在这里</text>
      </g>

      <!-- 码头钓场 -->
      <g transform="translate(424 334)">
        <path d="M8 20c30-18 88-18 118 0-6 26-34 38-59 38S14 46 8 20Z" fill="#a9c4c2" stroke="#4f7170" stroke-width="2" />
        <path d="M24 26c22-9 60-9 84 0M40 42c14 5 34 5 48 0" fill="none" stroke="#f4ead4" stroke-width="2" opacity=".8" />
        <path d="M130 30h28M134 30v20M154 30v20" stroke="#7c5b36" stroke-width="3" stroke-linecap="round" />
        <text x="8" y="-8" class="camp-schematic__facility-title">码头钓场</text>
      </g>

      <!-- 指南针 -->
      <g transform="translate(566 330)" class="camp-schematic__compass">
        <circle r="34" fill="none" stroke="#6b6b54" stroke-width="1.2" stroke-dasharray="3 4" />
        <circle r="25" fill="#fbf3df" stroke="#1d2a1f" stroke-width="1.6" />
        <path d="M0-20 6 0 0 20-6 0Z" fill="#a6432b" />
        <path d="M-20 0H-8M8 0h12M0-8V-24" stroke="#1d2a1f" stroke-width="1.4" />
        <text x="-4" y="-38" class="camp-schematic__north">N</text>
      </g>

    </svg>
  </div>
  <div class="camp-schematic__legend">
    <span><i class="legend-dot legend-dot--self"></i> 你的营位</span>
    <span><i class="legend-road"></i> 营地道路</span>
    <span>${icon('pin')} 沿路都有分区牌</span>
  </div>
</section>`
}


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
    (zone) => html`<section class="zone" id="zone-${zone}">
  <header class="zone__head">
    <div class="zone__letter">${zone}</div>
    <div>
      <h2>${zone} 区</h2>
      <p>${zones.get(zone)!.length} 个营位 · 沿营地道路排列</p>
    </div>
    <span class="zone__count">ZONE ${zone}</span>
  </header>
  <div class="zone__grid">
    ${zones.get(zone)!.map((f) => {
      const isSelf = opts.self?.id === f.id
      const info = campsiteInfo(f.campsite)
      return html`<a class="plot-tile ${isSelf ? 'is-self' : ''}" href="${opts.self ? `/v/${opts.self.token}/map` : '/map'}" data-plot="${f.campsite ?? ''}">
  <span class="plot-tile__no">${f.campsite ?? '—'}</span>
  <span class="plot-tile__name">${f.display_name}</span>
  <span class="plot-tile__index">${info ? `第 ${info.index} 位` : ''}</span>
  ${isSelf ? html`<span class="plot-tile__you">${icon('pin')} 你在这里</span>` : ''}
</a>`
    })}
  </div>
</section>`,
  )

  const selfZone = opts.self ? campsiteInfo(opts.self.campsite) : null

  const content = html`
  <section class="map-hero">
    ${eyebrow('MAP & TRAILS', '营地导览')}
    <h1>营地地图</h1>
    <p class="map-hero__sub">
      ${opts.self
        ? html`你的营位是 <strong>${opts.self.campsite ?? '—'}</strong>，在 ${selfZone?.zone ?? '?'} 区第 ${selfZone?.index ?? '—'} 位。`
        : '一月一露 · 西郊林场营位分布。到达后先到服务站签到，再沿营道找自己的营位。'}
    </p>
    <div class="map-hero__legend">
      <span><i class="legend-dot legend-dot--self"></i> 你的营位</span>
      <span><i class="legend-dot"></i> 其他营位</span>
      <span>${icon('tent')} ${opts.families.length} 家</span>
    </div>
  </section>

  ${opts.self
    ? html`<div class="you-are-here">
  <span class="you-are-here__icon">${icon('pin')}</span>
  <div><span>YOU ARE HERE</span><strong>${opts.self.display_name} · ${opts.self.campsite ?? '—'}</strong></div>
  <a href="/v/${opts.self.token}">${icon('arrow')}</a>
</div>`
    : ''}

  <nav class="zone-nav" aria-label="按分区跳转">
    <span class="zone-nav__label">${icon('route')} 分区</span>
    ${order.map((z) => html`<a href="#zone-${z}">${z} 区</a>`)}
  </nav>

  ${opts.mapSvg
    ? html`<div class="map-figure">
  <div class="map-figure__label">${icon('map')} 手绘营地总览</div>
  ${raw(opts.mapSvg)}
  <div class="map-figure__pin">${icon('pin')} 点击上方分区查看每家营位</div>
</div>`
    : schematicMap(
        order,
        selfZone?.zone ?? null,
        opts.self?.campsite ?? null,
        Object.fromEntries([...zones].map(([zone, list]) => [zone, list.length])),
      )}

  <section class="map-board">
    <span class="map-board__corner map-board__corner--tl">N 31°02′</span>
    <span class="map-board__corner map-board__corner--tr">E 121°14′</span>
    <div class="map-board__road" aria-hidden="true"><span>营地道路 · CAMP ROAD</span></div>
    <div class="map-board__service">
      <span class="map-board__service-icon">${seal('帮')}</span>
      <div><strong>服务站</strong><em>签到 · 礼品 · 问路</em></div>
    </div>
    ${zoneBlocks}
    ${order.length === 0 ? html`<p class="placeholder">营位信息还没导入。</p>` : ''}
  </section>

  <section class="facilities">
    <div class="section-head section-head--compact">
      <div><span class="section-head__en">AROUND THE CAMP</span><h2>营地设施</h2></div>
      <span class="section-head__no">06 处</span>
    </div>
    <div class="facility-grid">
      <div class="facility"><span>${icon('compass')}</span><strong>服务站</strong><em>先来这里签到</em></div>
      <div class="facility"><span>${icon('flame')}</span><strong>营火区</strong><em>明火只在这里</em></div>
      <div class="facility"><span>${icon('drop')}</span><strong>取水点</strong><em>洗锅请到这里</em></div>
      <div class="facility"><span>${icon('fish')}</span><strong>码头钓场</strong><em>营地西侧</em></div>
      <div class="facility"><span>${icon('coffee')}</span><strong>露草绀蓝</strong><em>钓场旁咖啡馆</em></div>
      <div class="facility"><span>${icon('noodle')}</span><strong>阿姨面馆</strong><em>钓场附近</em></div>
    </div>
    <p class="map-note">营位以现场标识为准。找不到就直接问服务站，我们带你过去。</p>
  </section>
`

  if (opts.self) {
    return layout(
      { title: `营地地图 · ${opts.self.display_name}`, bodyClass: 'is-map' },
      html`${villagerHeader(html`<a class="topbar__link" href="/v/${opts.self.token}">${icon('home')} 我的卡</a>`)}
<main class="map-page">
  ${content}
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
    html`${villagerHeader(html`<a class="topbar__link" href="/tips">${icon('lantern')} TIPS</a>`)}
<main class="map-page">
  ${content}
  <p class="backlink"><a href="/">← 返回村民服务站</a></p>
</main>
${footer()}`,
  )
}
