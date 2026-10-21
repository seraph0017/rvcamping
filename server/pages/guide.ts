import { html, raw } from 'hono/html'
import type { HtmlEscapedString } from 'hono/utils/html'
import type { Doc } from '../content.ts'
import { eyebrow, footer, icon, layout, seal, villagerHeader, type IconName } from '../ui.ts'

export type GuideKind = 'tips' | 'charter' | 'nearby'

type GuideMeta = {
  en: string
  label: string
  iconName: IconName
  className: string
  introTitle: string
}

const META: Record<GuideKind, GuideMeta> = {
  tips: {
    en: 'FIELD NOTES / 01',
    label: '第一次来，先读这一页',
    iconName: 'lantern',
    className: 'tips',
    introTitle: '到达 · 签到 · 安顿下来',
  },
  charter: {
    en: 'CAMP CODE / 02',
    label: '一起遵守的几件小事',
    iconName: 'flag',
    className: 'charter',
    introTitle: '不立规矩，只想大家都睡得着',
  },
  nearby: {
    en: 'OFF-SITE / 03',
    label: '营地外的好去处',
    iconName: 'cup',
    className: 'nearby',
    introTitle: '咖啡、面馆、农家菜与住宿',
  },
}

const escapeText = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const stripTags = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()

function sectionIcon(kind: GuideKind, title: string): IconName {
  if (kind === 'tips') {
    if (title.includes('到达')) return 'compass'
    if (title.includes('到了')) return 'tent'
    if (title.includes('住')) return 'lantern'
    if (title.includes('注意')) return 'alert'
  }
  if (kind === 'charter') {
    if (title.includes('声音')) return 'bell'
    if (title.includes('火')) return 'flame'
    if (title.includes('水') || title.includes('电')) return 'drop'
    if (title.includes('垃圾')) return 'leaf'
    if (title.includes('孩子') || title.includes('宠物')) return 'heart'
    if (title.includes('邻居')) return 'handshake'
  }
  if (kind === 'nearby') {
    if (title.includes('营地')) return 'camp'
    if (title.includes('酒店') || title.includes('住')) return 'bed'
    if (title.includes('吃') || title.includes('餐厅')) return 'chef'
  }
  return 'book'
}

function venueIcon(name: string): IconName {
  if (name.includes('咖啡') || name.includes('春帐')) return 'coffee'
  if (name.includes('面馆') || name.includes('饺子')) return 'noodle'
  if (name.includes('酒店')) return 'bed'
  if (name.includes('机场')) return 'car'
  if (name.includes('牛肉锅')) return 'bowl'
  if (name.includes('烧饼')) return 'egg'
  if (name.includes('饵房')) return 'fish'
  if (name.includes('农家菜') || name.includes('饭店')) return 'chef'
  return 'pin'
}

function sectionLabel(kind: GuideKind, title: string): string {
  if (kind === 'nearby') {
    if (title.includes('营地里')) return '营地内'
    if (title.includes('酒店')) return '住宿'
    if (title.includes('吃')) return '餐厅'
  }
  return kind === 'tips' ? 'CHECK LIST' : 'VILLAGE CODE'
}

function transformTipList(inner: string): string {
  return inner.replace(/<li>（待填/g, '<li class="is-todo">（待填')
}

