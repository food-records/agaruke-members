import {test} from 'node:test';
import assert from 'node:assert/strict';
import {launchCouponStatus} from '../app/public-coupon.server.ts';
import {createLaunchCouponState,launchRemoval} from '../theme-entry/assets/agaruke-launch-coupon.js';
const now=Date.parse('2026-11-01T00:00:00Z');
const order=(overrides={})=>({customer:{id:'gid://shopify/Customer/123'},discountCodes:['AGARUKE500'],cancelledAt:null,displayFinancialStatus:'PAID',...overrides});
const graphql=nodes=>async()=>Response.json({data:{orders:{nodes,pageInfo:{hasNextPage:false}}}});
test('usage query is scoped to the authenticated customer and the public code and returns no order data',async()=>{
 let variables;
 const status=await launchCouponStatus('123',async(query,options)=>{variables=options.variables;return graphql([order()])();},now);
 assert.equal(status,'used');assert.match(variables.query,/customer_id:123 discount_code:AGARUKE500 status:any/);
 assert.equal(await launchCouponStatus('',()=>assert.fail('guest must not query orders'),now),'guest');
 assert.equal(await launchCouponStatus('123 OR *',()=>assert.fail('invalid customer must not query'),now),'unknown');
 assert.equal(await launchCouponStatus('123',()=>assert.fail('expired campaign must not query'),Date.parse('2026-12-01')),'expired');
});
test('uncertain and unrelated history never falsely marks a customer as used',async()=>{
 assert.equal(await launchCouponStatus('123',graphql([]),now),'not_used');
 assert.equal(await launchCouponStatus('123',graphql([order({cancelledAt:'2026-10-31T10:00:00Z'})]),now),'used');
 for(const value of [order({cancelledAt:'2026-10-31T10:00:00Z',displayFinancialStatus:'VOIDED'}),order({displayFinancialStatus:'REFUNDED'}),order({displayFinancialStatus:'PENDING'}),order({customer:{id:'gid://shopify/Customer/456'}}),order({discountCodes:['OTHER']})])assert.equal(await launchCouponStatus('123',graphql([value]),now),'unknown');
 assert.equal(await launchCouponStatus('123',graphql([order({cancelledAt:'2026-10-31T10:00:00Z'}),order()]),now),'used');
 assert.equal(await launchCouponStatus('123',async()=>Response.json({errors:[{message:'access denied'}]}),now),'unknown');
 assert.equal(await launchCouponStatus('123',async()=>{throw Error('timeout')},now),'unknown');
});
test('concurrent checks share one request and an old account response cannot replace a newer check',async()=>{
 let finish,calls=0;const states=[];
 const guard=createLaunchCouponState({lookup:()=>{calls++;return new Promise(r=>finish=r)},onChange:s=>states.push(s)});
 const first=guard.check(),second=guard.check();assert.equal(calls,1);finish('used');assert.deepEqual(await Promise.all([first,second]),['used','used']);
 const requests=[];const current=createLaunchCouponState({lookup:()=>new Promise(r=>requests.push(r))});
 const old=current.check();current.invalidate();const fresh=current.check();requests[1]('not_used');assert.equal(await fresh,'not_used');requests[0]('used');
 await Promise.resolve();assert.equal(requests.length,3);requests[2]('not_used');assert.equal(await old,'not_used');assert.equal(current.current(),'not_used');
 assert.ok(states.includes('checking'));
});
test('usage failure remains unknown and automatic removal preserves unrelated discounts and purchase identity',async()=>{
 const guard=createLaunchCouponState({lookup:async()=>{throw Error('offline')}});assert.equal(await guard.check(),'unknown');
 const patch=launchRemoval({discount_codes:[{code:'agaruke500'},{code:'AM'+'a'.repeat(64)}],attributes:{_agaruke_purchase:'private'}});
 assert.equal(patch.discount,'AM'+'a'.repeat(64));assert.equal(patch.attributes._agaruke_purchase,undefined);assert.equal(patch.items,undefined);
 assert.deepEqual(Object.keys(patch).sort(),['attributes','discount']);
 assert.equal(launchRemoval({discount_codes:[{code:'OTHER'}]}),null);
});
