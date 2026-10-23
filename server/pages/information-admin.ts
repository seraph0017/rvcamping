import { html } from 'hono/html'
import type { FamilyWithState, Staff } from '../db.ts'
import type { BoardMessage } from '../messages.ts'
import { footer, layout } from '../ui.ts'

export function adminLoginPage(error?: string) {
  return layout({ title: '内容管理登录 · 村民服务站', noindex: true, bodyClass: 'is-staff' }, html`
    <header class="staffbar"><a href="/">← 公告首页</a><span>内容管理</span></header>
    <main class="staff-login"><section class="login-card"><h1>管理员登录</h1><p>维护名单与村民留言。</p>
    ${error ? html`<p class="form-error">${error}</p>` : ''}
    <form method="post" action="/admin/login" class="staff-login__form">
      <label class="pin-field"><span>管理员 PIN</span><input name="pin" class="pin-input" type="password" inputmode="numeric" required maxlength="8" autocomplete="current-password" /></label>
      <button class="btn btn--primary" type="submit">进入管理后台</button>
    </form></section></main>`)
}

export function informationAdminPage(staff: Staff, families: FamilyWithState[], imported?: string) {
  return layout({ title: '内容管理 · 村民服务站', noindex: true, bodyClass: 'is-staff is-admin' }, html`
  <header class="staffbar"><a href="/">← 公告首页</a><span>管理员 · ${staff.name}</span><a href="/admin/logout">退出</a></header>
  <main class="staff-list"><h1>村庄内容管理</h1><p class="staff-foot">现场签到和礼品领取使用纸质签字表，网页用于公告、地图、TIPS 与留言。</p>
    ${imported ? html`<p class="alertbar alertbar--ok">${imported}</p>` : ''}
    <nav class="admin-quick">
      <a class="admin-tile admin-tile--navy" href="/admin/guestbook"><strong>留言管理</strong><em>浏览与隐藏留言</em></a>
      <a class="admin-tile admin-tile--forest" href="/forms/signatures"><strong>纸质签领表</strong><em>A4 空白签字表 · 可打印</em></a>
      <a class="admin-tile admin-tile--mustard" href="/api/admin/export-families.csv"><strong>导出名单</strong><em>家庭与营位资料</em></a>
      <a class="admin-tile admin-tile--brick" href="/"><strong>查看公告站</strong><em>查看所有公开栏目</em></a>
    </nav>
    <section class="admin-block"><h2>名单与营位</h2><p class="staff-foot">名单仅用于村庄营位索引。导入按编号更新，保留原记录。当前样例名单需换成已确认的正式名单。</p>
      <form action="/admin/import" method="post" enctype="multipart/form-data" class="admin-actions"><input type="file" name="csv" accept=".csv,text/csv" required /><button class="btn btn--primary" type="submit">导入名单</button></form>
      <p class="staff-foot">CSV：code,display_name,head_name,party_size,kids,campsite,phone,note</p>
      <div class="table-scroll"><table class="admin-table"><thead><tr><th>编号</th><th>家庭</th><th>营位</th><th>人数</th></tr></thead><tbody>
      ${families.map(f => html`<tr><td>${f.code}</td><td>${f.display_name}</td><td>${f.campsite ?? '待安排'}</td><td>${f.party_size}</td></tr>`)}
      </tbody></table></div>
    </section>
  </main>${footer()}`)
}

export function signatureSheets() {
  return html`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>现场签到与礼品签领表</title><style>
    @page { size: A4; margin: 12mm; }
    *{box-sizing:border-box}body{margin:0;color:#111;background:#eee;font-family:"PingFang SC","Microsoft YaHei",sans-serif}
    .toolbar{padding:16px;text-align:center;font-size:15px}.toolbar a,.toolbar button{margin:8px;padding:10px}
    .signature-sheet{width:186mm;min-height:273mm;margin:12px auto;padding:0;background:#fff;break-after:page}
    .signature-sheet:last-child{break-after:auto}h1{font-size:19px;text-align:center;margin:0 0 6mm;padding-top:3mm}h2{font-size:13px;text-align:center;font-weight:400;margin:0 0 5mm}
    .meta{font-size:11px;display:flex;justify-content:space-between;margin-bottom:5mm}
    table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #333;text-align:center;font-size:11px;padding:2mm 1mm}th{height:13mm;font-weight:600;background:#f3f3f3}td{height:12mm}
    .note{font-size:10px;line-height:1.8;margin-top:5mm}.page{font-size:10px;text-align:right;margin-top:4mm}
    @media print{body{background:white}.toolbar{display:none}.signature-sheet{margin:0}}
    @media screen and (max-width:730px){.paper-scroll{overflow-x:auto}.toolbar{line-height:1.8}}
  </style></head><body><div class="toolbar"><a href="/">返回公告首页</a><button onclick="window.print()">打印 A4 签字表</button><p>空白模板共 3 页 / 45 行，按实际需要打印。每户一行，两次办理分别签名。</p></div><div class="paper-scroll">
    ${[0, 1, 2].map(page => html`<section class="signature-sheet"><h1>Retro Village 2026 · 现场签领表</h1><h2>签到与礼品领取分别签名 · 每户一行</h2>
    <div class="meta"><span>活动日期：________________</span><span>登记点 / 经办人：________________</span></div>
    <table><colgroup><col style="width:10mm"/><col style="width:31mm"/><col style="width:17mm"/><col style="width:16mm"/><col style="width:42mm"/><col style="width:42mm"/><col style="width:28mm"/></colgroup>
      <thead><tr><th>序号</th><th>家庭 / 姓名</th><th>营位</th><th>到场<br/>人数</th><th>签到签名</th><th>礼品领取签名</th><th>备注 / 经办人</th></tr></thead><tbody>
      ${Array.from({ length: 15 }, (_, n) => html`<tr><td>${page * 15 + n + 1}</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`)}
      </tbody></table><div class="note">办理方式：到场后在「签到签名」栏签字；领取实物礼品时，再在「礼品领取签名」栏签字。<br/>礼品每户一份；发放前核对签领情况。纸质签字表作为现场记录，不需要在手机上确认。</div><div class="page">第 ${page + 1} 页 / 共 3 页 · 空白模板</div></section>`)}
    </div></body></html>`
}

export function guestbookAdminPage(staff: Staff, messages: BoardMessage[]) {
  return layout({ title: '留言管理 · 村民服务站', noindex: true, bodyClass: 'is-staff is-admin' }, html`
  <header class="staffbar"><a href="/admin">← 后台</a><span>留言管理 · ${staff.name}</span><a href="/">公告首页</a></header>
  <main class="staff-list"><h1>村民留言</h1>
    <p class="staff-foot">公开留言按时间倒序显示，最多 100 条。隐藏后不会再出现在公告站，原始记录仍保留在数据库中。</p>
    ${messages.length === 0 ? html`<article class="admin-block"><p>暂无留言。</p></article>` : messages.map(m => html`
      <article class="admin-block">
        <div class="admin-block__head"><div><h2>${m.name}</h2><p>${new Date(m.created_ms).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p></div></div>
        <p class="moderation-message">${m.message}</p>
        <form method="post" action="/admin/guestbook/${encodeURIComponent(m.id)}/hide">
          <button class="btn btn--ghost" type="submit">隐藏这条留言</button>
        </form>
      </article>`)}
  </main>${footer()}`)
}
