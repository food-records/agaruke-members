import type {ActionFunctionArgs,LoaderFunctionArgs} from 'react-router';
import {unauthenticated} from '../shopify.server';
import {couponExchangeEnabled} from '../runtime-mode';
import {liffCall,liffCoupon,liffTiers,provisionLIFF} from '../liff.server';

function cors(request:Request) {
 if(request.headers.get('Origin')!=='https://members.agaruke.com')throw new Response(null,{status:403});
 return {'Access-Control-Allow-Origin':'https://members.agaruke.com','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Vary':'Origin','Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
}
export async function loader({request}:LoaderFunctionArgs) {
 const headers=cors(request);
 return new Response(null,{status:request.method==='OPTIONS'?204:405,headers});
}
export async function action({request}:ActionFunctionArgs) {
 const headers=cors(request);
 if(process.env.SHOPIFY_MEMBERS_ENABLED!=='true')return new Response(null,{status:503,headers});
 try {
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return new Response(null,{status:415,headers});
  const token=request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/)?.[1];if(!token)return new Response(null,{status:401,headers});
  const raw=await request.text();if(raw.length>4096)return new Response(null,{status:413,headers});
  const b=JSON.parse(raw);if(!['status','exchange','retry'].includes(b.action))return new Response(null,{status:400,headers});
  if(b.action!=='status') {
   if(!couponExchangeEnabled())return new Response(null,{status:403,headers});
   let coupon;
   if(b.action==='exchange')coupon=(await liffCall(token,'exchange',{cost:b.cost,request_id:b.request_id})).coupon;
   else coupon=(await liffCall(token,'status')).coupons?.find((c:{id:string;retryable:boolean})=>c.id===b.coupon_id && c.retryable);
   if(!coupon)throw Error('COUPON_NOT_FOUND');
   const {admin}=await unauthenticated.admin(process.env.SHOPIFY_SHOP_DOMAIN || '');
   await provisionLIFF(coupon,token,admin.graphql);
  }
  const state=await liffCall(token,'status');
  return Response.json({point:state.point,coupons:state.coupons.map((c:Parameters<typeof liffCoupon>[0])=>liffCoupon(c,process.env.SHOPIFY_STOREFRONT_URL || '')),rewards:couponExchangeEnabled()?liffTiers:[]},{headers});
 }catch{return Response.json({error:'取得・交換できませんでした。再読込してください。交換処理中の券は「発行を再開」から再開でき、ポイントは重複消費しません。'},{status:400,headers});}
}
