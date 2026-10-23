# Retro Village 村民服务站

## 2026-10-23 需求方版本适配

公开页面采用需求方 `Retro-Village-2026-测试包.zip` 提供的界面与图文资源，复用原 Hono + SQLite 核销服务。

- 首页 `/` 不含工作人员入口；每户仍通过 `/v/<token>` 查看专属村民卡，旧二维码继续有效。
- 工作人员登录 `/ops/login`，操作台 `/ops`；微信扫码或“拍照 / 选图识别二维码”定位家庭，再确认签到或发礼品。编号、姓名及完整二维码链接均可查询。
- 二维码由 `/api/v/<token>/qr.svg` 本地生成，无 CDN 依赖。公开卡每 5 秒及切回前台时读取服务器状态。
- 营地地图 `/camp-map` 使用真实导览图片，可缩放、拖动、旋转；村庄地图 `/map` 为数据库营位索引，正式实测方位图仍待提供。
- TIPS 沿用需求方六组图文；活动时间表仍显示待公布。
- 留言 `/guestbook` 在服务器共享存储，凭有效家庭卡发布（1–300 字、称呼最多 24 字、每户 30 秒一次）；后台 `/admin/guestbook` 可隐藏留言。
- `?staff=1` 不启用任何工作人员权限。核销、撤销和管理操作继续要求登录与角色权限。
- 适配 320px 起的小屏、安全区、输入框字号、浏览器返回和页面滚动位置；轻量转场遵循减少动画设置。

新增可维护文件：`server/templates/village.html`（原包页面结构）、`server/pages/village.ts`（服务端注入真实卡片）、`client/village.js`（原生页面/图库/触摸地图与服务端交互）、`public/village.css`、`public/village/*.webp`。
旧 `home.ts` / `map.ts` / `guide.ts` 留作前版参考，线上公开页面以新模板为准；`family.ts` 继续承担登录后的核销界面。后台编辑内容 Markdown 不会覆盖新版模板内需求方固定图文。

```bash
npm ci
npm run check
npx tsc -p tsconfig.sw.json --noEmit
npm run build
npm test  # 自动启动隔离服务器和临时数据库，不接触活动数据
```

当前公网为 `http://47.86.175.72`，Nginx 80 端口反代本机 3000。会话 Cookie 的 Secure 属性根据 `BASE_URL` 协议设置；核销编号兼容 HTTP。HTTP 环境用微信扫一扫或拍照识别二维码；浏览器实时相机和 PWA 离线包仍需要 HTTPS。

原包 SHA-256：`eb09e62d19aadc842b425bcd3db3fb4670c5bc0367d320b585aefdd781c0d7bd`。

---

一月一露 · 西郊林场「复古露营」活动的村民服务站 H5。

35 个家庭，每家一张专属二维码。**同一张码两个视角**：村民扫开看到自己的营位、TIPS、公约、地图；
工作人员扫同一个码看到核销台，完成签到与礼品发放。

- 设计文档：[`docs/DESIGN.md`](docs/DESIGN.md)（v0.4，含三轮交叉评审的修订记录、服务端取舍、验收清单）
- 丹尼的 GUIDE BOOK：[`docs/reference/guide-book.pdf`](docs/reference/guide-book.pdf)
- 界面截图：[`docs/shots/`](docs/shots/)

---

## 快速开始

```bash
npm install
npm run build        # 打包 public/staff.js + public/sw.js（构建产物，gitignore）
npm start            # http://localhost:3000
```

首次启动会自动建库、导入 `data/families.csv`，并创建两个工作人员：

| 名字 | PIN | 角色 |
|---|---|---|
| 小林 | `2580` | admin |
| 小周 | `1234` | staff |

> PIN 只在**首次初始化**时生效（写进 `pin_hash`）。之后改 PIN 要直接改库或删库重建。

导入 / 更新名单：

```bash
npm run import -- data/families.csv
```

CSV 表头：`code,display_name,head_name,party_size,kids,campsite,phone,note`
（`code` 是卡片上印的三位编号，`phone` 只进后台导出，永不进任何前端响应）

---

## 环境变量

复制 `.env.example` 改成 `.env`，或用进程管理器注入：

```bash
BASE_URL=https://village.example.com   # ★ 二维码里写死的地址，必须对
PORT=3000
STAFF_PIN=2580                          # 仅首次初始化用
SESSION_SECRET=<openssl rand -base64 32>
NODE_ENV=production
DB_PATH=data/app.db
```

**`BASE_URL` 是最容易出事的一个**：它决定打印出来的二维码指向哪里。
`NODE_ENV=production` 且 `BASE_URL` 仍是 localhost 时，服务会**直接拒绝启动**；
非生产环境下打印页会显示红色警告条。`/healthz` 也会返回 `baseUrlOk` 供你核对。

**运行要求：Node ≥ 22.5**（用到内置 `node:sqlite`，无需编译原生模块）。

---

## 三种角色怎么用

### 村民（只读，零操作）

微信扫卡片二维码 → `/v/<token>`，一屏看到：家庭名、营位号、区内序号、签到/礼品状态、四个入口。

村民侧**没有签到按钮**——签到必须工作人员做，避免自助签到和排队操作手机。

### 工作人员（现场主路径）

1. 手机浏览器打开 `/staff`，输 PIN。**微信内置浏览器与系统浏览器是两个独立登录态，各登一次。**
2. 点「预载离线包」→ 看到「离线就绪 ✓ 35 家」，断网也能核销。
3. 现场流程：**在「待办」清单上点一行 → 点自适应主按钮**（都不用选，按钮文案随状态变）→ 5 秒内可撤销。
4. 断网时用编号输入（卡片上印的三位数）；卡丢了、扫不出来都用这条路。