function renderVenues(inner: string, sectionTitle: string): string {
  const category = sectionLabel('nearby', sectionTitle)
  const cards: string[] = []

  // 先把引用块抽出来，作为独立的“隐藏彩蛋”卡，避免被普通场所正则误吞。
  const secrets: { title: string; body: string }[] = []
  const source = inner.replace(/<blockquote>([\s\S]*?)<\/blockquote>/g, (_all, block: string) => {
    const text = stripTags(block)
    if (!text) return ''
    const m = /^(.{1,18}?)[：:]\s*([\s\S]+)$/.exec(text)
    secrets.push(
      m
        ? { title: m[1].trim(), body: m[2].trim() }
        : { title: '隐藏彩蛋', body: text },
    )
    return ''
  })

  const cardRe = /<p><strong>([\s\S]*?)<\/strong>([\s\S]*?)<\/p>/g
  let match: RegExpExecArray | null
  while ((match = cardRe.exec(source))) {
    const name = stripTags(match[1] ?? '').replace(/^[：:\s]+/, '')
    const rawRest = match[2] ?? ''
    const lines = rawRest
      .split('\n')
      .map((x) => stripTags(x).replace(/^[：:]\s*/, ''))
      .filter(Boolean)

    // 正文里如果还有 “**隐藏彩蛋**：……” 也走彩蛋卡，不当作餐厅。
    if (name.includes('隐藏彩蛋')) {
      secrets.push({ title: name, body: lines.join(' ').replace(/^[：:]\s*/, '') })
      continue
    }

    const address: string[] = []
    const notes: string[] = []
    const chips: string[] = []
    const recs: string[] = []

    for (const line of lines) {
      if (line.startsWith('推荐：')) {
        recs.push(...line.replace('推荐：', '').split(/[、，,]/).map((x) => x.trim()).filter(Boolean))
        continue
      }
      // 一行里常见 “地址 · 人均 …”，拆开分别归位。
      const segments = line.split(/\s*·\s*/).map((x) => x.trim()).filter(Boolean)
      for (const seg of segments) {
        if (/人均|公里|分钟|元/.test(seg) && seg.length <= 42) {
          chips.push(seg)
          continue
        }
        if (address.length === 0 && /[路街道号弄]|机场/.test(seg)) {
          address.push(seg)
          continue
        }
        notes.push(seg)
      }
    }

    cards.push(`<article class="venue-card">
  <div class="venue-card__top">
    <span class="venue-card__icon">${icon(venueIcon(name)).toString()}</span>
    <span class="venue-card__cat">${escapeText(category)}</span>
  </div>
  <h3>${escapeText(name)}</h3>
  ${address.length ? `<p class="venue-card__address">${icon('pin').toString()} ${escapeText(address.join(' '))}</p>` : ''}
  ${chips.length ? `<div class="venue-card__chips">${chips.map((c) => `<span>${escapeText(c)}</span>`).join('')}</div>` : ''}
  ${notes.length ? `<p class="venue-card__note">${notes.map(escapeText).join(' ')}</p>` : ''}
  ${recs.length ? `<div class="venue-card__recs"><em>推荐</em>${recs.map((r) => `<span>${escapeText(r)}</span>`).join('')}</div>` : ''}
</article>`)
  }

  const secretCards = secrets.map(
    (s) => `<article class="venue-card venue-card--secret">
  <div class="venue-card__top">
    <span class="venue-card__icon">${icon('sparkle').toString()}</span>
    <span class="venue-card__cat">LOCAL SECRET</span>
  </div>
  <span class="venue-card__stamp">只有熟客知道</span>
  <h3>${escapeText(s.title)}</h3>
  <p class="venue-card__note">${escapeText(s.body)}</p>
  <div class="venue-card__recs"><em>探索提示</em><span>自己找找看</span></div>
</article>`,
  )

  const leftovers = source
    .replace(cardRe, '')
    .replace(/<hr\s*\/?>/g, '')
    .replace(/<p>\s*<\/p>/g, '')
    .trim()

  return `${cards.join('\n')}${secretCards.join('\n')}${
    leftovers ? `<div class="venue-leftovers">${leftovers}</div>` : ''
  }`
}

function venueAnchor(title: string): string {
  if (title.includes('营地')) return 'zone-venue-camp'
  if (title.includes('酒店') || title.includes('住')) return 'zone-venue-stay'
  if (title.includes('吃')) return 'zone-venue-eat'
  return ''
}

