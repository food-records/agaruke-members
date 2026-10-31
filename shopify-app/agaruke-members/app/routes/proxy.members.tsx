import type {ActionFunctionArgs, LoaderFunctionArgs} from 'react-router';
import {authenticate, unauthenticated} from '../shopify.server';
import {cartIdentity, proxyCustomer, purchaseCall} from '../purchase.server';
import {membersCall, provisionPurchaseCoupon} from '../members.server';
import {storefrontPresentation} from '../storefront.server';
import {couponExchangeEnabled} from '../runtime-mode';
import {isTestCoupon} from '../test-coupon';
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
  const config = JSON.stringify({path,customer_authenticated:!!proxyCustomer(url)}).replace(/</g,'\\u003c');
  return new Response(`<section id="members-purchase" class="members-coupons-page"><header class="coupon-page-heading"><p class="coupon-eyebrow">AGARUKE MEMBERS</p><h1>クーポンを選ぶ</h1><p>お持ちのクーポンを、このお買い物に使えます。</p></header><p id="members-message" class="coupon-feedback" role="status" aria-live="polite">確認しています…</p><div id="members-actions"></div></section><script id="members-purchase-config" type="application/json">${config}</script><script>{% raw %}${client}{% endraw %}</script>`,{headers:{...headers,'Content-Type':'application/liquid'}});
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
    if(body.action==='storefront_status') {
      const customer=proxyCustomer(url);
      const cartData={item_count:Number(body.item_count),total_price:Number(body.total_price),currency:String(body.currency)};
      if(!Number.isInteger(cartData.item_count)||cartData.item_count<0||!Number.isFinite(cartData.total_price)||cartData.total_price<0)throw new Error('INVALID_CART');
      const state=await purchaseCall('storefront_status',{token:body.token,cart,customer,resume:body.resume===true&&cartData.item_count>0});
      return Response.json(storefrontPresentation(state,cartData,process.env.SHOPIFY_LINK_TEST_ONLY==='true'),{headers});
    }
    if(body.action==='unlink') {
      if(body.confirm!==true)return new Response(null,{status:400,headers});
      try {if(body.account_only===true){const customer=proxyCustomer(url);if(!customer)throw Error('LOGIN_REQUIRED');return Response.json(await membersCall(customer,'unlink',{confirm:true,link_hint:body.link_hint}),{headers});}return Response.json(await purchaseCall('unlink',{token:body.token,cart,customer:proxyCustomer(url),confirm:true}),{headers});}
      catch {return Response.json({error:'解除できませんでした。Shopifyとの継続連携がある場合は、該当アカウントでログインして再度お試しください。'},{status:400,headers});}
    }
    if (body.action === 'consume') return Response.json(await purchaseCall('consume',{token:body.token,code:body.code,verifier:body.verifier,cart}),{headers});
    if (!['status','exchange','retry'].includes(body.action))return new Response(null,{status:400});
    const fields = {token:body.token,cart};
    const customer = proxyCustomer(url);
    let state;
    try {state=await purchaseCall('status',fields);}catch(error){
      if(body.action!=='status'||!customer)throw error;
      const account=await membersCall(customer,'account_status');
      return Response.json({...account,permanent:true,completed:true,account_only:true,link_test_only:process.env.SHOPIFY_LINK_TEST_ONLY==='true',coupon_exchange_enabled:couponExchangeEnabled()},{headers});
    }
    if(customer && !state.completed) {await purchaseCall('bind',{...fields,customer});state = await purchaseCall('status',fields);}
    const testOnly = process.env.SHOPIFY_LINK_TEST_ONLY === 'true';
    if(body.action !== 'status') {
      if(!couponExchangeEnabled())return Response.json({error:'連携試験中のため、クーポン交換は停止しています。'},{status:403,headers});
      const coupon = body.action === 'exchange' ? (await purchaseCall('exchange',{...fields,cost:body.cost,request_id:body.request_id})).coupon : state.coupons?.find((c:{id:string})=>c.id===body.coupon_id);
      if(!coupon)throw new Error('COUPON_NOT_FOUND');
      const {admin} = await unauthenticated.admin(process.env.SHOPIFY_SHOP_DOMAIN || '');
      await provisionPurchaseCoupon(coupon, fields, admin.graphql);
      state = await purchaseCall('status',fields);
    }
    return Response.json({...state,link_test_only:testOnly,coupon_exchange_enabled:couponExchangeEnabled(),test_coupon_ids:(state.coupons||[]).filter(isTestCoupon).map((c:{id:string})=>c.id)},{headers});
  } catch {return Response.json({error:'処理できませんでした。連携状態を確認するか、LINE認証をやり直してください。'},{status:400,headers});}
}
