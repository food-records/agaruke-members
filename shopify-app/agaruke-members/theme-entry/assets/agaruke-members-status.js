export const POINT_PROPERTY = '獲得予定ポイント（注文全体）';
export const DISPLAY_CACHE_KEY = 'agaruke-members-display-v3';
export const DISPLAY_CACHE_TTL = 5 * 60 * 1000;
export function clearLegacyAnnotation(cart) {
  for (const item of cart.items) {
    if (item.properties?.[POINT_PROPERTY]) return {id:item.key,quantity:item.quantity,properties:{...item.properties,[POINT_PROPERTY]:''}};
  }
  return null;
}
export function cacheRecord(state,key,now=Date.now(),identityKey=key) {
  if(typeof state?.linked!=='boolean')return null;
  return {version:3,key,identity_key:identityKey,at:now,state:{linked:state.linked===true,ready:state.ready===true,permanent:state.permanent===true,
    expected_points:state.expected_points===100?100:0,link_test_only:state.link_test_only!==false,
    coupon_count:Number.isInteger(state.coupon_count)&&state.coupon_count>0?state.coupon_count:0,test_coupon_count:Number.isInteger(state.test_coupon_count)&&state.test_coupon_count>0?state.test_coupon_count:0,coupon_url:'/apps/members'}};
}
export function readDisplayCache(storage,key,now=Date.now(),identityKey=key) {
  try {
    const saved=JSON.parse(storage.getItem(DISPLAY_CACHE_KEY)||'null');
    if(!key||saved?.version!==3||(saved.key!==key&&saved.identity_key!==identityKey)||!Number.isFinite(saved.at)||now<saved.at||now-saved.at>=DISPLAY_CACHE_TTL)return null;
    const record=cacheRecord(saved.state,key,saved.at,identityKey);
    if(!record)return null;
    return saved.key===key?record.state:{...record.state,ready:false,expected_points:0,coupon_count:0,test_coupon_count:0};
  } catch {return null;}
}
if (typeof document !== 'undefined') {
  const configNode=document.getElementById('agaruke-members-config');
  if(configNode) initialize(JSON.parse(configNode.textContent));
}
function initialize(config) {
  const storageKey='agaruke-purchase-v2';
  const root=window.Shopify?.routes?.root||'/';
  let running=null;let scheduled=null;let again=false;let forceAgain=false;
  const safeStorage={get(){try{return sessionStorage.getItem(storageKey)||'';}catch{return '';}},set(token){try{if(token)sessionStorage.setItem(storageKey,token);else sessionStorage.removeItem(storageKey);}catch{}}};
  async function request(url,body) {
    const response=await fetch(url,{cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
    if(!response.ok)throw new Error('MEMBERS_STATUS_UNAVAILABLE');
    return response.json();
  }
  function show(state) {
    if(typeof state?.linked!=='boolean')return;
    document.documentElement.dataset.agarukeMembersState=state.linked?'linked':'unlinked';
    window.agarukeMemberPresentation=cacheRecord(state,'display')?.state||{linked:state.linked};
    window.dispatchEvent(new CustomEvent('agaruke:members-state',{detail:window.agarukeMemberPresentation}));
    for(const anchor of document.querySelectorAll('.announcement-bar a')) {
      const path=new URL(anchor.href,location.origin).pathname.replace(/\/$/,'');
      if(path!==config.path&&path!==root.replace(/\/$/,'')+config.path)continue;
      const section=anchor.closest('.shopify-section');
      const single=section?.querySelectorAll('.announcement-bar__message').length===1&&!section.querySelector('.list-social,localization-form');
      const target=single?section:anchor.closest('.slideshow__slide')||anchor;
      target.style.display='none';
    }
    for(const card of document.querySelectorAll('[data-agaruke-member-card]')) {
      card.querySelector('[data-members-unlinked]').hidden=state.linked;
      card.querySelector('[data-members-linked]').hidden=!state.linked;
      const points=card.querySelector('[data-members-points]');
      points.textContent=state.ready?(state.link_test_only?'通常はこの注文で100ポイント。現在は連携試験中のため、今回の付与予定は0ポイントです。':`この注文の獲得予定は${state.expected_points}ポイントです。支払い完了後に付与します。`):'ポイントカードは連携済みです。購入内容を確認すると獲得予定ポイントが表示されます。';
      const coupon=card.querySelector('[data-members-coupons]');coupon.replaceChildren();
      {
        const text=document.createElement('p');text.textContent=state.coupon_count>0?`ECクーポンが${state.coupon_count}枚あります。使うクーポンを選択できます。`:'ポイント・クーポンは会員ページで確認できます。';coupon.append(text);
        const link=document.createElement('a');link.className='button button--secondary';link.href=state.coupon_url;link.textContent='ポイント・クーポンを確認する';coupon.append(link);
      }
    }
  }
  function cachedState(){try{return readDisplayCache(sessionStorage,config.cache_key,Date.now(),config.identity_key||config.cache_key);}catch{return null;}}
  function remember(state){try{if(config.cache_key)sessionStorage.setItem(DISPLAY_CACHE_KEY,JSON.stringify(cacheRecord(state,config.cache_key,Date.now(),config.identity_key||config.cache_key)));}catch{}}
  async function refresh(force=false) {
    if(running){again=true;forceAgain=forceAgain||force;return running;}
    const cached=cachedState();
    if(cached)show(cached);
    if(cached&&!force&&!config.legacy_note)return;
    if(!config.customer_present&&config.has_cart_session===false&&!safeStorage.get()&&!config.is_cart&&!config.legacy_note){show({linked:false});remember({linked:false});return;}
    const dedicated=location.pathname.replace(/\/$/,'')===config.path;
    if(dedicated&&!config.legacy_note)return;
    running=(async()=>{
      const cart=await request(root+'cart.js');
      if(dedicated){await cleanupLegacyNote(cart);return;}
      const token=safeStorage.get()||cart.attributes?._agaruke_purchase||'';
      if(!config.customer_present&&!token) {
        show({linked:false});
        remember({linked:false});
        if(config.is_cart||config.legacy_note)await cleanupLegacyNote(cart);
        return;
      }
      if(cached&&!force){await cleanupLegacyNote(cart);return;}
      const state=await request(config.path,{action:'storefront_status',token,cart:cart.token||(cart.item_count===0?'empty-cart':''),item_count:cart.item_count,total_price:cart.total_price,currency:cart.currency,resume:config.is_cart});
      if(typeof state?.linked!=='boolean')throw new Error('MEMBERS_STATUS_INVALID');
      if(state.purchase_token) {
        safeStorage.set(state.purchase_token);
        await request(root+'cart/update.js',{attributes:{_agaruke_purchase:state.purchase_token}});
      } else if(state.linked&&state.ready&&token) {
        safeStorage.set(token);
      } else if(!state.linked) {
        safeStorage.set('');
        if(cart.attributes?._agaruke_purchase)await request(root+'cart/update.js',{attributes:{_agaruke_purchase:''}});
      }
      show(state);
      remember(state);
      if(config.is_cart||config.legacy_note)await cleanupLegacyNote(await request(root+'cart.js'));
    })().catch(()=>{
      for(const message of document.querySelectorAll('[data-members-points]'))message.textContent='ポイントの状態を確認できませんでした。ページを再読み込みしてください。';
    }).finally(()=>{running=null;if(again){const force=forceAgain;again=false;forceAgain=false;schedule(force);}});
    return running;
  }
  async function cleanupLegacyNote(cart) {
    if(!clearLegacyAnnotation(cart)){config.legacy_note=false;return;}
    const controls=[...document.querySelectorAll('cart-items input, cart-items button, button[name="checkout"]')].filter(el=>!el.disabled);
    controls.forEach(el=>el.disabled=true);
    try {
      cart=await request(root+'cart.js');
      for(let i=0;i<cart.items.length+2;i++) {
        const change=clearLegacyAnnotation(cart);if(!change)break;
        cart=await request(root+'cart/change.js',change);
      }
      config.legacy_note=false;
      if(typeof publish==='function'&&typeof PUB_SUB_EVENTS!=='undefined')await publish(PUB_SUB_EVENTS.cartUpdate,{source:'agaruke-members',cartData:cart});
    } finally {controls.forEach(el=>{if(el.isConnected)el.disabled=false;});}
  }
  function schedule(force=false){if(running){again=true;forceAgain=forceAgain||force;return;}clearTimeout(scheduled);scheduled=setTimeout(()=>refresh(force),180);}
  if(typeof subscribe==='function'&&typeof PUB_SUB_EVENTS!=='undefined')subscribe(PUB_SUB_EVENTS.cartUpdate,event=>{if(event.source!=='agaruke-members')schedule(true);});
  window.addEventListener('pageshow',event=>{if(event.persisted){try{sessionStorage.removeItem(DISPLAY_CACHE_KEY);}catch{}schedule(true);}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
  document.addEventListener('shopify:section:load',()=>schedule());
  window.addEventListener('agaruke:members-authenticated',()=>{try{sessionStorage.removeItem(DISPLAY_CACHE_KEY);}catch{}show({linked:true});});
  refresh(config.is_cart);
}
