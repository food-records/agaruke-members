import {test} from 'node:test';
import assert from 'node:assert/strict';
import {liffCall,liffCoupon,liffTiers,provisionLIFF} from '../app/liff.server.ts';
const coupon={id:'synthetic',code:'TESTCODE',cost:200,minimum:3800,status:'available',expires_at:'2027-01-01T00:00:00Z'};
test('three tiers and LINE handoff link keeps ticket identity and UTM; used/expired never get use link',()=>{
 assert.deepEqual(liffTiers.map(r=>[r.required_points,r.minimum]),[[200,3800],[500,7000],[1000,12000]]);
 const c=liffCoupon(coupon,'https://shop.agaruke.com');const u=new URL(c.use_url);assert.equal(u.pathname,'/apps/members');assert.equal(u.searchParams.get('entry'),'ticket');assert.equal(u.searchParams.get('coupon'),coupon.id);assert.equal(u.searchParams.get('utm_source'),'line');assert.ok(!u.href.includes(coupon.code));
 assert.equal(liffCoupon({...coupon,status:'used'},u.origin).use_url,undefined);
 assert.equal(liffCoupon({...coupon,expires_at:'2020-01-01'},u.origin).use_url,undefined);
 assert.match(liffCoupon({...coupon,login_required:true},u.origin).description,/ログイン/);
 assert.equal(c.code,undefined);
});
test('LINE identity crosses internal boundary only in bearer header with existing service auth',async()=>{
 process.env.MEMBERS_API_URL='https://members.example.test';process.env.MEMBERS_SERVICE_KEY='test-only';
 const old=globalThis.fetch;globalThis.fetch=async(url,options)=>{assert.equal(url,'https://members.example.test/shopify/liff/action');assert.equal(options.headers.Authorization,'Bearer synthetic-token');assert.equal(options.headers['X-Members-Service-Key'],'test-only');assert.deepEqual(JSON.parse(options.body),{action:'status'});return Response.json({message:'success',data:{point:100}})};
 try{assert.equal((await liffCall('synthetic-token','status')).point,100)}finally{globalThis.fetch=old}
});
test('retry reuses existing discount and activates only same LINE member context',async()=>{
 process.env.MEMBERS_API_URL='https://members.example.test';process.env.MEMBERS_SERVICE_KEY='test-only';
 const old=globalThis.fetch;let mutations=0,activated=0;
 globalThis.fetch=async(url,o)=>{activated++;assert.equal(o.headers.Authorization,'Bearer synthetic-token');assert.equal(JSON.parse(o.body).action,'activate');return Response.json({message:'success',data:{active:true}})};
 try{await provisionLIFF({...coupon,status:'pending'},'synthetic-token',async(q)=>{if(q.includes('mutation'))mutations++;return Response.json({data:{codeDiscountNodeByCode:{id:'gid://shopify/DiscountCodeNode/1'}}})});assert.equal(mutations,0);assert.equal(activated,1)}finally{globalThis.fetch=old}
});
