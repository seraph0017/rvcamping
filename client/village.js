// Customer-provided view, gallery and touch-map behavior; shared data lives on the server.
const token = document.body.dataset.token;
const sections = new Set(['card', 'rules', 'tips', 'map', 'campmap', 'schedule', 'guestbook', 'lottery']);
let activeView = 'card', toastTimer, statusInFlight = false, mounted = false;
const scrollPositions = new Map();
const $ = (selector) => document.querySelector(selector);

function toast(message) {
  const el = $('#toast');
  clearTimeout(toastTimer);
  el.textContent = message;
  el.classList.remove('hide');
  toastTimer = setTimeout(() => el.classList.add('hide'), 3500);
}

function setStatus(kind, done) {
  $('#' + kind + 'Status')?.classList.toggle('done', done);
  const text = $('#' + kind + 'Text'), state = $('#' + kind + 'State');
  if (text) text.textContent = done ? (kind === 'checkin' ? '已完成签到' : '已完成领取') : (kind === 'checkin' ? '等待工作人员确认' : '每户一份');
  if (state) state.textContent = done ? (kind === 'checkin' ? '已签到' : '已领取') : (kind === 'checkin' ? '待签到' : '待领取');
}

async function refreshStatus() {
  if (!token || document.hidden || statusInFlight) return;
  statusInFlight = true;
  try {
    const res = await fetch('/api/v/' + token, { cache: 'no-store' });
    if (!res.ok) throw new Error('status');
    const { family } = await res.json();
    setStatus('checkin', family.checkin_at !== null);
    setStatus('gift', family.gift_at !== null);
    $('#cardSync').textContent = '状态已同步 · ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    $('#cardSync').textContent = '暂未连接服务站，显示上次状态；联网后自动更新';
  } finally { statusInFlight = false; }
}

async function renderGuests() {
  const list = $('#guestList');
  try {
    const res = await fetch('/api/guestbook', { cache: 'no-store' });
    if (!res.ok) throw new Error('messages');
    const { messages } = await res.json();
    list.replaceChildren();
    if (!messages.length) { list.className = 'empty-state'; list.textContent = '还没有留言，欢迎写下第一条。'; return; }
    list.className = '';
    for (const item of messages) {
      const entry = document.createElement('div'); entry.className = 'guest-entry';
      const name = document.createElement('strong'); name.textContent = item.name;
      const time = document.createElement('time');
      time.textContent = new Date(item.created_ms).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const body = document.createElement('p'); body.textContent = item.message;
      entry.append(name, time, body); list.append(entry);
    }
  } catch { list.textContent = '留言暂未加载，请稍后重试。'; }
}

