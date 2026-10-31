const ROOT = typeof window === 'undefined' ? '/' : window.Shopify?.routes?.root || '/';
export function couponTitle(code, amount = 0) {
  if (code === 'AGARUKE500') return 'AGARUKEオープン記念！500円OFF';
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
  const title=code==='AGARUKE500'?couponTitle(code):label||couponTitle(code,amount);
  return {selected:true,text:valid?`${title} 適用中`:`${title} 選択中（利用条件未達）`};
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
  async function request(path,body){const r=await fetch(ROOT+path,{cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});if(!r.ok)throw Error('クーポンを更新できませんでした。もう一度お試しください。');return r.json();}
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
    mount();let label='';const code=cart.discount_codes?.find(c=>c.applicable===true)?.code||cart.discount_codes?.[0]?.code;
    if(code&&cart.attributes?._agaruke_coupon_hash){const patch=await couponChange(code);if(patch.attributes._agaruke_coupon_hash===cart.attributes._agaruke_coupon_hash)label=cart.attributes._agaruke_coupon_label||'';}
    const summary=couponSummary(cart,label);selectedCode=code||'';const amount=(cart.cart_level_discount_applications||[]).filter(d=>d.type==='discount_code').reduce((sum,d)=>sum+Number(d.total_allocated_amount||0),0)/100;currentState={...summary,title:selectedCode==='AGARUKE500'?couponTitle(selectedCode):label||couponTitle(selectedCode,amount),applicable:summary.selected&&!summary.text.includes('条件未達')};renderBanner();window.dispatchEvent(new CustomEvent('agaruke:coupon-changed'));document.dispatchEvent(new Event('agaruke:banner-layout'));
  }
  function renderBanner(){
    if(!bar)return;const view=benefitBanner(member,currentState);bar.hidden=!view.visible;text.textContent=view.text;change.textContent=view.action||'変更';clear.hidden=member?.linked!==true||!currentState.selected;bar.dataset.state=view.mode;change.href=view.mode==='unlinked'||member?.linked===true?couponPageHref:ROOT+'cart';
  }
  window.addEventListener('agaruke:members-state',event=>{if(typeof event.detail?.linked==='boolean'){member=event.detail;renderBanner();document.dispatchEvent(new Event('agaruke:banner-layout'));}});
  async function refresh(){try{await show(await request('cart.js'));}catch{mount();text.textContent='クーポンの状態を確認できませんでした';}}
  async function select(code,title=''){
    if(busy)throw Error('クーポンを更新しています。');busy=true;mount();clear.disabled=true;
    try{const cart=await request('cart/update.js',await couponChange(code,title));await show(cart);if(location.pathname.replace(/\/$/,'').endsWith('/cart'))location.reload();return cart;}
    finally{busy=false;clear.disabled=false;}
  }
  window.agarukeCoupons={select,refresh,current:()=>({...currentState}),memberSelected:()=>/^AM(?:[a-f0-9]{64}|TEST[A-F0-9]{32})$/i.test(selectedCode),isSelected:code=>Boolean(code)&&code===selectedCode};
  function schedule(){clearTimeout(pending);pending=setTimeout(refresh,100);}
  if(typeof subscribe==='function'&&typeof PUB_SUB_EVENTS!=='undefined')subscribe(PUB_SUB_EVENTS.cartUpdate,schedule);
  window.addEventListener('pageshow',e=>{if(e.persisted)schedule()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
  mount();renderBanner();refresh();window.dispatchEvent(new Event('agaruke:coupons-ready'));
}
