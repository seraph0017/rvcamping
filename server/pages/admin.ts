import { html, raw } from 'hono/html'
import type { FamilyWithState, Staff } from '../db.ts'
import type { Summary } from '../ops.ts'
import { eyebrow, footer, icon, layout, seal } from '../ui.ts'

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
  <button onclick="window.print()">${icon('print')} 打印</button>
</div>
${opts.warnLocalUrl
  ? html`<p class="url-warn no-print">
      ${icon('alert')} 当前 BASE_URL 是 <code>${opts.baseUrl}</code>，印出来的二维码扫不开。
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
        <span class="card__no">NO. ${f.code}</span>
      </div>
      <div class="card__kicker">RETRO VILLAGE · FIELD STATION</div>
      <div class="card__qr">${raw(f.qr)}</div>
      <div class="card__name">${f.display_name}</div>
      <div class="card__plot">${f.campsite ?? '—'} <span>营位</span></div>
      <div class="card__scan">微信扫码 · 打开我的营位卡</div>
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
    { title: '后台 · 村民服务站', noindex: true, bodyClass: 'is-staff is-admin' },
    html`<header class="staffbar">
  <a class="staffbar__back" href="/ops">← 清单</a>
  <span class="staffbar__mode"><i class="live-dot"></i>管理员 · ${opts.staff.name}</span>
  <a class="staffbar__exit" href="/ops/logout">退出</a>
</header>

<main class="staff-list admin-console">
  <section class="admin-hero">
    <div class="admin-hero__copy">
      ${eyebrow('CONTROL ROOM · FIELD STATION', '后台控制台')}
      <h1>活动控制台</h1>
      <p>名单、设置、打印与补录。改变会立即影响村民看到的内容。</p>
    </div>
    <div class="admin-hero__stamp">${seal('控')}</div>

    <div class="progress">
      <div class="progress__item"><span class="progress__n">${opts.summary.total}</span><span class="progress__k">家庭</span></div>
      <div class="progress__item"><span class="progress__n">${opts.summary.checkedIn}</span><span class="progress__k">已签到</span></div>
      <div class="progress__item"><span class="progress__n">${opts.summary.giftGiven}</span><span class="progress__k">已领礼品</span></div>
      <div class="progress__item"><span class="progress__n">${opts.summary.conflicts}</span><span class="progress__k">待核冲突</span></div>
    </div>
  </section>

  ${opts.imported ? html`<p class="alertbar alertbar--ok">${icon('check')} ${opts.imported}</p>` : ''}

  <section class="admin-quick" aria-label="快捷操作">
    <a class="admin-tile admin-tile--navy" href="/admin/guestbook"><span class="admin-tile__icon">${icon('book')}</span><strong>留言管理</strong><em>浏览与隐藏村民留言</em></a>
    <a class="admin-tile admin-tile--brick" href="/admin/print">
      <span class="admin-tile__icon">${icon('print')}</span>
      <strong>打印卡片</strong>
      <em>${opts.summary.total} 张 · A4 拼版</em>
    </a>
    <a class="admin-tile admin-tile--navy" href="/api/staff/export.csv">
      <span class="admin-tile__icon">${icon('download')}</span>
      <strong>导出名单</strong>
      <em>${opts.summary.total} 行 · CSV</em>
    </a>
    <a class="admin-tile admin-tile--mustard" href="/api/admin/export-ops.csv">
      <span class="admin-tile__icon">${icon('paper')}</span>
      <strong>导出流水</strong>
      <em>原始核销记录</em>
    </a>
    <a class="admin-tile admin-tile--forest" href="/admin/paper">
      <span class="admin-tile__icon">${icon('list')}</span>
      <strong>纸质兜底表</strong>
      <em>断网时手写</em>
    </a>
  </section>

  <section class="admin-block" id="roster">
    <header class="admin-block__head">
      <span class="admin-block__icon">${icon('users')}</span>
      <div>
        <span class="admin-block__en">ROSTER</span>
        <h2>名单与导入</h2>
        <p>CSV 会按编号更新已有家庭，不会重复创建。</p>
      </div>
      <span class="admin-block__count">${opts.families.length} 家</span>
    </header>

    <form method="post" action="/admin/import" enctype="multipart/form-data" class="upload-box">
      <label class="upload-box__drop">
        <span class="upload-box__icon">${icon('upload')}</span>
        <span>
          <strong>选择 CSV 文件</strong>
          <em>表头：code, display_name, head_name, party_size, kids, campsite, phone, note</em>
        </span>
        <input type="file" name="csv" accept=".csv,text/csv" required />
      </label>
      <button class="btn btn--primary" type="submit">导入 / 更新</button>
    </form>

    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>编号</th><th>家庭</th><th>家长</th><th>营位</th><th>人数</th><th>手机</th><th>状态</th><th>链接</th></tr></thead>
        <tbody>
        ${opts.families.map(
          (f) => html`<tr>
  <td><span class="admin-code">${f.code}</span></td>
  <td><strong>${f.display_name}</strong></td>
  <td>${f.head_name ?? '—'}</td>
  <td>${f.campsite ?? '—'}</td>
  <td>${f.party_size}${f.kids > 0 ? html` <small>/ ${f.kids} 小</small>` : ''}</td>
  <td>${f.phone ?? '—'}</td>
  <td><span class="admin-state ${f.checkin_ms && f.gift_ms ? 'is-done' : ''}">${f.checkin_ms ? '签' : '·'}${f.gift_ms ? '礼' : '·'}</span></td>
  <td><a class="admin-link" href="/v/${f.token}" target="_blank" rel="noreferrer">打开 ↗</a></td>
</tr>`,
        )}
        </tbody>
      </table>
    </div>
  </section>

  <div class="admin-split">
    <section class="admin-block">
      <header class="admin-block__head">
        <span class="admin-block__icon">${icon('tools')}</span>
        <div>
          <span class="admin-block__en">EVENT SETTINGS</span>
          <h2>活动设置</h2>
        </div>
      </header>
      <form method="post" action="/admin/settings" class="admin-form">
        <label>活动名 <input name="eventName" value="${opts.settings.eventName ?? 'Retro Village 复古露营'}" /></label>
        <label>副标题 <input name="eventSubtitle" value="${opts.settings.eventSubtitle ?? '一月一露 · 西郊林场'}" /></label>
        <label>礼品名 <input name="giftName" value="${opts.settings.giftName ?? '村民礼品'}" /></label>
        <label>现场联系人 <input name="contactName" value="${opts.settings.contactName ?? '小林'}" /></label>
        <button class="btn btn--primary" type="submit">保存设置</button>
      </form>
    </section>

    <section class="admin-block">
      <header class="admin-block__head">
        <span class="admin-block__icon">${icon('paper')}</span>
        <div>
          <span class="admin-block__en">PAPER BACKFILL</span>
          <h2>纸质表补录</h2>
          <p>服务器挂了或手机没电时，先在纸上记，回到这里补录。</p>
        </div>
      </header>
      <form method="post" action="/admin/backfill" class="admin-form">
        <label>编号 <input name="code" inputmode="numeric" placeholder="005" required /></label>
        <label>类型
          <select name="type">
            <option value="both">签到 + 领礼</option>
            <option value="checkin">仅签到</option>
            <option value="gift">仅领礼品</option>
          </select>
        </label>
        <button class="btn btn--primary" type="submit">提交补录</button>
      </form>
      <div class="admin-note">
        <span>${icon('alert')}</span>
        <p>补录会写成一条新流水，操作人记为当前管理员。已经办过的家庭也能补，不会覆盖原记录。</p>
      </div>
    </section>
  </div>

  <p class="staff-foot">${icon('shield')} 名单含手机号，只在后台可见；工作人员端接口会剔除手机号字段。</p>
</main>
${footer()}`,
  )
}

export function paperSheetPage(opts: { families: FamilyWithState[] }) {
  return layout(
    {
      title: '纸质签到表',
      noindex: true,
      bodyClass: 'is-print is-paper',
      head: html`<style>@page { size: A4; margin: 10mm; }</style>`,
    },
    html`<div class="print-toolbar no-print">
  <a href="/admin">← 后台</a><span>纸质兜底表 · 服务器或手机不可用时使用</span>
  <button onclick="window.print()">${icon('print')} 打印</button>
</div>
<header class="paper-head">
  <div class="paper-head__mark">RV</div>
  <div>
    <span>RETRO VILLAGE · FIELD STATION</span>
    <h1 class="paper-title">村民服务站 · 纸质签到表</h1>
    <p>编号 / 家庭 / 营位 / 签到 / 礼品 · ${opts.families.length} 家</p>
  </div>
  <div class="paper-head__meta"><span>日期</span><strong>2026 · 秋</strong></div>
</header>
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
</table>
<p class="paper-foot">核对人：____________　服务台：____________　备注：________________________________</p>`,
  )
}
