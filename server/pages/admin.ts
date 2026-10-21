import { html, raw } from 'hono/html'
import type { FamilyWithState, Staff } from '../db.ts'
import type { Summary } from '../ops.ts'
import { footer, layout } from '../ui.ts'

/** 卡片打印：A4 每页 4 张（2×2），90×130mm，含裁切线。DESIGN §8.5 */
export function printPage(opts: {
  families: (FamilyWithState & { qr: string })[]
  staff: Staff
  baseUrl: string
  warnLocalUrl?: boolean
  perPage?: number
}) {
  const perPage = opts.perPage ?? 4
  const pages: (typeof opts.families)[] = []
  for (let i = 0; i < opts.families.length; i += perPage) {
    pages.push(opts.families.slice(i, i + perPage))
  }

  return layout(
    {
      title: '卡片打印 · 村民服务站',
      noindex: true,
      bodyClass: 'is-print',
      head: html`<style>
@page { size: A4; margin: 8mm; }
</style>`,
    },
    html`<div class="print-toolbar no-print">
  <a href="/admin">← 后台</a>
  <span>${opts.families.length} 张 · ${pages.length} 页 · A4 每页 ${perPage} 张（90×130mm）· 建议 200g 牛皮纸 + 过塑</span>
  <button onclick="window.print()">打印</button>
</div>
${opts.warnLocalUrl
  ? html`<p class="url-warn no-print">
      ⚠ 当前 BASE_URL 是 <code>${opts.baseUrl}</code>，印出来的二维码扫不开。
      请设置 <code>BASE_URL=https://你的域名</code> 后重启再打印。
    </p>`
  : ''}

${pages.map(
  (page) => html`<section class="sheet">
  ${page.map(
    (f) => html`<article class="card">
    <div class="card__inner">
      <div class="card__top">
        <span class="card__logo">RV</span>
        <span class="card__no">No.${f.code}</span>
      </div>
      <div class="card__qr">${raw(f.qr)}</div>
      <div class="card__name">${f.display_name}</div>
      <div class="card__plot">${f.campsite ?? '—'} 营位</div>
      <div class="card__scan">微信扫码打开</div>
    </div>
  </article>`,
  )}
</section>`,
)}

${pages.length === 0 ? html`<p class="placeholder">还没有导入名单。</p>` : ''}`,
  )
}

