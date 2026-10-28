import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';

export default function () { render(<Members />, document.body); }
interface Coupon {id: string; code: string; cost: number; minimum: number; status: string; expires_at: string}
interface State {link_test_only?: boolean; linked: boolean; point: number; member_number: string | number; coupons: Coupon[]; cart_url: string; storefront_url: string}
interface Intent {token: string; liff_url: string; expires_at: string}
function Members() {
  const [state, setState] = useState<State | null>(null);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [candidate, setCandidate] = useState<{ready: boolean; member_number: string | number} | null>(null);
  const [confirmationCode, setConfirmationCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tier, setTier] = useState<number | null>(null);
  const settings = shopify.settings.value;
  async function call(action: string, fields: Record<string, unknown> = {}) {
    const backend = String(settings.backend_url || '');
    if (!backend || !backend.startsWith('https://')) throw new Error('現在準備中です。時間をおいてお試しください。');
    const token = await shopify.sessionToken.get();
    const res = await fetch(backend.replace(/\/$/, '') + '/api/members', {
      method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
      body: JSON.stringify({action, ...fields}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '処理できませんでした。もう一度お試しください。');
    return data;
  }
  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : '処理できませんでした。'); } finally { setBusy(false); }
  }
  async function refresh() { setState(await call('status')); }
  useEffect(() => { run(async () => {
    await refresh();
    const saved = await shopify.storage.read<Intent>('members-link-intent');
    if (saved && new Date(saved.expires_at) > new Date()) setIntent(saved);
  }); }, []);
  async function start() {
    const next = await call('start');
    await shopify.storage.write('members-link-intent', next);
    setIntent(next); setCandidate(null);
  }
  async function confirm() {
    await call('confirm', {token: intent!.token, confirmation_code: confirmationCode});
    await shopify.storage.delete('members-link-intent');
    setIntent(null); setCandidate(null); await refresh();
  }
  async function exchange() {
    const key = 'members-exchange-' + tier;
    let id = await shopify.storage.read<string>(key);
    if (!id) { id = `${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`; await shopify.storage.write(key, id); }
    const next = await call('exchange', {cost: tier!, request_id: id});
    setState(next); setTier(null); await shopify.storage.delete(key);
  }
  return <s-page heading="LINEポイントカード">
    <s-stack gap="base">
      {error && <s-banner tone="critical">{error}</s-banner>}
      {!state && <s-text>連携状態を確認しています。</s-text>}
      {state && !state.linked && <s-section heading="購入前にポイントカードを連携">
        <s-stack gap="base">
          <s-text>{state.link_test_only ? "オンラインショップとLINEポイントカードの本人連携を確認します。" : "連携すると、今回のお買い物でクーポンを利用でき、支払完了後に100ptが貯まります。"}</s-text>
          {!intent && <s-button disabled={busy} onClick={() => run(start)}>LINEとの連携を始める</s-button>}
          {intent && <>
            <s-link href={intent.liff_url} target="_blank">LINEでポイントカードを確認する</s-link>
            <s-qr-code content={intent.liff_url} accessibilityLabel="LINE連携用QRコード" />
            <s-text>LINEで同意後、この画面に戻って確認してください。連携の有効時間は10分です。</s-text>
            <s-button disabled={busy} onClick={() => run(async () => setCandidate(await call('intent', {token: intent!.token})))}>LINEでの確認結果を表示</s-button>
            {candidate && !candidate.ready && <s-text>LINEでの同意をお待ちしています。</s-text>}
            {candidate?.ready && <>
              <s-text>連携する会員番号：{String(candidate.member_number)}。ご自身のカードと一致することを確認してください。</s-text>
              <s-text-field label="LINEに表示された8文字の確認コード" value={confirmationCode} onInput={event => setConfirmationCode((event.currentTarget as HTMLInputElement).value)} />
              <s-button disabled={busy || confirmationCode.trim().length !== 8} onClick={() => run(confirm)}>このポイントカードと連携する</s-button>
            </>}
            <s-button disabled={busy} onClick={() => run(start)}>連携をやり直す</s-button>
          </>}
        </s-stack>
      </s-section>}
      {state?.linked && <s-section heading="連携済み">
        <s-stack gap="base">
          <s-text>会員番号：{String(state.member_number)} ／ {state.point}pt</s-text>
          {state.link_test_only && <s-text>ポイントカードの連携が完了しました。現在は本人連携の結合試験中です。</s-text>}
          {!state.link_test_only && <>
          <s-text>EC専用クーポンです。店頭用クーポン・他の割引とは併用できません。条件額は税・送料を除く商品小計です。有効期限は交換から3か月です。</s-text>
          {[{cost:200,min:4000},{cost:500,min:7000},{cost:1000,min:12000}].map(t => <s-button key={t.cost} disabled={busy || state.point < t.cost} onClick={() => setTier(t.cost)}>{t.cost}pt → {t.min.toLocaleString()}円以上で{t.cost}円OFF</s-button>)}
          {tier && <s-box padding="base" border="base">
            <s-text>{tier}ptを使ってEC専用の{tier}円券に交換します。</s-text>
            <s-button disabled={busy} onClick={() => run(exchange)}>ポイントを使って交換する</s-button>
            <s-button disabled={busy} onClick={() => setTier(null)}>戻る</s-button>
          </s-box>}
          {(state.coupons || []).map(c => <s-box key={c.id} padding="base" border="base">
            <s-text>{c.minimum.toLocaleString()}円以上で{c.cost}円OFF ／ 期限 {new Date(c.expires_at).toLocaleDateString('ja-JP')}</s-text>
            {c.status === 'pending'
              ? <s-button disabled={busy} onClick={() => run(async () => { const next = await call('retry', {coupon_id:c.id}); await shopify.storage.delete('members-exchange-' + c.cost); setState(next); })}>発行を再開</s-button>
              : <s-link href={`${state.storefront_url}/discount/${encodeURIComponent(c.code)}?redirect=%2Fcart`}>このクーポンを適用してカートへ戻る</s-link>}
          </s-box>)}
          </>}
        </s-stack>
      </s-section>}
      <s-button disabled={busy} onClick={() => run(refresh)}>連携状態・残高を更新</s-button>
      {state?.cart_url && <s-link href={state.cart_url}>カートへ戻る</s-link>}
    </s-stack>
  </s-page>;
}
