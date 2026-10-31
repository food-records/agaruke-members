const ROOT = typeof window === 'undefined' ? '/' : window.Shopify?.routes?.root || '/';
export function couponTitle(code, amount = 0) {
  if (code === 'AGARUKE500') return '初回購入 500円OFFクーポン';
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
  const code=codes[0]?.code||applied[0]?.title||'';
  const valid=codes.length?codes.some(c=>c.applicable===true):applied.length>0;
  const amount=(applied.reduce((sum,d)=>sum+Number(d.total_allocated_amount||0),0))/100;
  const title=label||couponTitle(code,amount);
  return {selected:true,text:valid?`${title} 適用中`:`${title} 選択中（利用条件未達）`};
}
if(typeof document!=='undefined') initialize();
function initialize(){
  let bar, text, clear, busy=false, pending;
  async function request(path,body){const r=await fetch(ROOT+path,{cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});if(!r.ok)throw Error('クーポンを更新できませんでした。もう一度お試しください。');return r.json();}
  function mount(){
    if(bar)return;
    bar=document.createElement('aside');bar.className='agaruke-coupon-bar';bar.setAttribute('aria-label','クーポンの選択状態');
    text=document.createElement('span');text.setAttribute('role','status');text.textContent='クーポンを確認中…';
    const change=document.createElement('a');change.href='/apps/members';change.textContent='選択・変更';
    clear=document.createElement('button');clear.type='button';clear.textContent='解除';clear.hidden=true;
    clear.addEventListener('click',()=>select('').catch(e=>{text.textContent=e.message}));
    bar.append(text,change,clear);document.body.append(bar);
  }
  async function show(cart){
    mount();let label='';const code=cart.discount_codes?.[0]?.code;
    if(code&&cart.attributes?._agaruke_coupon_hash){const patch=await couponChange(code);if(patch.attributes._agaruke_coupon_hash===cart.attributes._agaruke_coupon_hash)label=cart.attributes._agaruke_coupon_label||'';}
    const summary=couponSummary(cart,label);text.textContent=summary.text;clear.hidden=!summary.selected;
  }
  async function refresh(){try{await show(await request('cart.js'));}catch{mount();text.textContent='クーポンの状態を確認できませんでした';}}
  async function select(code,title=''){
    if(busy)throw Error('クーポンを更新しています。');busy=true;mount();clear.disabled=true;
    try{const cart=await request('cart/update.js',await couponChange(code,title));await show(cart);window.dispatchEvent(new CustomEvent('agaruke:coupon-changed'));if(location.pathname.replace(/\/$/,'').endsWith('/cart'))location.reload();return cart;}
    finally{busy=false;clear.disabled=false;}
  }
  window.agarukeCoupons={select,refresh};
  function schedule(){clearTimeout(pending);pending=setTimeout(refresh,100);}
  if(typeof subscribe==='function'&&typeof PUB_SUB_EVENTS!=='undefined')subscribe(PUB_SUB_EVENTS.cartUpdate,schedule);
  window.addEventListener('pageshow',e=>{if(e.persisted)schedule()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
  refresh();window.dispatchEvent(new Event('agaruke:coupons-ready'));
}
