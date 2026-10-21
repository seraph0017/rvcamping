/// <reference lib="webworker" />
/**
 * Service Worker —— 只服务工作人员端
 * 关键点（DESIGN §12.4）：
 *  - 注册在**根 scope**，否则 scope 外的 /assets/* 拦不到
 *  - fetch 里按路径分流：只处理 /ops* 和 /assets/*，其余一律 return（村民页完全不经 SW）
 */

// SAFETY: lib.webworker 把 self 声明为 WorkerGlobalScope & typeof globalThis，
// 缺少 ServiceWorkerGlobalScope 的强类型 overload；运行时它就是 SW 全局作用域。
const sw = self as unknown as ServiceWorkerGlobalScope

const VERSION = 'rv-v1'
const SHELL = `${VERSION}-shell`
const SHELL_URLS = ['/ops', '/assets/app.css', '/assets/staff.js', '/assets/cover.png']

sw.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL)
      await Promise.allSettled(SHELL_URLS.map((u) => cache.add(new Request(u, { cache: 'reload' }))))
      await sw.skipWaiting()
    })(),
  )
})

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
      await sw.clients.claim()
    })(),
  )
})

sw.addEventListener('message', (event) => {
  const data = event.data as { type?: string; url?: string } | undefined
  if (data?.type === 'PRECACHE' && typeof data.url === 'string') {
    // 只允许同源绝对路径，避免被用来请求任意地址
    const target = data.url
    const safe = target.startsWith('/ops') || target.startsWith('/assets/')
    if (!safe) return
    event.waitUntil(
      (async () => {
        const cache = await caches.open(SHELL)
        try {
          const res = await fetch(target, { credentials: 'include' })
          if (res.ok) await cache.put(target, res.clone())
        } catch {
          /* 离线时预载失败可忽略 */
        }
      })(),
    )
  }
})

sw.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  let url: URL
  try {
    url = new URL(req.url)
  } catch {
    return
  }
  if (url.origin !== sw.location.origin) return

  const isStaff = url.pathname === '/ops' || url.pathname.startsWith('/ops/')
  const isAsset = url.pathname.startsWith('/assets/')

  // 村民页、接口、其他一切：不拦截，让浏览器正常走网络
  if (!isStaff && !isAsset) return

  if (isAsset) {
    // 静态资源：network-first + 缓存兜底。
    // 不用 cache-first —— 资源路径没带内容 hash，cache-first 会把旧版 JS 永久钉死，
    // 改了代码用户也拿不到（联调时已踩过）。
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL)
        try {
          const res = await fetch(req)
          if (res.ok) {
            const copy = res.clone()
            event.waitUntil(cache.put(req, copy))
          }
          return res
        } catch {
          const hit = await cache.match(req)
          if (hit) return hit
          return new Response('', { status: 504 })
        }
      })(),
    )
    return
  }

  // /ops 页面：网络优先，失败回落缓存（离线可用）
  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL)
      try {
        const res = await fetch(req, { credentials: 'include' })
        if (res.ok) {
          const copy = res.clone()
          event.waitUntil(cache.put('/ops', copy))
        }
        return res
      } catch {
        const hit = await cache.match('/ops')
        if (hit) return hit
        return new Response('离线，且没有预载离线包。请连 Wi-Fi 后刷新。', {
          status: 503,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        })
      }
    })(),
  )
})
