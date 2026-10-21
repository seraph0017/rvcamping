import { html } from 'hono/html'
import { footer, layout, seal, villagerHeader } from '../ui.ts'

export function homePage(opts: { eventName: string; subtitle: string; contactName: string }) {
  return layout(
    {
      title: 'Retro Village 村民服务站',
      description: '扫你手上的卡片二维码，看营位、读 TIPS、找服务站。',
      bodyClass: 'is-home',
    },
    html`
${villagerHeader()}
<main class="home">
  <div class="home__hero">
    <div class="home__seal">${seal()}</div>
    <h1>${opts.eventName}<br /><span>村民服务站</span></h1>
    <p class="home__sub">${opts.subtitle}</p>
  </div>

  <div class="home__note">
    <p><strong>这个页面需要你的专属二维码。</strong></p>
    <p>请微信扫卡片上的二维码，或点家人转发给你的链接。</p>
  </div>

  <nav class="home__links">
    <a href="/tips"><span>营地 TIPS</span><em>第一次来？先看这个</em></a>
    <a href="/charter"><span>村庄公约</span><em>一起遵守的几件小事</em></a>
    <a href="/map"><span>营地地图</span><em>营位分布</em></a>
    <a href="/nearby"><span>周边吃饭与住宿</span><em>营地外的好去处</em></a>
  </nav>

  <p class="home__dim home__contact">现场联系人：${opts.contactName}</p>
</main>
${footer()}`,
  )
}
