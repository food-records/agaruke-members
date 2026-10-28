(async function () {
  const root = document.getElementById('members-purchase');
  const config = JSON.parse(document.getElementById('members-purchase-config').textContent);
  const message = document.getElementById('members-message');
  const actions = document.getElementById('members-actions');
  const key = 'agaruke-purchase-v2';
  const proofKey = 'agaruke-line-proof-v2';
  function invalidateDisplay(){try{sessionStorage.removeItem('agaruke-members-display-v3');}catch{}}
  let state = null;
  function say(text) { message.textContent = text; }
  async function cart() {
    const response = await fetch('/cart.js', {cache: 'no-store'});
    if (!response.ok) throw new Error('カートを確認できませんでした。');
    return (await response.json()).token.split('?')[0];
  }
  async function call(action, fields = {}) {
    const response = await fetch(config.path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action, ...fields})});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '処理できませんでした。LINE認証からやり直してください。');
    return data;
  }
  function button(text, fn) {
    const b = document.createElement('button'); b.className = 'button'; b.type = 'button'; b.textContent = text;
    b.addEventListener('click', async () => {
      for (const el of root.querySelectorAll('button')) el.disabled = true;
      try { await fn(); } catch (e) { say(e.message || '処理できませんでした。'); }
      finally { for (const el of root.querySelectorAll('button')) el.disabled = false; }
    }); actions.append(b);
  }
  async function refresh() {
    state = await call('status', {token: sessionStorage.getItem(key), cart: await cart()});
    invalidateDisplay(); window.dispatchEvent(new Event('agaruke:members-authenticated'));
    actions.replaceChildren();
    say(`会員番号 FR${String(state.member_number).padStart(6, '0')} ／ ${state.point}ポイント。${state.permanent ? 'Shopifyアカウントと連携済みです。' : '今回のお買い物にポイントカードを設定しました。'}`);
    if (state.link_test_only) {
      const p = document.createElement('p'); p.textContent = '連携試験中です。クーポン交換と購入ポイント付与はまだ開始していません。'; actions.append(p);
    } else if (!state.completed) {
      for (const cost of [200, 500, 1000]) {
        button(`${cost}ptで${cost}円券に交換（商品小計${{200:4000,500:7000,1000:12000}[cost].toLocaleString()}円以上）`, async () => {
          if (!confirm(`${cost}ポイントを使って交換します。よろしいですか？`)) return;
          const requestKey = `${key}-exchange-${cost}`;
          let requestId = sessionStorage.getItem(requestKey);
          if (!requestId) { requestId = crypto.randomUUID(); sessionStorage.setItem(requestKey, requestId); }
          await call('exchange', {token: sessionStorage.getItem(key), cart: await cart(), cost, request_id: requestId});
          sessionStorage.removeItem(requestKey); await refresh();
        });
      }
      for (const c of state.coupons || []) {
        if (c.status === 'pending') button(`${c.cost}円券の発行を再開`, async () => { await call('retry', {token: sessionStorage.getItem(key), cart: await cart(), coupon_id: c.id}); await refresh(); });
        else if (c.status === 'available') {
          const note = document.createElement('p'); note.textContent = 'クーポンは一回限りです。コード・適用URLを他の人へ共有しないでください。'; actions.append(note);
          const a = document.createElement('a'); a.className = 'button'; a.textContent = `${c.cost}円券を適用してカートへ`;
          a.href = `/discount/${encodeURIComponent(c.code)}?redirect=%2Fcart`; actions.append(a);
        }
      }
    }
    if (!state.permanent && !state.completed) {
      const login = document.createElement('a'); login.className = 'button button--secondary'; login.textContent = 'Shopifyにログインして購入';
      login.href = `/customer_authentication/login?return_to=${encodeURIComponent(config.path)}`; actions.append(login);
    }
    const guest = document.createElement('a'); guest.className = 'button button--secondary'; guest.textContent = state.permanent ? 'お買い物に戻る' : 'ログインせずお買い物を続ける'; guest.href = '/cart'; actions.append(guest);
    button('LINE認証をやり直す', start);
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
    else { say('LINEでポイントカードを確認します。Shopifyへのログインは、後から選べます。'); button('LINEでポイントカードを使う', start); }
  } catch (e) { say(e.message || '処理できませんでした。'); actions.replaceChildren(); button('LINE認証を始める', start); }
})();