### 管理员

`/admin`：打印卡片、导入名单、改活动信息、导出 CSV、纸质兜底表与补录入口。

- 卡片打印：A4 每页 4 张（90×130mm），35 张 = 9 页，含裁切线。建议 200g 牛皮纸 + 过塑。
- 导出：`/api/staff/export.csv` 一家庭一行恒 35 行；`/api/admin/export-ops.csv` 是原始流水。

---

## 技术选型与理由

| 决定 | 为什么 |
|---|---|
| **全站 SSR，不用 React/Vue** | 主要场景是微信内打开。SPA 先白屏再渲染，且分享卡片标题必须由服务端直出（微信抓 HTML 源码、不执行 JS）。页面一共 12 个，原生 TS 足够 |
| **`node:sqlite` 而不是 better-sqlite3** | 零原生依赖，换机/部署不会因 node-gyp 编译失败而卡住 |
| **单进程 + SQLite 单文件** | 35 家规模，不需要高并发架构；备份就是拷一个文件 |
| **核销用单击 + 5 秒撤销，不用长按** | 长按在湿屏/手套/微信原生菜单夹击下才是失败源，而撤销已经把误操作成本降到接近 0 |
| **离线只承诺编号核销，不承诺扫码** | iOS 没有 `BarcodeDetector`，PWA 内也调不起相机，扫码离线永远测不过 |
| **冲突检测对称 + 数据库唯一索引** | 只看「是否有另一条有效记录」，与设备时钟无关；权威用服务端自增 `seq` |

更完整的取舍见 `docs/DESIGN.md` §9 与 §21（「需不需要服务端」）。

---

## 目录

```
content/    内容（Markdown）与活动设置 —— 改文案只动这里
data/       35 家名单 CSV；SQLite 库与密钥在运行时生成（gitignore）
server/     Hono + node:sqlite，全站 SSR
  pages/    页面模板（hono/html）
  api.ts    /api/* 接口
  ops.ts    幂等核销、冲突、撤销
client/     原生 TS（构建后 ~8.6KB）：核销、outbox 离线队列、撤销 toast、SW
public/     CSS、素材、构建产物
scripts/    构建 / 导入 / 素材生成
docs/       设计文档、参考 PDF、截图
```

---

## 部署（不用容器）

最低要求：一台 1C1G 的机器 + Node ≥ 22.5。

```bash
git clone <repo> /srv/rvcamping && cd /srv/rvcamping
npm ci
npm run build
cat > .env <<'EOF'
BASE_URL=http://你的地址:3000
PORT=3000
NODE_ENV=production
SESSION_SECRET=换成随机串
EOF
npm start          # 或交给 systemd / pm2 常驻
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

想加 HTTPS，用 Caddy 反代最省事（自动证书）：

```
village.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

> **微信内使用建议上 HTTPS**。纯 HTTP 在微信里会出现「不安全」提示，
> 且 Service Worker（离线能力）要求安全上下文，http 下预载会失败。

备份：数据库是单文件，`cp data/app.db* 备份目录/` 即可；活动当天建议每小时一次。

---

## 几个已经踩过的坑（改代码前先看）

- **Service Worker 注册在根 scope，但只拦 `/staff*` 与 `/assets/*`**，村民页完全不经 SW。
  注册在 `/staff/` scope 是错的——那样 `/assets/*` 拦不到，预载必然失败。
- **静态资源用 network-first**，不是 cache-first。资源路径没带内容 hash，cache-first 会把旧版 JS 永久钉死。
- **`/v/*`、`/staff*`、`/api/*` 强制 `no-store`**，否则安卓微信会秒开缓存页，导致工作人员看到旧状态而重复核销。
- **分享卡片封面靠页面第一张真实 `<img>`**（800×400、非 `display:none`、非 CSS 背景），`og:image` 只是兜底。
- **`client/staff.ts` 的 `postOps` 必须重读 outbox**，不能拿发送前的快照回写——连续快速核销时会丢 op。
- **离线同步完成后不要靠 reload 刷状态**，用 `/api/ops` 返回的 `authoritative` 直接改 DOM，否则会打断撤销窗口。

---

## 验收

活动前跑 `docs/DESIGN.md` §19 的三份清单：

1. **软件验收**：35 张码全扫对、首屏不滚动、两种核销路径、离线同步、冲突闭环
2. **物理验收**：卡片过塑、泡水 30 秒、揉皱/贴歪/剪偏、1 米外读编号
3. **流程验收**：纸质兜底、换机、拿错卡、共享平板、次日补签到

外加一次 **30 分钟无提示彩排**（5 人扮村民、1 人扮工作人员，看 5 家能否 3 分钟内办完）——
这条比任何单项技术测试都值钱。

---

## 尚未就绪

| 项 | 状态 |
|---|---|
| 真实 35 家名单 | 现在是 `data/families.csv` 里的假数据 |
| 营位分布图 | Neil 未交付；现在是分区网格兜底，素材到了在 `/admin/map` 点选标注即可 |
| 域名 + HTTPS | 部署时需指定，二维码地址随之变化 |
| 真机微信验证 | 分享卡片外观、iOS 键盘/callout、飞行模式离线，需真机确认 |
| 实际打印 | 纸张、过塑、裁切需线下验证 |
