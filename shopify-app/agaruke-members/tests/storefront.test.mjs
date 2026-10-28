import {test} from 'node:test';
import assert from 'node:assert/strict';
import {storefrontPresentation} from '../app/storefront.server.ts';
import {annotationChange,pointNotice,POINT_PROPERTY} from '../theme-entry/assets/agaruke-members-status.js';
const cart={item_count:3,total_price:360000,currency:'JPY'};
test('linked cart shows an honest zero during tests and 100 only when awards are enabled',()=>{
 const state={linked:true,ready:true,permanent:true,coupons:[{status:'available',minimum:4000}]};
 const paused=storefrontPresentation(state,cart,true);assert.equal(paused.expected_points,0);assert.match(pointNotice(paused),/0pt.*試験中/);assert.equal(paused.coupon_count,1);
 const live=storefrontPresentation(state,cart,false);assert.equal(live.expected_points,100);assert.match(pointNotice(live),/^100pt/);
 assert.equal(storefrontPresentation(state,{...cart,item_count:0},false).expected_points,0);
 assert.equal(storefrontPresentation(state,{...cart,currency:'USD'},false).expected_points,0);
 assert.equal(storefrontPresentation({linked:false},cart,false).coupon_count,0);
 assert.equal(pointNotice(storefrontPresentation({linked:false},cart,false)),'');
});
test('checkout note annotates the whole order once, preserving quantities, gifts and private properties',()=>{
 const before={items:[{key:'line-one',quantity:3,properties:{gift:'birthday',_private:'keep'}},{key:'line-two',quantity:2,properties:{engraving:'Keep this'}}]};
 const snapshot=structuredClone(before);const patch=annotationChange(before,'100pt');
 assert.equal(patch.quantity,3);assert.deepEqual(patch.properties,{gift:'birthday',_private:'keep',[POINT_PROPERTY]:'100pt'});assert.deepEqual(before,snapshot);
 const applied=structuredClone(before);applied.items[0].properties=patch.properties;
 assert.equal(annotationChange(applied,'100pt'),null);
 const clear=annotationChange(applied,'');assert.equal(clear.properties.gift,'birthday');assert.equal(clear.properties[POINT_PROPERTY],'');assert.equal(clear.quantity,3);
 applied.items[1].properties[POINT_PROPERTY]='stale';const second=annotationChange(applied,'100pt');assert.equal(second.id,'line-two');assert.equal(second.properties.engraving,'Keep this');assert.equal(second.properties[POINT_PROPERTY],'');
});

test('a new tab restores its validated cart session before opening the coupon page',async()=>{
 const originals={document:globalThis.document,window:globalThis.window,sessionStorage:globalThis.sessionStorage,fetch:globalThis.fetch};
 const stored=new Map();let requests=0;
 globalThis.document={getElementById:()=>({textContent:JSON.stringify({path:'/apps/members',customer_present:true,is_cart:false})}),querySelectorAll:()=>[],addEventListener:()=>{}};
 globalThis.window={Shopify:{routes:{root:'/'}},addEventListener:()=>{}};
 globalThis.sessionStorage={getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)};
 globalThis.fetch=async(url,options)=>{requests++;if(url==='/cart.js')return Response.json({token:'cart-one',attributes:{_agaruke_purchase:'verified-cart-session'},item_count:1,total_price:120000,currency:'JPY'});assert.equal(url,'/apps/members');assert.equal(JSON.parse(options.body).token,'verified-cart-session');return Response.json({linked:true,ready:true,permanent:true,purchase_token:'',standard_points:100,expected_points:0,link_test_only:true,coupon_count:0})};
 try {
  await import('../theme-entry/assets/agaruke-members-status.js?new-tab-regression');
  for(let i=0;i<20&&!stored.has('agaruke-purchase-v2');i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(stored.get('agaruke-purchase-v2'),'verified-cart-session');assert.equal(requests,2);
 } finally {for(const [key,value] of Object.entries(originals)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
