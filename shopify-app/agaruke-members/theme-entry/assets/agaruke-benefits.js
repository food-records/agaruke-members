export function benefitPoints(state,english=false) {
  if(!state?.linked)return english?'Link LINE before checkout to earn 100 points per order.':'購入前のLINE連携で、ご注文ごとに100pt';
  if(state.link_test_only)return english?'Purchase points are currently paused.':'購入ポイント付与は現在停止中です';
  if(state.ready&&state.expected_points===100)return english?'100 pt after payment':'支払い完了後に 100pt';
  return english?'100 points per order. Confirm your link in the cart.':'ご注文ごとに100pt。カートで連携状態をご確認ください';
}
export function couponChoices(state,now=Date.now()) {
  const choices=[];
  if(now<Date.parse('2026-11-30T14:59:00Z'))choices.push({code:'AGARUKE500',title:'公開記念 500円OFFクーポン',cost:500,minimum:3800,public:true});
  if(state?.linked)for(const c of state.coupons||[]) {
    if(typeof c.code!=='string'||!Number.isFinite(c.cost)||!Number.isFinite(c.minimum)||choices.some(x=>x.code===c.code))continue;
    if(c.expires_at&&Date.parse(c.expires_at)<=now)continue;
    choices.push({...c,title:`EC ${c.cost.toLocaleString()}円OFFクーポン`});
  }
  return choices;
}
if(typeof document!=='undefined')initialize();
function initialize(){
  const english=document.documentElement.lang.startsWith('en');
  const t=(ja,en)=>english?en:ja;
  let state=window.agarukeBenefitPresentation;
  const views=[];
  const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e;};
  function mount(){
  for(let i=views.length-1;i>=0;i--)if(!views[i].card.isConnected)views.splice(i,1);
  for(const card of document.querySelectorAll('[data-agaruke-member-card]')){
    if(card.dataset.benefitsMounted==='true')continue;
    card.dataset.benefitsMounted='true';
    card.removeAttribute('style');card.className='agaruke-benefits';
    const head=node('div','benefits-heading');head.append(node('h2','',t('お買い物の特典','Shopping benefits')),node('span','benefits-eyebrow','AGARUKE MEMBERS'));
    const points=node('section','benefits-points');points.append(node('span','benefits-label',t('購入ポイント','Purchase points')));const pointsText=node('p');points.append(pointsText);
    const current=node('section','benefits-current');const row=node('div','benefits-row');row.append(node('span','benefits-label',t('クーポン','Coupon')));const badge=node('span','coupon-badge');row.append(badge);const title=node('p','benefits-current-title');
    const clear=node('button','coupon-text-button',t('選択を解除','Remove coupon'));clear.type='button';
    const feedback=node('p','benefits-feedback');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
    current.append(row,title,clear);
    const details=node('details','benefits-choices');const summary=node('summary','',t('クーポンを選ぶ・変更する','Choose or change a coupon'));const list=node('div','benefits-list');details.append(summary,list);
    const foot=node('div','benefits-footer');const link=node('a','coupon-text-button',t('LINEで登録・連携する（任意）','Link LINE (optional)'));link.href='/apps/members';foot.append(link);
    card.replaceChildren(head,points,current,details,feedback,foot);
    const view={card,pointsText,badge,title,clear,list,link,feedback,choices:[]};views.push(view);
    details.addEventListener('toggle',()=>{if(details.open)window.dispatchEvent(new Event('agaruke:benefits-open'));});
    clear.addEventListener('click',()=>choose(view,''));
  }
  }
  async function choose(view,code,title=''){
    views.forEach(v=>v.card.setAttribute('aria-busy','true'));
    for(const v of views)for(const b of v.card.querySelectorAll('button'))b.disabled=true;
    view.feedback.textContent=t('更新しています…','Updating…');
    try {
      if(!window.agarukeCoupons)throw Error(t('読み込み中です。少し待ってからお試しください。','Please try again in a moment.'));
      await window.agarukeCoupons.select(code,title);
      view.feedback.textContent=code?t('クーポンを選択しました。適用状態をご確認ください。','Coupon selected. Check its status above.'):t('選択を解除しました。クーポンは未使用のままです。','Coupon removed. It remains unused.');
    }catch(e){view.feedback.textContent=e.message;}
    finally {views.forEach(v=>v.card.removeAttribute('aria-busy'));sync();}
  }
  function render(){
    mount();
    for(const v of views){
      v.pointsText.textContent=benefitPoints(state,english);
      v.link.textContent=state?.linked?t('ポイント交換・会員ページ','Points and member page'):t('LINEで登録・連携する（任意）','Link LINE (optional)');
      v.list.replaceChildren();v.choices=[];
      for(const c of couponChoices(state)){
        const row=node('article','benefits-ticket');const copy=node('div');copy.append(node('strong','',c.public?t('公開記念 500円OFF','Launch offer: ¥500 off'):t(`${c.cost.toLocaleString()}円OFF（交換済み）`,`¥${c.cost.toLocaleString()} off (redeemed)`)));
        copy.append(node('p','',t(`商品税込${c.minimum.toLocaleString()}円以上・併用不可`,`Items ¥${c.minimum.toLocaleString()} or more · Cannot combine`)));
        if(c.public)copy.append(node('p','',t('1人1回・11月30日まで・LINE連携不要','Once per customer · Ends Nov 30 · No LINE required')));
        else if(c.expires_at)copy.append(node('p','',t('期限 ','Expires ')+new Date(c.expires_at).toLocaleDateString(english?'en-GB':'ja-JP',{timeZone:'Asia/Tokyo'})));
        const button=node('button','coupon-button',t('選択する','Select'));button.type='button';button.addEventListener('click',()=>choose(v,c.code,c.title));row.append(copy,button);v.list.append(row);v.choices.push({code:c.code,button});
      }
      if(state?.linked&&!Array.isArray(state.coupons))v.list.append(node('p','coupon-muted',t('交換済みクーポンを確認しています…','Checking redeemed coupons…')));
      if(!v.choices.length)v.list.append(node('p','coupon-muted',t('利用できるクーポンはありません。','No coupons available.')));
      v.card.dataset.ready='true';
    }
    sync();
  }
  function sync(){
    const api=window.agarukeCoupons;const selected=api?.current();
    for(const v of views){
      v.title.textContent=selected?.selected?selected.title:t('クーポンは選択されていません','No coupon selected');
      v.badge.textContent=selected?.selected?(selected.applicable?t('適用中','Applied'):t('条件未達','Not applicable')):t('未選択','None');
      v.badge.dataset.state=selected?.selected?(selected.applicable?'applied':'unmet'):'none';
      v.clear.hidden=!selected?.selected;v.clear.disabled=false;
      for(const c of v.choices){const active=api?.isSelected(c.code);c.button.textContent=active?t('選択中','Selected'):t('選択する','Select');c.button.disabled=Boolean(active);}
    }
  }
  window.addEventListener('agaruke:benefits-state',e=>{state=e.detail;render();});
  window.addEventListener('agaruke:benefits-error',()=>{for(const v of views)v.feedback.textContent=t('連携・交換券の状態を確認できませんでした。ページを再読み込みしてください。','Unable to check your LINE link and redeemed coupons. Please reload.');});
  window.addEventListener('agaruke:coupon-changed',sync);
  window.addEventListener('agaruke:coupons-ready',sync);
  document.addEventListener('shopify:section:load',render);
  if(typeof subscribe==='function'&&typeof PUB_SUB_EVENTS!=='undefined')subscribe(PUB_SUB_EVENTS.cartUpdate,render);
  render();
}