function transformSection(kind: GuideKind, title: string, inner: string, index: number): string {
  const iconName = sectionIcon(kind, title)
  let body = inner
  if (kind === 'tips') body = transformTipList(body)
  if (kind === 'nearby') body = renderVenues(body, title)
  const anchor = kind === 'nearby' ? venueAnchor(title) : ''

  return `<section class="guide-card guide-card--${kind}"${anchor ? ` id="${anchor}"` : ''}>
  <header class="guide-card__head">
    <span class="guide-card__no">${String(index).padStart(2, '0')}</span>
    <span class="guide-card__icon">${icon(iconName).toString()}</span>
    <div>
      <span class="guide-card__label">${sectionLabel(kind, title)}</span>
      <h2>${title}</h2>
    </div>
  </header>
  <div class="guide-card__body">${body}</div>
</section>`
}

function renderGuideBody(doc: Doc, kind: GuideKind): string {
  let body = doc.body

  // 内部编辑提示不要在村民页面显示
  body = body.replace(/<blockquote>\s*<p>[\s\S]*?本文件由丹尼撰写[\s\S]*?<\/blockquote>/g, '')

  const parts = body.split(/(?=<h2>)/)
  let preamble = parts.shift() ?? ''
  // JS split 不会在字符串开头产生空段；第一个 h2 会留在首段里。
  // 把它放回 sections，避免整段第一章被当成“前言”而失去场所卡与编号。
  if (/^\s*<h2>/.test(preamble)) {
    parts.unshift(preamble)
    preamble = ''
  }
  let index = 1
  const sections = parts.map((part) => {
    const m = /^<h2>(.*?)<\/h2>([\s\S]*)$/.exec(part)
    if (!m) return part
    return transformSection(kind, stripTags(m[1] ?? ''), m[2] ?? '', index++)
  })

  const pre = preamble
    .replace(/<hr\s*\/?>/g, '')
    .replace(/<blockquote>([\s\S]*?)<\/blockquote>/g, (_all, inner: string) => {
      const text = stripTags(inner)
      return text
        ? `<aside class="guide-quote"><span class="guide-quote__mark">“</span><p>${escapeText(text)}</p></aside>`
        : ''
    })
    .trim()

  return `${pre ? `<div class="guide-preamble">${pre}</div>` : ''}${sections.join('\n')}`
}

const TIPS_ROUTE = [
  { no: '01', icon: 'car' as IconName, title: '抵达营地', text: '按导航到西茹路 1 号' },
  { no: '02', icon: 'compass' as IconName, title: '先到服务站', text: '工作人员扫卡签到' },
  { no: '03', icon: 'gift' as IconName, title: '领取礼品', text: '每家 1 份' },
  { no: '04', icon: 'tent' as IconName, title: '找到营位', text: '看地图或问我们' },
]

