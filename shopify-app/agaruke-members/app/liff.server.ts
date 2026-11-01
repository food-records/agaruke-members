import {provision, type Coupon} from './members.server.ts';

export async function liffCall(token:string, action:string, fields:Record<string,unknown>={}) {
 const endpoint=new URL(process.env.MEMBERS_API_URL || '');
 if(endpoint.protocol!=='https:' && !(process.env.NODE_ENV==='test' && endpoint.hostname==='127.0.0.1'))throw Error('HTTPS_REQUIRED');
 const key=process.env.MEMBERS_SERVICE_KEY;
 if(!key || !token || token.length>2048)throw Error('AUTH_REQUIRED');
 const response=await fetch(`${endpoint.origin}/shopify/liff/action`,{method:'POST',signal:AbortSignal.timeout(35000),headers:{'Content-Type':'application/json','X-Members-Service-Key':key,'Authorization':`Bearer ${token}`},body:JSON.stringify({...fields,action})});
 const body=await response.json();
 if(!response.ok || body.message!=='success')throw Error('LIFF_REQUEST_FAILED');
 return body.data;
}
export const liffTiers=[200,500,1000].map((cost,i)=>({id:`ec-${cost}`,title:`AGARUKE ${cost.toLocaleString('ja-JP')}円OFF`,required_points:cost,minimum:[3800,7000,12000][i],channel:'shopify',description:`商品合計税込${[3800,7000,12000][i].toLocaleString('ja-JP')}円以上で利用可。送料別・1回限り・併用不可。有効期限は交換から3か月。`}));
export function liffCoupon(c:Coupon & {login_required?:boolean;retryable?:boolean},origin:string) {
 const shop=new URL(origin);
 if(shop.protocol!=='https:' || shop.username || shop.password)throw Error('STORE_NOT_CONFIGURED');
 const available=c.status==='available' && new Date(c.expires_at).getTime()>Date.now();
 const redirect='/?utm_source=line&utm_medium=pointcard&utm_campaign=point_exchange';
 const use=new URL(`/discount/${encodeURIComponent(c.code)}`,shop.origin);use.searchParams.set('redirect',redirect);
 return {id:c.id,channel:'shopify',title:`AGARUKE ${c.cost.toLocaleString('ja-JP')}円OFF`,discount_label:`${c.cost.toLocaleString('ja-JP')}円OFF`,description:`AGARUKE通販専用。商品合計税込${c.minimum.toLocaleString('ja-JP')}円以上、送料別・他クーポン併用不可。${c.login_required?'発行時のShopifyアカウントでログインしてください。':''}`,expires_at:c.expires_at,status:c.status,used:c.status==='used',retryable:!!c.retryable,use_url:available?use.href:undefined};
}
export async function provisionLIFF(c:Coupon,token:string,graphql:Parameters<typeof provision>[2]) {
 await provision(c,'',graphql,(code,id)=>liffCall(token,'activate',{code,discount_id:id}));
}