function show(view, push = true) {
  if (!sections.has(view)) view = 'card';
  scrollPositions.set(activeView, window.scrollY);
  const update = () => {
    document.querySelectorAll('[id^="view-"]').forEach(el => { const visible = el.id === 'view-' + view; el.classList.toggle('hide', !visible); el.inert = !visible; });
    $('#siteHeader').classList.toggle('hide', view !== 'card');
    $('#mainFoot').classList.toggle('hide', view !== 'card');
    activeView = view;
    window.scrollTo({ top: scrollPositions.get(view) ?? 0, behavior: 'instant' });
    if (view === 'campmap') { mapScale = 1; mapRotation = 0; mapOffsetX = mapOffsetY = 0; drawMap(); }
  };
  if (mounted && document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(update);
  else {
    update();
    if (mounted && !matchMedia('(prefers-reduced-motion: reduce)').matches) $('#view-' + view).animate([{ opacity: 0.4, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'ease-out' });
  }
  mounted = true;
  if (push) history.pushState({ view }, '', '#' + view);
  if (view === 'guestbook') void renderGuests();
  if (view === 'card') void refreshStatus();
}

 const tipsData=[
  {title:'码头钓场',meta:'由咱们的肌肉钓友小孙主理',text:'景色宜人，鱼种丰富，路亚友好，欢迎来甩竿搏鱼！',images:[['/assets/village/pier-fishing-map.webp','码头钓场与周边水域图'],['/assets/village/pier-fishing-catches.webp','钓友与渔获分享']]},
  {title:'露草绀蓝 · 营地咖啡馆',meta:'Lucao Ganlan · Camp Café｜From 村民老郑（蓝色春帐）',text:'位置：营地码头钓场旁。',images:[['/assets/village/cafe-photo-1.webp','露草绀蓝咖啡馆'],['/assets/village/cafe-photo-2.webp','咖啡馆室内']]},
  {title:'ARO汀弋 · 营地饵房',meta:'ARO Tingyi · Camp Bait House',text:'位置：营地 A5 营位附近。',images:[['/assets/village/bait-house-1.webp','营地饵房室内'],['/assets/village/bait-house-2.webp','营地饵房吧台']]},
  {title:'阿姨食堂',meta:'营地里的方便小食堂',text:'位于鱼塘斜对面，沿路有指示牌。是营地阿姨自营的小食堂，价格实惠，供应面条、盖浇饭、馄饨、水饺等，用餐很方便。',images:[['/assets/village/auntie-canteen.webp','阿姨食堂招牌与餐品']]},
  {title:'住宿与机场交通',meta:'周边推荐 · 酒店与交通',text:`全季酒店（上海松江小昆山店）
地址：上海松江区小昆山镇文翔路 5388 弄 5 号 112 商铺。
距营地驾车约 15 公里，约 25 分钟。

虹桥机场：约 49 公里，驾车约 52 分钟。
浦东机场：约 78 公里，驾车约 1 小时 1 分钟。`},
  {title:'营地周边美食和补给',meta:'老村民私藏推荐',html:`<div class="food-list">
<div class="food-item"><div class="food-head"><strong>01 · 农家菜老大（松江店）</strong><span>人均 80–100 元</span></div><div class="food-location">📍 松江区沪松公路 6351 号</div><p>地道本帮农家菜，场地宽敞、包间充足，紧邻高速路口，往返营地很方便。</p><div class="food-reco">推荐：梅干菜饼、稻草扎肉、土烧水库鱼。人气火爆，记得提前电话订位。</div></div>
<div class="food-item"><div class="food-head"><strong>02 · 浦南饭店（村口）</strong><span>人均 60–80 元</span></div><div class="food-location">📍 松江区五厍大街 1 号</div><p>村民日常常去的本地菜馆，大金链子老板亲自掌勺，口味地道。</p><div class="food-reco">推荐：响油鳝丝、炒肚片、椒盐排条。</div></div>
<div class="food-item"><div class="food-head"><strong>03 · 尚蔬鲜品（补给超市）</strong></div><div class="food-location">📍 浦南饭店斜对面</div><p>村口大型超市，食材、日用品基本齐全，补给很省心。</p></div>
<div class="food-item"><div class="food-head"><strong>04 · 古法传统牛肉汤</strong><span>人均 30–50 元</span></div><div class="food-location">📍 中厍路 216 号（悸动烧仙草隔壁）</div><p>夫妻小店，性价比很高。</p><div class="food-reco">推荐：牛肉锅、牛骨头锅、鲜切吊龙、牛肉炒饭。路口对面晚间还有烧饼摊，烧饼风味不错，可以顺路尝尝。</div></div>
</div>`}
 ];

 let tipIndex=0,tipImageIndex=0;
 function renderTips(){const tip=tipsData[tipIndex],hasGallery=tip.images?.length>0,gallery=hasGallery?`<div class="tip-gallery" id="tipGallery"><img src="${tip.images[tipImageIndex][0]}" alt="${tip.images[tipImageIndex][1]}" draggable="false" loading="lazy">${tip.images.length>1?`<button class="gallery-arrow left" id="tipImagePrev" aria-label="上一张图片" ${tipImageIndex===0?'disabled':''}>‹</button><button class="gallery-arrow right" id="tipImageNext" aria-label="下一张图片" ${tipImageIndex===tip.images.length-1?'disabled':''}>›</button>`:''}<span class="tip-photo-count">${tipImageIndex+1} / ${tip.images.length}</span></div>`:'',copy=tip.html||`<div class="tips-copy">${tip.text}</div>`;document.querySelector('#tipsCount').textContent=`${String(tipIndex+1).padStart(2,'0')} / ${String(tipsData.length).padStart(2,'0')}`;document.querySelector('#prevTipBottom').disabled=tipIndex===0;document.querySelector('#nextTipBottom').disabled=tipIndex===tipsData.length-1;document.querySelector('#tipsContent').innerHTML=`<h3>${tip.title}</h3><p class="tips-meta">${tip.meta||''}</p>${copy}${gallery}`}
 let mapScale=1,mapRotation=0,mapOffsetX=0,mapOffsetY=0,dragStart=null,gestureStart=null,lastTap=0,mapHadGesture=false,tipTouchStart=null;
 const mapImg=document.querySelector('#campMapImage'),mapStage=document.querySelector('#mapStage');
 function drawMap(){mapImg.style.transform=`translate(${mapOffsetX}px,${mapOffsetY}px) rotate(${mapRotation}deg) scale(${mapScale})`}
 const touchDistance=t=>Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY),touchAngle=t=>Math.atan2(t[1].clientY-t[0].clientY,t[1].clientX-t[0].clientX)*180/Math.PI;
 mapStage.addEventListener('touchstart',e=>{if(e.touches.length===2){gestureStart={distance:touchDistance(e.touches),angle:touchAngle(e.touches),scale:mapScale,rotation:mapRotation};mapHadGesture=true;dragStart=null}else if(e.touches.length===1&&mapScale>1){dragStart={x:e.touches[0].clientX-mapOffsetX,y:e.touches[0].clientY-mapOffsetY}}},{passive:true});
 mapStage.addEventListener('touchmove',e=>{if(e.touches.length===2&&gestureStart){e.preventDefault();mapScale=Math.max(1,Math.min(4,gestureStart.scale*touchDistance(e.touches)/gestureStart.distance));mapRotation=gestureStart.rotation+touchAngle(e.touches)-gestureStart.angle;drawMap()}else if(e.touches.length===1&&dragStart){e.preventDefault();mapOffsetX=e.touches[0].clientX-dragStart.x;mapOffsetY=e.touches[0].clientY-dragStart.y;drawMap()}},{passive:false});
 mapStage.addEventListener('touchend',e=>{if(e.touches.length<2)gestureStart=null;if(e.touches.length===0){const wasGesture=mapHadGesture||!!dragStart;dragStart=null;mapHadGesture=false;const now=Date.now();if(!wasGesture&&now-lastTap<300){mapScale=mapScale===1?2:1;mapRotation=mapScale===1?0:mapRotation;mapOffsetX=mapOffsetY=0;drawMap();lastTap=0}else lastTap=wasGesture?0:now}});
 mapStage.addEventListener('touchcancel',()=>{gestureStart=null;dragStart=null});
 mapStage.addEventListener('wheel',e=>{e.preventDefault();mapScale=Math.max(1,Math.min(4,mapScale+(e.deltaY<0?.1:-.1)));drawMap()},{passive:false});
 document.querySelector('#tipsContent').addEventListener('touchstart',e=>{if(e.target.closest('#tipGallery')&&e.touches.length===1)tipTouchStart={x:e.touches[0].clientX,y:e.touches[0].clientY}},{passive:true});
 document.querySelector('#tipsContent').addEventListener('touchend',e=>{if(!tipTouchStart)return;const p=e.changedTouches[0],dx=p.clientX-tipTouchStart.x,dy=p.clientY-tipTouchStart.y;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)){const tip=tipsData[tipIndex];tipImageIndex=Math.max(0,Math.min(tip.images.length-1,tipImageIndex+(dx<0?1:-1)));renderTips()}tipTouchStart=null},{passive:true});