export function guidePage(opts: { doc: Doc; kind: GuideKind; back?: string; contactName: string }) {
  const meta = META[opts.kind]
  const plain = stripTags(opts.doc.body)
  const minutes = Math.max(1, Math.round(plain.length / 320))
  const body = renderGuideBody(opts.doc, opts.kind)

  const sibling = [
    { href: '/tips', label: '营地 TIPS', en: 'TIPS', icon: 'lantern' as IconName },
    { href: '/charter', label: '村庄公约', en: 'CODE', icon: 'flag' as IconName },
    { href: '/nearby', label: '周边推荐', en: 'NEARBY', icon: 'cup' as IconName },
    { href: '/map', label: '营地地图', en: 'MAP', icon: 'map' as IconName },
  ]

  const kindExtras = opts.kind === 'tips'
    ? html`<section class="tips-route">
  <div class="section-head section-head--compact">
    <div><span class="section-head__en">ARRIVAL FLOW</span><h2>到场后，按这个顺序</h2></div>
    <span class="section-head__no">4 步</span>
  </div>
  <ol class="route-steps">
    ${TIPS_ROUTE.map(
      (s) => html`<li>
  <span class="route-steps__no">${s.no}</span>
  <span class="route-steps__icon">${icon(s.icon)}</span>
  <div><strong>${s.title}</strong><em>${s.text}</em></div>
</li>`,
    )}
  </ol>
</section>
<section class="quick-facts">
  <div class="quick-facts__item"><span>${icon('bell')}</span><strong>23:00</strong><em>以后请把音量降到能听见风</em></div>
  <div class="quick-facts__item"><span>${icon('flame')}</span><strong>营火区</strong><em>明火只在这里点</em></div>
  <div class="quick-facts__item"><span>${icon('leaf')}</span><strong>自己带走</strong><em>营地不设集中垃圾站</em></div>
</section>`
    : opts.kind === 'charter'
      ? html`<section class="quiet-banner">
  <div class="quiet-banner__time"><strong>23:00</strong><span>— 07:00</span></div>
  <div class="quiet-banner__copy">
    <span class="quiet-banner__en">QUIET HOURS</span>
    <h2>把音量降到能听见风</h2>
    <p>帐篷的隔音约等于零。想聊到很晚，去营火区，别在营位旁边。</p>
  </div>
  <div class="quiet-banner__moon">${icon('moon')}</div>
</section>
<section class="code-strip">
  <span>${icon('flame')} 明火只在营火区</span>
  <span>${icon('leaf')} 垃圾自己带走</span>
  <span>${icon('paw')} 宠物请牵绳</span>
  <span>${icon('heart')} 路过营位不穿行</span>
</section>`
      : html`<section class="venue-categories">
  <a href="#zone-venue-camp"><span>${icon('camp')}</span><strong>营地内</strong><em>咖啡 · 饵房 · 面馆</em></a>
  <a href="#zone-venue-stay"><span>${icon('bed')}</span><strong>住宿</strong><em>酒店 · 机场交通</em></a>
  <a href="#zone-venue-eat"><span>${icon('chef')}</span><strong>出去吃</strong><em>农家菜 · 牛肉锅</em></a>
</section>`

  return layout(
    {
      title: `${opts.doc.title} · Retro Village`,
      description: opts.doc.subtitle || meta.label,
      bodyClass: `is-guide is-guide--${meta.className}`,
    },
    html`${villagerHeader(html`<a class="topbar__link" href="/map">${icon('map')} 地图</a>`)}
<main class="guide-page">
  <section class="guide-hero">
    <div class="guide-hero__pattern" aria-hidden="true"></div>
    <div class="guide-hero__top">
      <span class="guide-hero__stamp">${seal(meta.className === 'tips' ? 'T' : meta.className === 'charter' ? 'C' : 'N')}</span>
      <span class="guide-hero__index">${meta.en}</span>
    </div>
    <div class="guide-hero__icon">${icon(meta.iconName)}</div>
    <h1>${opts.doc.title}</h1>
    <p class="guide-hero__sub">${opts.doc.subtitle || meta.label}</p>
    <div class="guide-hero__meta">
      <span>${icon('clock')} 约 ${minutes} 分钟读完</span>
      ${opts.doc.updated ? html`<span>${icon('calendar')} 更新于 ${opts.doc.updated}</span>` : ''}
    </div>
  </section>

  ${kindExtras}

  <section class="guide-content">
    ${raw(body)}
  </section>

  <nav class="guide-next" aria-label="继续阅读">
    <span class="guide-next__title">${icon('book')} 继续翻手册</span>
    <div class="guide-next__grid">
      ${sibling
        .filter((s) => s.href !== `/${opts.kind}`)
        .map(
          (s) => html`<a href="${s.href}">
  <span>${icon(s.icon)}</span>
  <div><em>${s.en}</em><strong>${s.label}</strong></div>
  ${icon('arrow', 'guide-next__arrow')}
</a>`,
        )}
    </div>
  </nav>

  <section class="help help--guide">
    <span class="help__seal">${seal('帮')}</span>
    <div class="help__body">
      <span class="help__en">SERVICE STATION</span>
      <strong>还有问题？直接找服务站</strong>
      <p>现场联系人：${opts.contactName} · 签到 / 礼品 / 找营位</p>
    </div>
  </section>

  <p class="backlink"><a href="${opts.back ?? '/'}">← 返回我的营位卡</a></p>
</main>
${footer()}`,
  )
}
