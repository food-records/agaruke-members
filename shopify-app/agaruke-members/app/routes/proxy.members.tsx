import type {ActionFunctionArgs, LoaderFunctionArgs} from 'react-router';
import {authenticate, unauthenticated} from '../shopify.server';
import {cartIdentity, proxyCustomer, purchaseCall} from '../purchase.server';
import {provisionPurchaseCoupon} from '../members.server';
import client from '../purchase-client.js?raw';

const headers = {'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer', 'X-Content-Type-Options':'nosniff'};
async function context(request: Request) {
  await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  if (url.searchParams.get('shop') !== process.env.SHOPIFY_SHOP_DOMAIN) throw new Response(null, {status:403});
  if (process.env.SHOPIFY_MEMBERS_ENABLED !== 'true') throw new Response(null, {status:503});
  const timestamp = Number(url.searchParams.get('timestamp'));
  if (!timestamp || Math.abs(Date.now()/1000-timestamp)>300) throw new Response(null,{status:403});
  return url;
}
export async function loader({request}: LoaderFunctionArgs) {
  const url = await context(request);
  const path = url.searchParams.get('path_prefix') || '/apps/members';
  if (!/^\/(apps|a|tools|community)\/[a-z0-9_-]+$/.test(path)) return new Response(null,{status:400});
  const config = JSON.stringify({path}).replace(/</g,'\\u003c');
  return new Response(`<section id="members-purchase" style="max-width:680px;margin:32px auto;padding:24px"><h1>LINEポイントカード</h1><p id="members-message" role="status">確認しています…</p><div id="members-actions" style="display:grid;gap:16px"></div></section><script id="members-purchase-config" type="application/json">${config}</script><script>{% raw %}${client}{% endraw %}</script>`,{headers:{...headers,'Content-Type':'application/liquid'}});
}
export async function action({request}: ActionFunctionArgs) {
  const url = await context(request);
  try {
    const origin = request.headers.get('Origin');
    if (origin && origin !== new URL(process.env.SHOPIFY_STOREFRONT_URL || '').origin && origin !== `https://${process.env.SHOPIFY_SHOP_DOMAIN}`) return new Response(null,{status:403});
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return new Response(null,{status:415});
    const raw = await request.text(); if(raw.length>4096)return new Response(null,{status:413});
    const body = JSON.parse(raw);
    if (body.action === 'start') return Response.json(await purchaseCall('start',{challenge:body.challenge}),{headers});
    const cart = cartIdentity(body.cart);
    if (body.action === 'consume') return Response.json(await purchaseCall('consume',{token:body.token,code:body.code,verifier:body.verifier,cart}),{headers});
    if (!['status','exchange','retry'].includes(body.action))return new Response(null,{status:400});
    const fields = {token:body.token,cart};
    let state = await purchaseCall('status',fields);
    const customer = proxyCustomer(url);
    if(customer && !state.completed) {await purchaseCall('bind',{...fields,customer});state = await purchaseCall('status',fields);}
    const testOnly = process.env.SHOPIFY_LINK_TEST_ONLY === 'true';
    if(body.action !== 'status') {
      if(testOnly)return Response.json({error:'連携試験中のため、クーポン交換は停止しています。'},{status:403,headers});
      const coupon = body.action === 'exchange' ? (await purchaseCall('exchange',{...fields,cost:body.cost,request_id:body.request_id})).coupon : state.coupons?.find((c:{id:string})=>c.id===body.coupon_id);
      if(!coupon)throw new Error('COUPON_NOT_FOUND');
      const {admin} = await unauthenticated.admin(process.env.SHOPIFY_SHOP_DOMAIN || '');
      await provisionPurchaseCoupon(coupon, fields, admin.graphql);
      state = await purchaseCall('status',fields);
    }
    return Response.json({...state,link_test_only:testOnly},{headers});
  } catch {return Response.json({error:'処理できませんでした。連携状態を確認するか、LINE認証をやり直してください。'},{status:400,headers});}
}
