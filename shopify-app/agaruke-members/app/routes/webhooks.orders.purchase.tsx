import type {ActionFunctionArgs} from 'react-router';
import {authenticate} from '../shopify.server';
export async function action({request}:ActionFunctionArgs){
 const raw=await request.clone().text();
 const {topic,shop}=await authenticate.webhook(request);
 if(shop!==process.env.SHOPIFY_SHOP_DOMAIN || !['ORDERS_CREATE','ORDERS_PAID'].includes(topic))return new Response(null,{status:403});
 if(process.env.SHOPIFY_MEMBERS_ENABLED!=='true')return new Response(null,{status:503});
 if(topic==='ORDERS_PAID' && process.env.SHOPIFY_LINK_TEST_ONLY==='true')return new Response(null,{status:200});
 try{
  const endpoint=new URL(process.env.MEMBERS_API_URL||'');if(endpoint.protocol!=='https:')throw new Error('HTTPS_REQUIRED');
  const response=await fetch(`${endpoint.origin}/shopify/webhooks/orders/${topic==='ORDERS_CREATE'?'create':'paid'}`,{method:'POST',signal:AbortSignal.timeout(12000),headers:{'Content-Type':'application/json','X-Shopify-Shop-Domain':shop,'X-Shopify-Topic':topic==='ORDERS_CREATE'?'orders/create':'orders/paid','X-Shopify-Hmac-Sha256':request.headers.get('X-Shopify-Hmac-Sha256')||''},body:raw});
  return new Response(null,{status:response.ok?200:503});
 }catch{return new Response(null,{status:503});}
}
