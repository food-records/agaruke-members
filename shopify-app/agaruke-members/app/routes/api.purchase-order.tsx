import type {ActionFunctionArgs, LoaderFunctionArgs} from 'react-router';
import {authenticate} from '../shopify.server';
import {customerContext} from '../members.server';
import {purchaseCall} from '../purchase.server';
export async function loader({request}:LoaderFunctionArgs){const {cors}=await authenticate.public.checkout(request);return cors(new Response(null,{status:204}));}
export async function action({request}:ActionFunctionArgs){
 const {cors,sessionToken}=await authenticate.public.checkout(request);
 const headers={'Cache-Control':'no-store'};
 if(process.env.SHOPIFY_MEMBERS_ENABLED!=='true')return cors(new Response(null,{status:503,headers}));
 try {
  if(!sessionToken.sub)return cors(Response.json({linked:false,guest:true},{headers}));
  const customer=customerContext(sessionToken,process.env.SHOPIFY_SHOP_DOMAIN||'',process.env.SHOPIFY_API_KEY||'');
  const raw=await request.text();if(raw.length>2048)return cors(new Response(null,{status:413,headers}));
  const b=JSON.parse(raw);const id=String(b.order_id||'').replace('gid://shopify/Order/','');
  if(!/^[1-9][0-9]*$/.test(id) || !/^[a-f0-9]{64}$/.test(b.token||''))throw new Error('INVALID_REQUEST');
  const data=await purchaseCall('bind_order',{token:b.token,order_id:id,customer});
  return cors(Response.json(data,{headers}));
 } catch {return cors(Response.json({error:'注文の確認中です。少し待って再確認してください。'},{status:409,headers}));}
}