export function adminPage(opts: {
  staff: Staff
  families: FamilyWithState[]
  summary: Summary
  settings: Record<string, string>
  imported?: string
}) {
  return layout(
    { title: '后台 · 村民服务站', noindex: true, bodyClass: 'is-staff' },
    html`<header class="staffbar">
  <a class="staffbar__back" href="/ops">← 清单</a>
  <span class="staffbar__mode">管理员 · ${opts.staff.name}</span>
  <a class="staffbar__exit" href="/ops/logout">退出</a>
</header>

<main class="staff-list">
  <div class="progress">
    <div class="progress__item"><span class="progress__n">${opts.summary.total}</span><span class="progress__k">家庭</span></div>
    <div class="progress__item"><span class="progress__n">${opts.summary.checkedIn}</span><span class="progress__k">已签到</span></div>
    <div class="progress__item"><span class="progress__n">${opts.summary.giftGiven}</span><span class="progress__k">已领礼品</span></div>
  </div>

  ${opts.imported ? html`<p class="alertbar alertbar--ok">✓ ${opts.imported}</p>` : ''}

  <section class="admin-block">
    <h2>数据</h2>
    <div class="admin-actions">
      <a class="btn btn--ghost" href="/admin/print">打印 35 张卡片</a>
      <a class="btn btn--ghost" href="/api/staff/export.csv">导出名单（35 行）</a>
      <a class="btn btn--ghost" href="/api/admin/export-ops.csv">导出原始流水</a>
    </div>
  </section>

  <section class="admin-block">
    <h2>名单</h2>
    <p class="staff-foot">CSV 表头：<code>code,display_name,head_name,party_size,kids,campsite,phone,note</code></p>
    <form method="post" action="/admin/import" enctype="multipart/form-data" class="admin-actions">
      <input type="file" name="csv" accept=".csv,text/csv" required />
      <button class="btn btn--primary" type="submit">导入 / 更新</button>
    </form>
    <table class="admin-table">
      <thead><tr><th>编号</th><th>家庭</th><th>家长</th><th>营位</th><th>人数</th><th>手机</th><th>链接</th></tr></thead>
      <tbody>
      ${opts.families.map(
        (f) => html`<tr>
  <td>${f.code}</td>
  <td>${f.display_name}</td>
  <td>${f.head_name ?? '—'}</td>
  <td>${f.campsite ?? '—'}</td>
  <td>${f.party_size}</td>
  <td>${f.phone ?? '—'}</td>
  <td><a href="/v/${f.token}" target="_blank" rel="noreferrer">打开</a></td>
</tr>`,
      )}
      </tbody>
    </table>
  </section>

  <section class="admin-block">
    <h2>活动设置</h2>
    <form method="post" action="/admin/settings" class="admin-form">
      <label>活动名 <input name="eventName" value="${opts.settings.eventName ?? 'Retro Village 复古露营'}" /></label>
      <label>副标题 <input name="eventSubtitle" value="${opts.settings.eventSubtitle ?? '一月一露 · 西郊林场'}" /></label>
      <label>礼品名 <input name="giftName" value="${opts.settings.giftName ?? '村民礼品'}" /></label>
      <label>现场联系人 <input name="contactName" value="${opts.settings.contactName ?? '小林'}" /></label>
      <button class="btn btn--primary" type="submit">保存</button>
    </form>
  </section>

  <section class="admin-block">
    <h2>纸质表补录</h2>
    <p class="staff-foot">服务器挂了/手机没电时，用纸质签到表记下，回到这里补录。</p>
    <form method="post" action="/admin/backfill" class="admin-form">
      <label>编号 <input name="code" placeholder="005" required /></label>
      <label>类型
        <select name="type">
          <option value="both">签到 + 领礼</option>
          <option value="checkin">仅签到</option>
          <option value="gift">仅领礼品</option>
        </select>
      </label>
      <button class="btn btn--primary" type="submit">补录</button>
    </form>
  </section>

  <section class="admin-block">
    <h2>纸质兜底表（可打印）</h2>
    <p class="staff-foot">35 行，编号 / 家庭 / 营位 / 签到 / 礼品，两列勾选框。</p>
    <a class="btn btn--ghost" href="/admin/paper">打开纸质表</a>
  </section>
</main>
${footer()}`,
  )
}

export function paperSheetPage(opts: { families: FamilyWithState[] }) {
  return layout(
    {
      title: '纸质签到表',
      noindex: true,
      bodyClass: 'is-print',
      head: html`<style>@page { size: A4; margin: 10mm; }</style>`,
    },
    html`<div class="print-toolbar no-print">
  <a href="/admin">← 后台</a><span>纸质兜底表 · 服务器或手机不可用时使用</span>
  <button onclick="window.print()">打印</button>
</div>
<h1 class="paper-title">Retro Village 村民服务站 · 纸质签到表</h1>
<table class="paper-table">
  <thead><tr><th>编号</th><th>家庭</th><th>家长</th><th>营位</th><th>人数</th><th>签到</th><th>礼品</th></tr></thead>
  <tbody>
  ${opts.families.map(
    (f) => html`<tr>
  <td class="paper-code">${f.code}</td>
  <td>${f.display_name}</td>
  <td>${f.head_name ?? ''}</td>
  <td>${f.campsite ?? ''}</td>
  <td>${f.party_size}</td>
  <td class="paper-box"></td>
  <td class="paper-box"></td>
</tr>`,
  )}
  </tbody>
</table>`,
  )
}
