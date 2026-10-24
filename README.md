# Retro Village 村民服务站

一月一露 · 西郊林场「复古露营」活动的村庄公告站。

现场签到与礼品领取已改为**纸质签字表**：到场后在登记点签字，工作人员按纸质表发放礼品。网页只承担公告、地图、营地 TIPS、活动时间表和留言板，不再展示电子村民卡、签到二维码或核销状态。

公网地址：<https://retrovillage.cn>（香港服务器 `47.86.175.72`，Nginx HTTPS 反代本机 3000）。HTTP、`www` 和旧 IP HTTP 链接统一 308 跳转到正式域名，保留路径与查询参数。

---

## 当前流程

| 场景 | 做法 |
|---|---|
| 入村签到 | 现场纸质表「签到签名」栏签字 |
| 领取礼品 | 同一张表「礼品领取签名」栏签字 |
| 查公告 / 地图 / TIPS | 打开公网站点，六个栏目直接浏览 |
| 留言 | 公告站留言板直接发布，无需家庭卡或登录 |
| 名单维护 | 管理员登录后导入 CSV、导出名单 |
| 留言审核 | 管理员在后台隐藏不合适的留言 |

公开站六个栏目：**村民公约、营地地图、村庄地图、营地 TIPS、活动时间表、留言板**。

纸质签领表：`/forms/signatures`，A4 三页 / 45 行，可直接打印。每户一行，签到与礼品领取分别签名。

管理后台：`/admin/login` → `/admin`。只能使用 `role = admin` 的账号登录。

---

## 已停用的电子流程

以下入口保留兼容，但不再产生任何核销记录：

- 旧村民卡 `/v/<token>` → 302 回公告首页
- 旧工作人员台 `/ops`、`/ops/login` → 302 到公告首页 / 管理登录
- `/api/ops`、`/api/v/<token>`、`/api/v/<token>/qr.svg` → `410 Gone`
- `/api/groups/:id/undo`、`/api/staff/*`、`/api/admin/export-ops.csv` → `410 Gone`
- `/admin/backfill`、`/admin/print` → `410 Gone`
- `/admin/paper` → 302 到 `/forms/signatures`

数据库中的历史家庭、token、核销流水（`ops`）和旧留言（`guest_messages`）全部保留，不删除、不重建。新留言写入独立的 `public_messages` 表，与旧留言合并展示。

---

## 快速开始

```bash
npm ci
npm run check
npm run build
npm test
npm start          # http://localhost:3000
```

`npm test` 会启动隔离服务器和临时数据库，验证：

- 公告首页六栏目存在，且不含电子卡 / 二维码 / 核销状态
- 旧入口跳转或返回 410，旧核销写接口不再可写
- 匿名留言、30 秒访客限流、300 字上限、管理员隐藏
- 管理员登录与普通工作人员被拒
- 纸质签领表三页、两栏签名
- 原有 `ops`、家庭 token、旧留言数量不变，`PRAGMA integrity_check = ok`

首次启动会自动建库，并从 `data/families.csv` 导入名单。管理员账号由环境变量 `STAFF_PIN` 在**空库首次初始化**时创建；已有数据库不会被覆盖。

导入 / 更新名单：

```bash
npm run import -- data/families.csv
```

CSV 表头：`code,display_name,head_name,party_size,kids,campsite,phone,note`
（`code` 是三位家庭编号；`phone` 只进管理员导出，不出现在公开页面）

---

## 环境变量

```bash
BASE_URL=https://retrovillage.cn   # 公开访问地址
PORT=3000
NODE_ENV=production
SESSION_SECRET=<openssl rand -base64 32>
STAFF_PIN=<首次初始化管理员 PIN>
DB_PATH=data/app.db
```

- 运行要求：**Node ≥ 22.5**（使用内置 `node:sqlite`）。
- `BASE_URL` 指向 `localhost` 时，生产环境会拒绝启动。
- `/healthz` 返回 `{ ok, families, baseUrlOk }`，可用于部署后的健康检查。