document.addEventListener('click', event => {
  const target = event.target.closest('button, [data-view]');
  if (!target) return;
  if (target.dataset.view) { show(target.dataset.view); return; }
  if (target.id === 'closeCampMap') { show('card'); return; }
  if (target.id === 'tipImagePrev' || target.id === 'tipImageNext') {
    tipImageIndex = Math.max(0, Math.min(tipsData[tipIndex].images.length - 1, tipImageIndex + (target.id === 'tipImageNext' ? 1 : -1)));
    renderTips();
  }
  if (target.id === 'prevTipBottom' || target.id === 'nextTipBottom') {
    tipIndex = Math.max(0, Math.min(tipsData.length - 1, tipIndex + (target.id === 'nextTipBottom' ? 1 : -1)));
    tipImageIndex = 0;
    const update = () => { renderTips(); window.scrollTo({ top: 0, behavior: 'instant' }); };
    if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(update);
    else update();
  }
});

$('#guestForm').addEventListener('submit', async event => {
  event.preventDefault();
  const message = $('#guestMessage'), button = $('#guestForm button');
  if (!message.value.trim()) return;
  button.disabled = true;
  try {
    const res = await fetch('/api/guestbook', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, name: $('#guestName').value, message: message.value }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '发布失败，请重试');
    message.value = '';
    await renderGuests(); toast('留言已发布，村民们都能看到');
  } catch (error) { toast(error.message || '网络暂未连接，留言已保留在输入框'); }
  finally { button.disabled = false; }
});

if (!token) $('#guestForm').hidden = true;
window.addEventListener('popstate', () => show(location.hash.slice(1) || document.body.dataset.initialView, false));
window.addEventListener('online', () => { void refreshStatus(); if (activeView === 'guestbook') void renderGuests(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { void refreshStatus(); if (activeView === 'guestbook') void renderGuests(); } });
setInterval(() => { void refreshStatus(); if (!document.hidden && activeView === 'guestbook') void renderGuests(); }, 5000);
renderTips();
show(location.hash.slice(1) || document.body.dataset.initialView || 'card', false);
