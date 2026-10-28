export const POINT_PROPERTY = '獲得予定ポイント（注文全体）';
export function pointNotice(state) {
  if (!state.linked || !state.ready || !state.standard_points) return '';
  return state.link_test_only ? '0pt（連携試験中・通常100pt）' : `${state.expected_points}pt（支払い完了後に確定）`;
}
export function annotationChange(cart, notice) {
  for (let i=0; i<cart.items.length; i++) {
    const item=cart.items[i]; const value=i===0?notice:'';
    if ((item.properties?.[POINT_PROPERTY]||'')!==value) return {id:item.key,quantity:item.quantity,properties:{...item.properties,[POINT_PROPERTY]:value}};
  }
  return null;
}
if (typeof document !== 'undefined') {
  const configNode=document.getElementById('agaruke-members-config');
  if(configNode) initialize(JSON.parse(configNode.textContent));
}
function initialize(config) {
  const storageKey='agaruke-purchase-v2';
  const root=window.Shopify?.routes?.root||'/';
  let running=null;let scheduled=null;let again=false;
  const safeStorage={get(){try{return sessionStorage.getItem(storageKey)||'';}catch{return '';}},set(token){try{if(token)sessionStorage.setItem(storageKey,token);else sessionStorage.removeItem(storageKey);}catch{}}};
  async function request(url,body) {
    const response=await fetch(url,{cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
    if(!response.ok)throw new Error('MEMBERS_STATUS_UNAVAILABLE');
    return response.json();
  }
  function show(state) {
    for(const anchor of document.querySelectorAll('.announcement-bar a')) {
      if(new URL(anchor.href,location.origin).pathname!==config.path)continue;
      const section=anchor.closest('.shopify-section');
      const single=section?.querySelectorAll('.announcement-bar__message').length===1&&!section.querySelector('.list-social,localization-form');
      const target=single?section:anchor.closest('.slideshow__slide')||anchor;
      if(state.linked)target.style.display='none';else target.style.removeProperty('display');
    }
    for(const card of document.querySelectorAll('[data-agaruke-member-card]')) {
      card.querySelector('[data-members-unlinked]').hidden=state.linked;
      card.querySelector('[data-members-linked]').hidden=!state.linked;
      const points=card.querySelector('[data-members-points]');
      points.textContent=state.ready?(state.link_test_only?'通常はこの注文で100ポイント。現在は連携試験中のため、今回の付与予定は0ポイントです。':`この注文の獲得予定は${state.expected_points}ポイントです。支払い完了後に付与します。`):'ポイントカードは連携済みです。購入内容を確認すると獲得予定ポイントが表示されます。';
      const coupon=card.querySelector('[data-members-coupons]');coupon.replaceChildren();
      if(state.coupon_count>0) {
        const text=document.createElement('p');text.textContent=state.link_test_only?`ECクーポンが${state.coupon_count}枚あります。利用開始前のため、現在は確認のみできます。`:`ECクーポンが${state.coupon_count}枚あります。お支払い前に適用してください。`;coupon.append(text);
        const link=document.createElement('a');link.className='button button--secondary';link.href=state.coupon_url;link.textContent=state.link_test_only?'クーポンを確認する':'クーポンを確認・使う';coupon.append(link);
      }
    }
  }
  async function refresh() {
    if(running)return running;
    running=(async()=>{
      const cart=await request(root+'cart.js');
      const token=safeStorage.get()||cart.attributes?._agaruke_purchase||'';
      if(!config.customer_present&&!token) {
        show({linked:false});
        if(config.is_cart)await annotate(cart,'');
        return;
      }
      const state=await request(config.path,{action:'storefront_status',token,cart:cart.token||(cart.item_count===0?'empty-cart':''),item_count:cart.item_count,total_price:cart.total_price,currency:cart.currency,resume:config.is_cart});
      if(state.purchase_token) {
        safeStorage.set(state.purchase_token);
        await request(root+'cart/update.js',{attributes:{_agaruke_purchase:state.purchase_token}});
      } else if(!state.linked) {
        safeStorage.set('');
        if(cart.attributes?._agaruke_purchase)await request(root+'cart/update.js',{attributes:{_agaruke_purchase:''}});
      }
      show(state);
      if(config.is_cart)await annotate(await request(root+'cart.js'),pointNotice(state));
    })().catch(()=>{
      for(const message of document.querySelectorAll('[data-members-points]'))message.textContent='ポイントの状態を確認できませんでした。ページを再読み込みしてください。';
    }).finally(()=>{running=null;if(again){again=false;schedule();}});
    return running;
  }
  async function annotate(cart,notice) {
    if(!annotationChange(cart,notice))return;
    const controls=[...document.querySelectorAll('cart-items input, cart-items button, button[name="checkout"]')].filter(el=>!el.disabled);
    controls.forEach(el=>el.disabled=true);
    try {
      cart=await request(root+'cart.js');
      for(let i=0;i<cart.items.length+2;i++) {
        const change=annotationChange(cart,notice);if(!change)break;
        cart=await request(root+'cart/change.js',change);
      }
      if(typeof publish==='function'&&typeof PUB_SUB_EVENTS!=='undefined')await publish(PUB_SUB_EVENTS.cartUpdate,{source:'agaruke-members',cartData:cart});
    } finally {controls.forEach(el=>{if(el.isConnected)el.disabled=false;});}
  }
  function schedule(){if(running){again=true;return;}clearTimeout(scheduled);scheduled=setTimeout(refresh,180);}
  if(typeof subscribe==='function'&&typeof PUB_SUB_EVENTS!=='undefined')subscribe(PUB_SUB_EVENTS.cartUpdate,event=>{if(event.source!=='agaruke-members')schedule();});
  window.addEventListener('pageshow',event=>{if(event.persisted)schedule();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
  document.addEventListener('shopify:section:load',schedule);
  refresh();
}
