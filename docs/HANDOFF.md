# 交接说明（HANDOFF）

> 给接手同事看的一页纸。运行方式见 [`../README.md`](../README.md)，历史设计资料见 [`DESIGN.md`](DESIGN.md)。
> 最后更新：2026-10-23 · 纸质签领流程已上线。

---

## 1. 当前产品

一月一露 · 西郊林场「复古露营」活动的**村庄公告站**。

现场签到与礼品领取已经改回传统纸质流程：到场后在登记点签字，工作人员按纸质表发放礼品。网页只承担公告、地图、营地 TIPS、活动时间表和留言板。

公开站固定六个栏目：

1. 村民公约
2. 营地地图
3. 村庄地图
4. 营地 TIPS
5. 活动时间表
6. 留言板

客户已确认保留当前公告站视觉与内容，后续只做局部维护，不要重做版式。

---

## 2. 公开入口

| 入口 | 地址 | 说明 |
|---|---|---|
| 公告首页 | `/` | 六栏目入口 + 纸质办理提示 |
| 村民公约 | `/charter` 或首页栏目 | 活动公约 |
| 营地地图 | `/camp-map` | 需求方导览图，支持缩放、拖动、旋转 |
| 村庄地图 | `/map` | 按分区展示营位索引，不标实测方位 |
| 营地 TIPS | `/tips` | 老村民经验图文 |
| 活动时间表 | `/schedule` | 当前为待更新状态 |
| 留言板 | `/guestbook` | 匿名可读、可发布 |
| 纸质签领表 | `/forms/signatures` | A4 三页 / 45 行，公开可打印 |

留言规则：称呼最多 24 字，正文 1–300 字；同一访客 30 秒限流，同一 IP 10 分钟最多 10 条。留言经文本转义渲染，隐藏后不再公开展示，但数据库记录保留。

---

## 3. 管理后台

只能使用 `staff.role = admin` 的账号登录：

```text
/admin/login  →  /admin
```

`/admin` 保留：

- 留言管理（隐藏留言）
- 纸质签领表打印入口
- 家庭与营位名单查看 / CSV 导入
- 名单导出 CSV
- 公告站入口

普通工作人员账号不能进入内容管理后台。PIN、Session Secret 和服务器凭据只保存在运行环境，不写入仓库或 Obsidian。

---

## 4. 纸质签领流程

打印 `/forms/signatures`，建议按实际户数准备 1–2 份备用。

每户一行，现场完成两次签字：

1. 到场：在「签到签名」栏签字。
2. 领取礼品：在「礼品领取签名」栏签字。

表格字段：序号、家庭 / 姓名、营位、到场人数、签到签名、礼品领取签名、备注 / 经办人。共 3 页，每页 15 行。

网页端没有“在线确认”“补录”“核销台”或“礼品状态”。纸质表是现场唯一签领凭证。

---

## 5. 已退役的电子流程

旧链接和 API 保留兼容处理，不再产生核销记录：

| 入口 | 当前行为 |
|---|---|
| `/v/<token>`、`/v/<token>/map` | `302 /` |
| `/ops`、`/ops/*` | `302 /` |
| `/ops/login` | `302 /admin/login` |
| `/staff`、`/staff/*` | `302 /` 或 `/admin/login` |
| `/api/ops` | `410 Gone` |
| `/api/v/<token>`、`/api/v/<token>/qr.svg` | `410 Gone` |
| `/api/groups/:id/undo` | `410 Gone` |
| `/api/staff/*`、`/api/admin/export-ops.csv` | `410 Gone` |
| `/admin/backfill`、`/admin/print` | `410 Gone` |
| `/admin/paper` | `302 /forms/signatures` |

旧 `server/ops.ts`、`server/pages/family.ts`、`server/pages/staff.ts`、`server/pages/admin.ts`、`client/staff.ts` 仍留在仓库作历史参考，但不再挂载路由。

---

## 6. 数据保留策略

**不删除、不重建线上数据库。**

保留内容：

- `families`：家庭、编号、原 token、营位、联系方式
- `ops`：历史电子核销流水
- `guest_messages`：旧家庭卡时代留言
- `settings`、`staff`：原配置与账号

新增内容：

- `public_messages`：公告站匿名留言，和旧留言合并展示
- 访客限流字段只存 HMAC 后的 IP 标识，不保存原始 IP

隐藏留言只更新 `hidden = 1`，不物理删除。部署前必须同时备份数据库与 `.env`。

---

## 7. 本地验证

```bash
npm ci
npm run check
npm run build
npm test
npm start          # http://localhost:3000
```

`npm test` 使用临时数据库和隔离端口，不会接触活动数据。当前覆盖：

- 六个公告栏目存在，首页无二维码、村民卡和核销状态
- 旧村民卡 / 工作人员入口跳转，旧写接口返回 410
- 管理员可登录，普通工作人员被拒
- 匿名留言成功、30 秒限流、300 字上限、未登录不能隐藏
- 管理员隐藏留言
- 纸质表存在 3 页，含两栏签名
- 历史家庭 token、`ops` 数量、旧留言数量不变
- `PRAGMA integrity_check = ok`

---

## 8. 线上部署

公网：`http://47.86.175.72`。Nginx 80 端口反代本机 `127.0.0.1:3000`，systemd 服务名为 `rvcamping.service`。

服务器路径：`/srv/rvcamping`。

部署步骤：

```bash
cd /srv/rvcamping
tar -czf /root/rvcamping-backup-$(date +%Y%m%d-%H%M).tar.gz data .env
git pull --ff-only
npm ci
npm run build
systemctl restart rvcamping
curl -fsS http://127.0.0.1:3000/healthz
```

网络入口只能走 JumpServer：`jms.tracenex.cn:2223`，再选择 `47.86.175.72`。堡垒机和服务器凭据由负责人交接，不写入仓库与笔记。

部署后检查：

```bash
curl -fsS http://127.0.0.1:3000/healthz
curl -fsS http://127.0.0.1:3000/ | grep -E '村庄公告|纸质签字'
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:3000/api/ops           # 410
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/forms/signatures          # 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/admin/login               # 200
```

---

## 9. 维护提示

- 公告站视觉已获客户确认，只做局部调整。
- 改文案优先动需求方模板内固定内容；当前管理后台不再编辑公告正文。
- 换名单用 `data/families.csv` + `/admin/import` 或 `npm run import -- data/families.csv`。
- 纸质表是现场唯一签到凭证；不要重新引入网页确认、二维码核销或补录。
- 旧 token 和旧流水不要清理，除非负责人明确要求归档。
- 当前使用 HTTP + IP，没有匹配域名的 HTTPS；微信可能提示不安全。
