import {getCart,mutateCart} from './agaruke-cart.js?v=2026103101';
import {createLaunchCouponState,launchRemoval} from './agaruke-launch-coupon.js?v=2026103101';
const isLaunch=code=>typeof code==='string'&&code.toUpperCase()==='AGARUKE500';
const ROOT = typeof window === 'undefined' ? '/' : window.Shopify?.routes?.root || '/';
export function couponTitle(code, amount = 0) {
  if (isLaunch(code)) return 'AGARUKEオープン記念！500円OFF';
  if (/^AMTEST[A-F0-9]{32}$/.test(code)) return 'テスト 500円OFFクーポン';
  if (/^AM[a-f0-9]{64}$/i.test(code)) return amount > 0 ? `EC ${amount.toLocaleString()}円OFFクーポン` : 'ECポイント交換クーポン';
  return 'クーポン';
}
export async function couponChange(code, title = '') {
  const digest = code ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code))),x=>x.toString(16).padStart(2,'0')).join('') : '';
  return {discount:code,attributes:{_agaruke_coupon_label:code?title:'',_agaruke_coupon_hash:digest}};
}
export function couponSummary(cart, label = '') {
  const codes=cart.discount_codes||[];
  const applied=(cart.cart_level_discount_applications||[]).filter(d=>d.type==='discount_code');
  if(!codes.length&&!applied.length)return {selected:false,text:'クーポン未選択'};
  const code=codes.find(c=>c.applicable===true)?.code||codes[0]?.code||applied[0]?.title||'';
  const valid=codes.length?codes.some(c=>c.applicable===true):applied.length>0;
  const amount=(applied.reduce((sum,d)=>sum+Number(d.total_allocated_amount||0),0))/100;
  const title=isLaunch(code)?couponTitle(code):label||couponTitle(code,amount);
  return {selected:true,applicable:valid,text:valid?`${title} 適用中`:`${title} 選択中（利用できません）`};
}
export function benefitBanner(member,coupon) {
  if(coupon.selected)return {visible:true,mode:coupon.applicable?'applied':'unmet',text:coupon.text,action:member?.linked===true?'変更':'カートを確認'};
  if(typeof member?.linked!=='boolean')return {visible:false,mode:'pending',text:''};
  if(!member.linked)return {visible:true,mode:'unlinked',text:'LINEポイントカードの登録・連携はこちら',action:'LINEで登録・連携'};
  return {visible:false,mode:'linked',text:''};
}
if(typeof document!=='undefined') initialize();
function initialize(){
  let member=window.agarukeMemberPresentation;
  const returnTo=/^\/(collections|products|search)(\/|\?|$)/.test(location.pathname)?location.pathname+location.search:'';
  const couponPageHref='/apps/members'+(returnTo?'?return_to='+encodeURIComponent(returnTo):'');
  let bar, text, change, clear, busy=false, pending, selectedCode='', currentState={selected:false,title:'クーポン未選択',text:'クーポン未選択',applicable:false};
  let launchActive=false, launchPresent=false, reconciling=false, pendingReconcile=false;
  const launch=createLaunchCouponState({
    initial:'unknown',
    lookup:async()=>{
      const response=await fetch(ROOT.replace(/\/$/,'')+'/apps/members?agaruke_coupon_status=1',{method:'POST',cache:'no-store',signal:AbortSignal.timeout(12000),headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({action:'launch_status'})});
      if(!response.ok)throw Error('LAUNCH_STATUS_UNAVAILABLE');
      const result=(await response.json()).launch_coupon;
      console.debug('AGARUKE_LAUNCH_CHECK', ['guest','used','not_used','unknown','expired'].includes(result)?result:'unexpected_response');
      return result;
    },
    onChange:state=>{
      window.dispatchEvent(new CustomEvent('agaruke:launch-coupon-state',{detail:{state}}));
      renderBanner();window.dispatchEvent(new Event('agaruke:coupon-changed'));
      if(state==='used')void reconcileUsed();
    }
  });
  function checkLaunch(){launchActive=true;return launch.check();}
  async function reconcileUsed(){
    if(launch.current()!=='used'||!launchPresent||reconciling)return;
    if(busy){pendingReconcile=true;return;}
    reconciling=true;busy=true;
    try{
      const currentCart=await getCart({fresh:true});
      if(launch.current()!=='used')return;
      const patch=launchRemoval(currentCart);
      if(!patch)return;
      await show(await request('cart/update.js',patch));
      window.dispatchEvent(new Event('agaruke:launch-coupon-removed'));
      if(location.pathname.replace(/\/$/,'').endsWith('/cart'))location.reload();
    }catch{
      window.dispatchEvent(new Event('agaruke:launch-coupon-removal-error'));
    }finally{reconciling=false;busy=false;pendingReconcile=false;}
  }
  async function request(path,body){if(path==='cart.js'&&!body)return getCart();if(path==='cart/update.js'&&body)return mutateCart(ROOT+path,body);const r=await fetch(ROOT+path,{cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});if(!r.ok)throw Error('クーポンを更新できませんでした。もう一度お試しください。');return r.json();}
  function mount(){
    if(bar)return;
    bar=document.createElement('aside');bar.className='agaruke-coupon-banner shopify-section-group-header-group';bar.setAttribute('aria-label','ポイント・クーポンのご案内');bar.hidden=true;document.documentElement.dataset.agarukeBenefitsBanner='ready';
    text=document.createElement('span');text.setAttribute('role','status');text.textContent='クーポンを確認中…';
    change=document.createElement('a');change.href=couponPageHref;change.textContent='クーポンを選ぶ';
    clear=document.createElement('button');clear.type='button';clear.textContent='解除';clear.hidden=true;
    clear.addEventListener('click',()=>select('').catch(e=>{text.textContent=e.message}));
    const content=document.createElement('div');content.className='agaruke-coupon-banner-inner';content.append(text,change,clear);bar.append(content);const header=document.querySelector('.section-header');if(header)header.before(bar);else document.body.prepend(bar);document.dispatchEvent(new Event('agaruke:banner-layout'));
  }
  async function show(cart){
    mount();launchPresent=(cart.discount_codes||[]).some(item=>isLaunch(item.code));let label='';const code=cart.discount_codes?.find(c=>c.applicable===true)?.code||cart.discount_codes?.[0]?.code;
    if(code&&cart.attributes?._agaruke_coupon_hash){const patch=await couponChange(code);if(patch.attributes._agaruke_coupon_hash===cart.attributes._agaruke_coupon_hash)label=cart.attributes._agaruke_coupon_label||'';}
    const summary=couponSummary(cart,label);selectedCode=code||'';const amount=(cart.cart_level_discount_applications||[]).filter(d=>d.type==='discount_code').reduce((sum,d)=>sum+Number(d.total_allocated_amount||0),0)/100;currentState={...summary,title:isLaunch(selectedCode)?couponTitle(selectedCode):label||couponTitle(selectedCode,amount),applicable:summary.applicable===true};renderBanner();window.dispatchEvent(new CustomEvent('agaruke:coupon-changed'));document.dispatchEvent(new Event('agaruke:banner-layout'));if(launchPresent){if(!launchActive)void checkLaunch();else if(launch.current()==='used')void reconcileUsed();}
  }
  function presentedState(){
    if(isLaunch(selectedCode)&&launch.current()==='used')return {...currentState,applicable:false,text:currentState.title+' 使用済み'};
    if(isLaunch(selectedCode)&&launch.current()==='checking')return {...currentState,applicable:false,text:currentState.title+' 確認中'};
    return currentState;
  }
  function renderBanner(){
    if(!bar)return;const view=benefitBanner(member,presentedState());bar.hidden=!view.visible;text.textContent=view.text;change.textContent=view.action||'変更';clear.hidden=member?.linked!==true||!currentState.selected;bar.dataset.state=view.mode;change.href=view.mode==='unlinked'||member?.linked===true?couponPageHref:ROOT+'cart';
  }
  window.addEventListener('agaruke:members-state',event=>{if(typeof event.detail?.linked==='boolean'){member=event.detail;renderBanner();document.dispatchEvent(new Event('agaruke:banner-layout'));}});
  async function refresh(){try{await show(await request('cart.js'));}catch{mount();text.textContent='クーポンの状態を確認できませんでした';}}
  async function select(code,title=''){
    if(busy)throw Error('クーポンを更新しています。');busy=true;mount();clear.disabled=true;
    try{if(isLaunch(code)){const status=await checkLaunch();if(status==='used')throw Error('この500円クーポンは使用済みです。');if(status==='expired')throw Error('この500円クーポンは有効期限が切れています。');}const cart=await request('cart/update.js',await couponChange(code,title));await show(cart);if(location.pathname.replace(/\/$/,'').endsWith('/cart'))location.reload();return cart;}
    finally{busy=false;clear.disabled=false;const reconcile=pendingReconcile;pendingReconcile=false;if(reconcile)void reconcileUsed();}
  }
  window.agarukeCoupons={select,refresh,launchStatus:()=>launch.current(),checkLaunch,current:()=>({...presentedState()}),memberSelected:()=>/^AM(?:[a-f0-9]{64}|TEST[A-F0-9]{32})$/i.test(selectedCode),isSelected:code=>Boolean(code)&&code===selectedCode};
  function schedule(){clearTimeout(pending);pending=setTimeout(refresh,100);}
  if(typeof subscribe==='function'&&typeof PUB_SUB_EVENTS!=='undefined')subscribe(PUB_SUB_EVENTS.cartUpdate,schedule);
  window.addEventListener('pageshow',e=>{if(e.persisted){schedule();if(launchActive){launch.invalidate();void checkLaunch();}}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){schedule();if(launchActive){launch.invalidate();void checkLaunch();}}});
  window.addEventListener('agaruke:benefits-open',()=>{void checkLaunch();});
  window.addEventListener('agaruke:members-authenticated',()=>{void checkLaunch();});
  mount();renderBanner();refresh();window.dispatchEvent(new Event('agaruke:coupons-ready'));if(/\/apps\/members\/?$/.test(location.pathname))void checkLaunch();
}
