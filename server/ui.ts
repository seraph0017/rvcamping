import { html, raw } from 'hono/html'
import type { HtmlEscapedString } from 'hono/utils/html'
import { config } from './config.ts'

export type Html = HtmlEscapedString | Promise<HtmlEscapedString>

/** 一个空字符串占位，避免未使用告警 */
export const utf8 = 'utf-8'

export const fmtTime = (ms: number | null | undefined): string => {
  if (!ms) return '—'
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export const fmtDate = (ms: number | null | undefined): string => {
  if (!ms) return '—'
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${fmtTime(ms)}`
}

export const abs = (path: string): string => `${config.baseUrl}${path}`

export type IconName =
  | 'compass' | 'tent' | 'lantern' | 'flag' | 'cup' | 'map' | 'checkin' | 'gift'
  | 'alert' | 'bell' | 'flame' | 'drop' | 'leaf' | 'heart' | 'handshake' | 'bed'
  | 'bowl' | 'camp' | 'book' | 'search' | 'sync' | 'print' | 'download' | 'upload'
  | 'users' | 'calendar' | 'arrow' | 'pin' | 'tree' | 'moon' | 'sparkle' | 'route'
  | 'car' | 'clock' | 'tools' | 'paper' | 'list' | 'home' | 'shield' | 'check'
  | 'wifi' | 'offline' | 'fish' | 'coffee' | 'noodle' | 'chef' | 'egg' | 'paw'

const iconPaths: Record<IconName, string> = {
  compass: '<circle cx="12" cy="12" r="8.5"/><path d="m15.6 8.4-2.2 5-5 2.2 2.2-5 5-2.2Z"/>',
  tent: '<path d="M3 20h18L12 4 3 20Z"/><path d="M12 4v16M8.2 20l3.8-8 3.8 8"/>',
  lantern: '<path d="M9 3h6M10 6h4M8 9h8l-1 9H9L8 9Z"/><path d="M12 9v9M10.5 6V3M13.5 6V3M12 18v3"/>',
  flag: '<path d="M5 21V4M5 5c4-2.5 7 2 14 0v9c-7 2-10-2.5-14 0"/>',
  cup: '<path d="M5 8h11v6a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V8Z"/><path d="M16 10h2a2.5 2.5 0 0 1 0 5h-2M6 4c0 1 1 1 1 2M10 3c0 1 1 1 1 2"/>',
  map: '<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2V6Z"/><path d="M9 4v14M15 6v14"/>',
  checkin: '<path d="M4 12.5 9 17l11-11"/><path d="M4 21h16"/>',
  gift: '<path d="M4 10h16v10H4V10ZM3 7h18v4H3V7ZM12 7v13"/><path d="M12 7C9 7 7 5.8 7 4.2 7 2.9 8 2 9.2 2c1.7 0 2.8 2.2 2.8 5ZM12 7c3 0 5-1.2 5-2.8C17 2.9 16 2 14.8 2 13.1 2 12 4.2 12 7Z"/>',
  alert: '<path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5M12 17.2v.1"/>',
  bell: '<path d="M6 17h12l-1.5-2.5V10a4.5 4.5 0 0 0-9 0v4.5L6 17Z"/><path d="M10 20h4M12 3V1.8"/>',
  flame: '<path d="M12 21c4 0 6-2.5 6-5.6 0-3.2-2.4-5.2-3.7-7.9-.8-1.7-1-3.3-1-4.5-2.8 2-5.3 5.2-5.3 8.4 0 1.4.5 2.6 1.3 3.5-.2-2.2.8-4 2.4-5.4.2 2.5 1.7 3.6 2.6 5.1.9 1.5.4 3.4-1.3 4.2"/>',
  drop: '<path d="M12 2.5S5.5 10 5.5 14.4a6.5 6.5 0 0 0 13 0C18.5 10 12 2.5 12 2.5Z"/><path d="M9.2 15c.2 1.4 1 2.2 2.2 2.5"/>',
  leaf: '<path d="M20 4C11 4 5 8.5 5 15c0 2.8 2 5 5 5 6.5 0 10-6 10-16Z"/><path d="M5 20c2-5 5.5-8.5 10-11"/>',
  heart: '<path d="M20.5 5.5c-2-2-5.2-2-7.2 0L12 6.8l-1.3-1.3a5.1 5.1 0 0 0-7.2 7.2L12 21l8.5-8.3a5.1 5.1 0 0 0 0-7.2Z"/>',
  handshake: '<path d="m8 12 3-3 3 3 3-3 3 3-4.5 5.5a2 2 0 0 1-3 0L8 12Z"/><path d="m2 10 4-3 3 3M22 10l-4-3-3 3M6 17l2 2M18 17l-2 2"/>',
  bed: '<path d="M3 18v-7h18v7M3 18h18M5 11V7h14v4M7 7V4h10v3"/><path d="M7 14h4"/>',
  bowl: '<path d="M3 11h18a9 9 0 0 1-18 0Z"/><path d="M7 11c0-3 2-5 5-5s5 2 5 5M12 3V1.8M5 21h14"/>',
  camp: '<path d="M4 20h16M6 20l6-9 6 9M12 11V6M9 6h6"/><path d="M18 7h3l-1 4h-2V7Z"/>',
  book: '<path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H20v18H7.5A3.5 3.5 0 0 0 4 23V5.5Z"/><path d="M4 19.5A3.5 3.5 0 0 1 7.5 16H20M8 6h8M8 10h6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
  sync: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 8A7.5 7.5 0 0 1 19.5 10M4.5 14A7.5 7.5 0 0 0 18 16"/>',
  print: '<path d="M7 9V3h10v6M7 17H4V9h16v8h-3"/><path d="M7 14h10v7H7v-7Z"/><path d="M17 12h.1"/>',
  download: '<path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M4 20h16"/>',
  upload: '<path d="M12 16V4M7.5 8.5 12 4l4.5 4.5M4 20h16"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 5.2a3.5 3.5 0 0 1 0 6.6M17 14.5a6.5 6.5 0 0 1 4.5 5.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h2M12 14h2M17 14h.1M7 18h2M12 18h2"/>',
  arrow: '<path d="M4 12h16M14 6l6 6-6 6"/>',
  pin: '<path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/>',
  tree: '<path d="M12 2 6.5 10h3L5 16h5v6h4v-6h5l-4.5-6h3L12 2Z"/>',
  moon: '<path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>',
  sparkle: '<path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z"/><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"/>',
  route: '<circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><path d="M7 19h4a4 4 0 0 0 4-4v-6a4 4 0 0 1 4-4"/>',
  car: '<path d="M3 16v-5l2-5h14l2 5v5M3 16h18M5 16v3h3v-3M16 16v3h3v-3"/><circle cx="7" cy="12" r="1"/><circle cx="17" cy="12" r="1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  tools: '<path d="M14 6a4 4 0 0 0-5 5L3 17l4 4 6-6a4 4 0 0 0 5-5l-3 3-4-4 3-3Z"/>',
  paper: '<path d="M6 3h9l4 4v14H6V3Z"/><path d="M15 3v5h4M9 12h7M9 16h7"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  home: '<path d="m3 11 9-8 9 8v10h-6v-6H9v6H3V11Z"/>',
  shield: '<path d="m12 2 8 3v6c0 5-3.4 8.5-8 11-4.6-2.5-8-6-8-11V5l8-3Z"/><path d="m8.5 12 2.2 2.2 4.8-4.7"/>',
  check: '<path d="M4 12.5 9 17l11-11"/>',
  wifi: '<path d="M2.5 8.5a15 15 0 0 1 19 0M5.5 12a10 10 0 0 1 13 0M8.5 15.5a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1"/>',
  offline: '<path d="M2.5 8.5a15 15 0 0 1 7-3.7M14.5 5a15 15 0 0 1 7 3.5M5.5 12a10 10 0 0 1 3-1.8M15.5 10.2a10 10 0 0 1 3 1.8M8.5 15.5a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1"/><path d="M3 3l18 18"/>',
  fish: '<path d="M3 12c3-4 6.5-6 10-6 4 0 7 2.5 8 6-1 3.5-4 6-8 6-3.5 0-7-2-10-6Z"/><path d="M3 12 1 8v8l2-4ZM17 10.5h.1"/>',
  coffee: '<path d="M5 8h11v6a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V8Z"/><path d="M16 10h2a2.5 2.5 0 0 1 0 5h-2M7 4c0 1 1 1 1 2M11 3c0 1 1 1 1 2"/>',
  noodle: '<path d="M4 11h16a8 8 0 0 1-16 0Z"/><path d="M8 11 6 3M12 11l-1-8M16 11l1-8M3 21h18"/>',
  chef: '<path d="M7 13a4 4 0 1 1 1-7.8 4.5 4.5 0 0 1 8 0A4 4 0 1 1 17 13H7Z"/><path d="M7 13v5h10v-5M8 21h8"/>',
  egg: '<path d="M12 3c4 0 7 6 7 10a7 7 0 0 1-14 0c0-4 3-10 7-10Z"/><circle cx="12" cy="13.5" r="3"/>',
  paw: '<circle cx="7" cy="8" r="2"/><circle cx="12" cy="5.5" r="2"/><circle cx="17" cy="8" r="2"/><path d="M12 11c3 0 6 2.2 6 5.2 0 2-1.6 3.3-3.5 2.9-1.6-.4-3.4-.4-5 0-1.9.4-3.5-.9-3.5-2.9C6 13.2 9 11 12 11Z"/>',
}

export function icon(name: IconName, cls = ''): Html {
  return html`<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${raw(iconPaths[name])}</svg>`
}

/** 印章式圆形 logo，纯 CSS，无图片请求 */
export const seal = (label = 'RV') => html`<span class="seal" aria-hidden="true"><span>${label}</span></span>`

/** 页面共用的营地场景插画（纯 SVG，离线可用） */
export function campScene(variant: 'home' | 'guide' | 'login' | 'error' = 'guide'): Html {
  return html`<div class="scene scene--${variant}" aria-hidden="true">
<svg viewBox="0 0 480 250" preserveAspectRatio="xMidYMax slice" role="presentation">
  <circle class="scene__moon" cx="386" cy="54" r="30"/>
  <circle class="scene__halo" cx="386" cy="54" r="44"/>
  <g class="scene__stars">
    <circle cx="58" cy="34" r="2"/><circle cx="128" cy="52" r="1.4"/><circle cx="210" cy="28" r="1.7"/>
    <circle cx="303" cy="42" r="1.4"/><circle cx="450" cy="28" r="1.7"/><circle cx="342" cy="86" r="1.3"/>
  </g>
  <path class="scene__ridge scene__ridge--far" d="M0 142 62 95l46 30 52-48 66 62 54-38 64 48 55-32 81 46v87H0Z"/>
  <g class="scene__pines">
    <path d="M26 176 44 120l18 56Z"/><path d="M58 180 82 108l24 72Z"/><path d="M103 176 118 134l15 42Z"/>
    <path d="M350 176 368 118l18 58Z"/><path d="M385 180 403 128l18 52Z"/><path d="M415 176 432 135l17 41Z"/>
  </g>
  <path class="scene__ridge scene__ridge--near" d="M0 185c62-19 94-9 142-1 55 9 87-13 142-8 48 5 78 19 196 2v72H0Z"/>
  <g class="scene__camp">
    <path class="scene__tent" d="M188 190 242 121l54 69Z"/>
    <path class="scene__tent-door" d="m242 121 0 69M222 190l20-38 20 38"/>
    <path class="scene__fire-glow" d="M292 184c0-12 8-20 14-28 2 9 10 12 10 23a12 12 0 0 1-24 5Z"/>
    <path class="scene__fire" d="M300 188c0-6 4-10 7-14 1 5 5 6 5 12a6.5 6.5 0 0 1-12 2Z"/>
    <path class="scene__spark" d="M306 143v-7M297 147l-4-5M315 147l4-5"/>
    <path class="scene__log" d="m282 188 10-4M312 188l-9-4"/>
  </g>
  <path class="scene__ground" d="M0 221c88-12 154 8 240 2 92-6 150-16 240-2v29H0Z"/>
</svg>
</div>`
}

type LayoutOpts = {
  title: string
  description?: string
  /** 分享卡片封面：必须是页面第一张真实 <img>，绝对 HTTPS（DESIGN §8.6） */
  cover?: string
  bodyClass?: string
  bodyAttrs?: string
  /** 额外的 <head> 内容（如 no-store 已由中间件加，这里放页面级 meta） */
  head?: Html
  /** 是否加载客户端脚本 */
  script?: 'staff' | null
  noindex?: boolean
}

export function layout(opts: LayoutOpts, children: Html) {
  const cover = opts.cover ?? abs('/assets/cover.png')
  return html`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${opts.title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
${opts.description ? html`<meta name="description" content="${opts.description}" />` : ''}
${opts.noindex ? html`<meta name="robots" content="noindex,nofollow" />` : ''}
<meta property="og:title" content="${opts.title}" />
${opts.description ? html`<meta property="og:description" content="${opts.description}" />` : ''}
<meta property="og:image" content="${cover}" />
<meta property="og:type" content="website" />
<meta name="format-detection" content="telephone=no" />
<meta name="theme-color" content="#182a1d" />
<meta name="color-scheme" content="light" />
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/assets/icon-192.png" />
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="stylesheet" href="/assets/app.css" />
${opts.head ?? ''}
</head>
<body class="${opts.bodyClass ?? ''}" ${opts.bodyAttrs ? raw(opts.bodyAttrs) : ''}>
${children}
${opts.script === 'staff' ? html`<script type="module" src="/assets/staff.js"></script>` : ''}
</body>
</html>`
}

/** 村民页顶栏 */
export const villagerHeader = (right?: Html) => html`
<header class="topbar">
  <a class="topbar__brand" href="/" aria-label="返回村民服务站首页">
    ${seal()}
    <span class="topbar__brandtext">
      <em>RETRO VILLAGE</em>
      <strong>村民服务站</strong>
    </span>
  </a>
  <div class="topbar__right">${right ?? ''}</div>
</header>`

/** 小标题（英文 eyebrow + 中文） */
export const eyebrow = (en: string, zh?: string) => html`<div class="eyebrow"><span>${en}</span>${zh ? html`<i>${zh}</i>` : ''}</div>`

/** 状态票根 */
export const statusStamp = (
  label: string,
  done: boolean,
  sub: string,
  iconName: IconName = 'checkin',
) => html`
<div class="stamp ${done ? 'stamp--done' : 'stamp--todo'}">
  <div class="stamp__icon">${icon(iconName)}</div>
  <div class="stamp__body">
    <div class="stamp__label">${label}</div>
    <div class="stamp__sub">${sub}</div>
  </div>
  <div class="stamp__mark">${done ? '✓' : '·'}</div>
</div>`

export const footer = () => html`
<footer class="foot">
  <div class="foot__mark">${seal()}</div>
  <div class="foot__text">
    <strong>一月一露 · 西郊林场</strong>
    <span>松江区西茹路 1 号</span>
    <em>RETRO VILLAGE FIELD STATION</em>
  </div>
</footer>`

/** 内容页（TIPS / 公约 / 周边）通用外壳 */
export function contentShell(title: string, subtitle: string, body: Html, back = '/') {
  return html`
${villagerHeader()}
<main class="prose-wrap">
  <div class="page-title">
    <h1>${title}</h1>
    ${subtitle ? html`<p class="page-title__sub">${subtitle}</p>` : ''}
  </div>
  <article class="prose">${body}</article>
  <p class="backlink"><a href="${back}">← 返回我的营位卡</a></p>
</main>
${footer()}`
}

export const errorPage = (title: string, detail: string) =>
  layout(
    { title: `${title} · 村民服务站`, noindex: true },
    html`${villagerHeader()}
<main class="error-page">
  ${campScene('error')}
  <div class="empty empty--card">
    <div class="empty__seal">${seal('?')}</div>
    <h1>${title}</h1>
    <p>${detail}</p>
    <p class="empty__hint">请到服务站找工作人员，我们帮你查一下。</p>
    <a class="btn btn--primary btn--inline" href="/">返回首页</a>
  </div>
</main>
${footer()}`,
  )
