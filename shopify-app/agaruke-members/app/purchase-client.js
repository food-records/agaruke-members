(async function () {
  const root = document.getElementById('members-purchase');
  const config = JSON.parse(document.getElementById('members-purchase-config').textContent);
  const message = document.getElementById('members-message');
  const actions = document.getElementById('members-actions');
  const key = 'agaruke-purchase-v2';
  const proofKey = 'agaruke-line-proof-v2';
  function invalidateDisplay(){try{sessionStorage.removeItem('agaruke-members-display-v3');}catch{}}
  let state = null;
  let lastCart = null;
  function say(text) { message.textContent = text; }
  async function cart() {
    const response = await fetch('/cart.js', {cache: 'no-store'});
    if (!response.ok) throw new Error('カートを確認できませんでした。');
    lastCart = await response.json();
    return lastCart.token.split('?')[0];
  }
  async function call(action, fields = {}) {
    const response = await fetch(config.path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action, ...fields})});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '処理できませんでした。LINE認証からやり直してください。');
    return data;
  }
  function el(tag, className='', text='') {
    const node=document.createElement(tag);node.className=className;if(text)node.textContent=text;return node;
  }
  function button(text, fn, parent=actions, secondary=false) {
    const b=el('button',secondary?'coupon-text-button':'coupon-button',text);b.type='button';
    b.addEventListener('click',async()=>{
      for(const control of root.querySelectorAll('button'))control.disabled=true;
      try{await fn()}catch(e){say(e.message||'処理できませんでした。')}
      finally{for(const control of root.querySelectorAll('button'))control.disabled=control.dataset.locked==='true';}
    });parent.append(b);return b;
  }
  async function couponSelect(code,title='') {
    if(!window.agarukeCoupons)await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('クーポン欄を読み込めませんでした。ページを再読み込みしてください。')),5000);
      window.addEventListener('agaruke:coupons-ready',()=>{clearTimeout(timer);resolve()},{once:true});
    });
    return window.agarukeCoupons.select(code,title);
  }
  let currentTitle, currentBadge, currentHelp, clearButton;
  let choices=[];
  function syncSelection(){
    const api=window.agarukeCoupons;if(!api)return;
    const selected=api.current();
    if(currentTitle){
    currentTitle.textContent=selected?.selected?selected.title:'クーポンは選択されていません';
    currentBadge.textContent=selected?.selected?(selected.applicable?'適用中':'条件未達'):'未選択';
    currentBadge.dataset.state=selected?.selected?(selected.applicable?'applied':'unmet'):'none';
    currentHelp.textContent=selected?.selected?(selected.applicable?'このクーポンでお買い物できます。':'商品合計などの利用条件をご確認ください。'):'下の一覧から使うクーポンを選んでください。';
    clearButton.hidden=!selected?.selected;
    }
    for(const choice of choices){
      const active=api.isSelected(choice.code);choice.card.dataset.selected=String(active);
      choice.button.textContent=active?'選択中':'このクーポンを使う';choice.button.disabled=active;choice.button.dataset.locked=String(active);
      choice.badge.hidden=!active;if(choice.clear)choice.clear.hidden=!active;
    }
  }
  window.addEventListener('agaruke:coupon-changed',syncSelection);
  window.addEventListener('agaruke:coupons-ready',syncSelection);
  function launchTicket(list){
    if(Date.now()>=Date.parse('2026-11-30T14:59:00Z'))return false;
    const card=el('article','coupon-ticket');const top=el('div','coupon-ticket-top');top.append(el('span','coupon-eyebrow','オープン記念クーポン'));
    const badge=el('span','coupon-badge','選択中');badge.hidden=true;top.append(badge);card.append(top);
    card.append(el('h3','coupon-current-title','AGARUKEオープン記念！500円OFF'));
    card.append(el('p','coupon-ticket-minimum','税込商品合計 3,800円以上'));
    card.append(el('p','coupon-muted','1人1回・2026年11月30日まで・ポイント消費なし'));
    const use=button('このクーポンを使う',async()=>{await couponSelect('AGARUKE500','AGARUKEオープン記念！500円OFF');say('AGARUKEオープン記念！500円OFFを選択しました。');},card);
    let clear;if(!state){clear=button('選択を解除する',async()=>{await couponSelect('');say('選択を解除しました。');},card,true);clear.hidden=true;}
    choices.push({code:'AGARUKE500',card,button:use,badge,clear});list.append(card);return true;
  }
  function guestOffers(){
    choices=[];const owned=el('section','coupon-owned');owned.append(el('h2','','お持ちのクーポン'));
    const list=el('div','coupon-ticket-grid');if(!launchTicket(list))return;
    owned.append(list,el('p','coupon-fine-print','LINE連携・Shopifyログイン不要。送料は利用条件に含まれません。他クーポンとの併用不可です。'));actions.append(owned);syncSelection();
  }
  function returnPath(){
    const path=new URLSearchParams(location.search||'').get('return_to')||'';
    return /^\/(collections|products|search)(\/|\?|$)/.test(path)&&!path.includes('\\')?path:'/collections/all';
  }
  async function refresh() {
    state=await call('status',{token:sessionStorage.getItem(key),cart:await cart()});
    invalidateDisplay();window.dispatchEvent(new Event('agaruke:members-authenticated'));
    const presentation={linked:true,ready:!state.completed&&lastCart?.item_count>0&&lastCart?.currency==='JPY',link_test_only:state.link_test_only,expected_points:state.link_test_only?0:100};
    window.agarukeMemberPresentation=presentation;window.dispatchEvent(new CustomEvent('agaruke:members-state',{detail:presentation}));
    actions.replaceChildren();choices=[];say('');
    const membership=el('div','coupon-membership');
    const balance=el('div');balance.append(el('span','coupon-balance-label','利用可能ポイント'),el('strong','coupon-balance',`${state.point.toLocaleString()} pt`));
    membership.append(balance,el('span','coupon-member-number',`会員番号 FR${String(state.member_number).padStart(6,'0')}`));actions.append(membership);
    const current=el('section','coupon-current');
    const currentHead=el('div','coupon-section-heading');currentHead.append(el('h2','','現在の選択'));currentBadge=el('span','coupon-badge','確認中');currentHead.append(currentBadge);current.append(currentHead);
    currentTitle=el('p','coupon-current-title','確認しています…');currentHelp=el('p','coupon-muted');current.append(currentTitle,currentHelp);
    clearButton=button('選択を解除する',async()=>{await couponSelect('');say('選択を解除しました。クーポンは未使用のまま残ります。');},current,true);clearButton.hidden=true;actions.append(current);
    const exchangeEnabled=state.coupon_exchange_enabled??!state.link_test_only;
    if(!state.completed){
      const owned=el('section','coupon-owned');owned.append(el('h2','','お持ちのクーポン'),el('p','coupon-muted','選択・解除でポイントが減ることはありません。'));
      const list=el('div','coupon-ticket-grid');let count=0;
      if(launchTicket(list))count++;
      for(const c of state.coupons||[]){
        const test=(state.test_coupon_ids||[]).includes(c.id);if(!exchangeEnabled&&!test)continue;
        if(!['available','pending'].includes(c.status))continue;count++;
        const card=el('article','coupon-ticket');
        const top=el('div','coupon-ticket-top');top.append(el('span','coupon-eyebrow',test?'テストクーポン':'ECポイント交換クーポン'));
        const badge=el('span','coupon-badge','選択中');badge.hidden=true;top.append(badge);card.append(top);
        const amount=el('p','coupon-ticket-amount');amount.append(el('strong','',c.cost.toLocaleString()),el('span','','円OFF'));card.append(amount);
        card.append(el('p','coupon-ticket-minimum',`税込商品合計 ${c.minimum.toLocaleString()}円以上`));
        if(c.expires_at){const date=new Date(c.expires_at);if(!Number.isNaN(date.getTime()))card.append(el('p','coupon-muted',`有効期限 ${date.toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo'})}`));}
        if(c.status==='pending'){
          card.append(el('p','coupon-muted','発行手続きが完了していません。追加のポイント消費はありません。'));
          button('発行を再開する',async()=>{await call('retry',{token:sessionStorage.getItem(key),cart:await cart(),coupon_id:c.id});await refresh();},card);
        }else{
          const title=test?'テスト 500円OFFクーポン':`EC ${c.cost.toLocaleString()}円OFFクーポン`;
          const use=button('このクーポンを使う',async()=>{await couponSelect(c.code,title);say(`${title}を選択しました。`);},card);
          choices.push({code:c.code,card,button:use,badge});
        }
        list.append(card);
      }
      if(!count)list.append(el('p','coupon-empty','お持ちのクーポンはありません。下のポイント交換から取得できます。'));
      owned.append(list,el('p','coupon-fine-print','送料は利用条件に含まれません。各クーポンは1回限り・他クーポンとの併用不可です。'));actions.append(owned);
    }
    if(exchangeEnabled&&!state.completed){
      const exchange=el('details','coupon-exchange');const summary=el('summary');summary.append(el('span','','ポイントでクーポンに交換'),el('span','coupon-expand','＋'));exchange.append(summary);
      exchange.append(el('p','coupon-muted','交換時にポイントを消費します。交換後の取り消しはできません。'));
      const tiers=el('div','coupon-tier-grid');
      for(const cost of [200,500,1000]){
        const tier=el('article','coupon-tier');tier.append(el('h3','',`${cost.toLocaleString()}円OFF`),el('p','coupon-muted',`税込商品合計 ${{200:3800,500:7000,1000:12000}[cost].toLocaleString()}円以上`));
        const enough=state.point>=cost;
        const exchangeButton=button(enough?`${cost.toLocaleString()}ptで交換`:`${cost.toLocaleString()}pt必要（残高不足）`,async()=>{
          if(!confirm(`${cost}ポイントを使って交換します。よろしいですか？`))return;
          const requestKey=`${key}-exchange-${cost}`;let requestId=sessionStorage.getItem(requestKey);
          if(!requestId){requestId=crypto.randomUUID();sessionStorage.setItem(requestKey,requestId);}
          await call('exchange',{token:sessionStorage.getItem(key),cart:await cart(),cost,request_id:requestId});
          sessionStorage.removeItem(requestKey);await refresh();say('クーポンを発行しました。「お持ちのクーポン」から選べます。');
        },tier);exchangeButton.disabled=!enough;exchangeButton.dataset.locked=String(!enough);tiers.append(tier);
      }
      exchange.append(tiers);actions.append(exchange);
    }
    const footer=el('nav','coupon-page-footer');const shop=el('a','coupon-button','お買い物を続ける');shop.href=returnPath();const cartLink=el('a','coupon-text-button','カートを確認する');cartLink.href='/cart';footer.append(shop,cartLink);actions.append(footer);
    if(state.link_test_only)actions.append(el('p','coupon-test-note',exchangeEnabled?'クーポン交換のテスト中です。購入ポイント付与は停止しています。':'連携試験中です。クーポン交換と購入ポイント付与は停止しています。'));
    const account=el('details','coupon-account');account.append(el('summary','','アカウント・認証について'),el('p','coupon-muted',state.permanent?'Shopifyアカウントと連携済みです。':'今回のお買い物にLINEポイントカードを設定しています。'));
    if(!state.permanent&&!state.completed){const login=el('a','coupon-text-button','Shopifyアカウントと連携する');login.href=`/customer_authentication/login?return_to=${encodeURIComponent(config.path)}`;account.append(login);}
    button('LINE認証をやり直す',start,account,true);actions.append(account);syncSelection();
  }
  async function start() {
    invalidateDisplay();
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const verifier = Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const challenge = Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join('');
    const data = await call('start', {challenge});
    localStorage.setItem(proofKey, JSON.stringify({verifier, token: data.token, at: Date.now()}));
    location.assign(data.liff_url);
  }
  try {
    const hash = new URLSearchParams(location.hash.slice(1));
    if (hash.has('grant') || hash.has('code')) {
      history.replaceState(null, '', location.pathname);
      const proof = JSON.parse(localStorage.getItem(proofKey) || 'null');
      if (!proof || proof.token !== hash.get('grant') || Date.now() - proof.at > 600000) throw new Error('認証を始めたブラウザでショップを開き、LINE認証をやり直してください。');
      const currentCart = await cart();
      const data = await call('consume', {token: proof.token, verifier: proof.verifier, code: hash.get('code'), cart: currentCart});
      sessionStorage.setItem(key, data.token); invalidateDisplay(); localStorage.removeItem(proofKey);
      const updated = await fetch('/cart/update.js', {method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({attributes: {_agaruke_purchase: data.token}})});
      if (!updated.ok) throw new Error('カートへの設定に失敗しました。LINE認証をやり直してください。');
    }
    if (sessionStorage.getItem(key)) await refresh();
    else { guestOffers();say('ポイント交換クーポンを使う場合は、LINEでポイントカードを確認してください。'); button('LINEでポイントカードを使う', start); }
  } catch (e) { say(e.message || '処理できませんでした。'); actions.replaceChildren();guestOffers();button('LINE認証を始める', start); }
})();
