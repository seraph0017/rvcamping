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

/** 印章式圆形 logo，纯 CSS，无图片请求 */
export const seal = (label = 'RV') => html`<span class="seal" aria-hidden="true"><span>${label}</span></span>`

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
<meta name="theme-color" content="#F5EEE2" />
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
  <a class="topbar__brand" href="/">
    ${seal()}
    <span>村民服务站</span>
  </a>
  <div class="topbar__right">${right ?? ''}</div>
</header>`

/** 状态印章 */
export const statusStamp = (label: string, done: boolean, sub: string) => html`
<div class="stamp ${done ? 'stamp--done' : 'stamp--todo'}">
  <div class="stamp__label">${label}</div>
  <div class="stamp__mark">${done ? '✓ 已办' : '· 待办'}</div>
  <div class="stamp__sub">${sub}</div>
</div>`

export const footer = () => html`
<footer class="foot">
  <p>一月一露 · 西郊林场 &nbsp;|&nbsp; 松江区西茹路 1 号</p>
  <p class="foot__dim">Retro Village 复古露营 · 村民服务站</p>
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
<main class="center-box">
  <div class="empty">
    <div class="empty__seal">${seal('?')}</div>
    <h1>${title}</h1>
    <p>${detail}</p>
    <p class="empty__hint">请到服务站找工作人员，我们帮你查一下。</p>
    <a class="btn btn--ghost" href="/">返回首页</a>
  </div>
</main>
${footer()}`,
  )