---

## 目录

```
content/    活动内容与设置
data/       家庭名单 CSV；SQLite 库与密钥运行时生成（gitignore）
server/     Hono + node:sqlite，全站 SSR
  index.ts  路由、静态资源、管理后台、退役入口
  api.ts    留言接口、管理员接口、410 退役接口
  messages.ts  新旧留言合并与隐藏
  pages/information-admin.ts  管理页与纸质签领表
  templates/village.html      公告站页面结构
client/village.js            公告站交互：栏目切换、TIPS 图库、地图手势、留言
public/village.css           公告站样式
public/village/*.webp        公告站图片素材
docs/       交接、方案与设计资料
```

旧的 `server/ops.ts`、`server/pages/family.ts`、`server/pages/staff.ts`、`server/pages/admin.ts`、`client/staff.ts` 保留在仓库中作为历史参考，但不再挂载路由。保留文件是为了不破坏历史数据与后续追溯。

---

## 部署

2026-10-24 已启用正式域名：

- `retrovillage.cn` 与 `www.retrovillage.cn` 的 A 记录均为 `47.86.175.72`。
- Nginx：`/etc/nginx/conf.d/rvcamping-ip.conf`，HTTP 声明 IP 与两个域名；443 为根域名和 www 分别配置虚拟主机，www 跳转根域名。
- 证书覆盖两个域名，路径 `/etc/letsencrypt/live/retrovillage.cn/`，首次证书到期日 2027-01-22。
- Certbot webroot：`/var/www/rvcamping-acme`；80 端口的 `/.well-known/acme-challenge/` 保留用于续期。
- `certbot.timer` 自动续期；部署钩子 `/etc/letsencrypt/renewal-hooks/deploy/rvcamping-nginx-reload` 在更新证书后检查并 reload Nginx。
- `.env` 设置 `BASE_URL=https://retrovillage.cn`，管理会话与访客 Cookie 自动启用 Secure。
- 域名切换备份：`/srv/rvcamping-domain-backup-20261024-CYKq4F`，含切换前 Nginx 配置和环境文件，仅 root 可读。
- 原 `api-test.aitracenex.com` 虚拟主机保留，单独维护。

```bash
curl -fsS https://retrovillage.cn/healthz
nginx -t
systemctl status certbot.timer
certbot renew --cert-name retrovillage.cn --dry-run
```

```bash
cd /srv/rvcamping
tar -czf /root/rvcamping-backup-$(date +%Y%m%d-%H%M).tar.gz data .env
git pull --ff-only
npm ci
npm run build
systemctl restart rvcamping
```

部署后检查：

```bash
curl -fsS http://127.0.0.1:3000/healthz
curl -fsS http://127.0.0.1:3000/ | grep -E '村庄公告|纸质签字'
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:3000/api/ops   # 410
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/forms/signatures  # 200
```

systemd 示例（`/etc/systemd/system/rvcamping.service`）：

```ini
[Unit]
Description=Retro Village 村民服务站
After=network.target

[Service]
WorkingDirectory=/srv/rvcamping
EnvironmentFile=/srv/rvcamping/.env
ExecStart=/usr/bin/node --experimental-strip-types server/index.ts
Restart=always

[Install]
WantedBy=multi-user.target
```

备份：`data/app.db`、`data/app.db-wal`、`data/app.db-shm` 与 `.env` 一起打包。活动当天建议每小时备份一次。

---

## 维护提示

- 公告站视觉与六栏目内容已获客户确认，改动时只做局部调整，不要重做版式。
- 公开留言用 HttpOnly 访客 Cookie 做 30 秒限流，并对同一 IP 做 10 分钟总量限制；不要返回 `visitor_key` 或原始 IP。
- 隐藏留言只改 `hidden` 标志，不删除数据。
- 旧 `/v/<token>` 链接统一回首页，避免活动现场继续出现扫码核销预期。
- 纸质表是现场唯一签到凭证；网页端不提供“在线确认”或“补录”按钮。
