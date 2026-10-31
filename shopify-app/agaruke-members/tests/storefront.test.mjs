import {test} from 'node:test';
import assert from 'node:assert/strict';
import {storefrontPresentation} from '../app/storefront.server.ts';
import {automaticDiscount,clearLegacyAnnotation,POINT_PROPERTY,DISPLAY_CACHE_KEY,DISPLAY_CACHE_TTL,cacheRecord,readDisplayCache} from '../theme-entry/assets/agaruke-members-status.js';
const cart={item_count:3,total_price:360000,currency:'JPY'};
test('cart benefits remain accurate while old scripts receive no checkout annotation amount',()=>{
 const state={linked:true,ready:true,permanent:true,coupons:[{status:'available',minimum:4000}]};
 const paused=storefrontPresentation(state,cart,true);assert.equal(paused.expected_points,0);assert.equal(paused.coupon_count,1);
 const live=storefrontPresentation(state,cart,false);assert.equal(live.expected_points,100);assert.equal(live.standard_points,0);assert.equal(live.checkout_annotation_enabled,false);
 assert.equal(storefrontPresentation(state,{...cart,item_count:0},false).expected_points,0);
 assert.equal(storefrontPresentation(state,{...cart,currency:'USD'},false).expected_points,0);
 assert.equal(storefrontPresentation({linked:false},cart,false).coupon_count,0);
});
test('legacy cleanup only empties the retired property, retaining gifts, quantity and other metadata',()=>{
 const before={items:[{key:'one',quantity:3,properties:{gift:'birthday',_private:'keep',[POINT_PROPERTY]:'100pt'}},{key:'two',quantity:2,properties:{engraving:'Keep this'}}]};
 const snapshot=structuredClone(before);const patch=clearLegacyAnnotation(before);
 assert.equal(patch.quantity,3);assert.deepEqual(patch.properties,{gift:'birthday',_private:'keep',[POINT_PROPERTY]:''});assert.deepEqual(before,snapshot);
 const applied=structuredClone(before);applied.items[0].properties=patch.properties;
 assert.equal(clearLegacyAnnotation(applied),null);
 assert.equal(clearLegacyAnnotation({items:[{key:'normal',quantity:8,properties:{gift:'no changes'}}]}),null);
});
test('display cache expires at five minutes and is invalid for another account or cart',()=>{
 const stored=new Map();const storage={getItem:k=>stored.get(k)||null};const state={linked:true,ready:true,expected_points:100,coupon_count:2,purchase_token:'never-cache-this',coupons:[{code:'never-cache-code'}]};
 const record=cacheRecord(state,'account-cart-A',1000);stored.set(DISPLAY_CACHE_KEY,JSON.stringify(record));
 assert.equal(readDisplayCache(storage,'account-cart-A',1001).linked,true);
 assert.equal(readDisplayCache(storage,'account-cart-B',1001),null);
 assert.equal(readDisplayCache(storage,'account-cart-A',1000+DISPLAY_CACHE_TTL),null);
 assert.equal(readDisplayCache(storage,'account-cart-A',999),null);
 assert.ok(!JSON.stringify(record).includes('never-cache'));
 stored.set(DISPLAY_CACHE_KEY,'broken json');assert.equal(readDisplayCache(storage,'account-cart-A',1001),null);
});
async function browserRun({key='scope',stored=new Map(),isCart=false,legacy=false,suffix='default'}={}) {
 const originals={document:globalThis.document,window:globalThis.window,sessionStorage:globalThis.sessionStorage,fetch:globalThis.fetch,location:globalThis.location};
 let requests=[];
 globalThis.document={documentElement:{dataset:{}},getElementById:()=>({textContent:JSON.stringify({path:'/apps/members',cache_key:key,customer_present:true,is_cart:isCart,legacy_note:legacy})}),querySelectorAll:()=>[],addEventListener:()=>{}};
 globalThis.window={Shopify:{routes:{root:'/'}},addEventListener:()=>{}};globalThis.location={pathname:isCart?'/cart':'/collections/all'};
 globalThis.sessionStorage={getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)};
 globalThis.fetch=async(url,options)=>{requests.push(url);if(url==='/cart.js')return Response.json({token:'cart-one',attributes:{_agaruke_purchase:'verified-cart-session'},item_count:1,total_price:120000,currency:'JPY',items:[{key:'item',quantity:1,properties:{}}]});assert.equal(url,'/apps/members');assert.equal(JSON.parse(options.body).token,'verified-cart-session');return Response.json({linked:true,ready:true,permanent:true,purchase_token:'',expected_points:0,link_test_only:true,coupon_count:0})};
 try {await import(`../theme-entry/assets/agaruke-members-status.js?${suffix}`);for(let i=0;i<30;i++)await new Promise(resolve=>setImmediate(resolve));return {stored,requests};}
 finally {for(const [name,value] of Object.entries(originals)){if(value===undefined)delete globalThis[name];else globalThis[name]=value;}}
}
test('normal page navigation uses cached display state without any network requests',async()=>{
 const first=await browserRun({suffix:'cache-first'});assert.equal(first.stored.get('agaruke-purchase-v2'),'verified-cart-session');assert.deepEqual(first.requests,['/cart.js','/apps/members']);
 const next=await browserRun({stored:first.stored,suffix:'cache-next'});assert.deepEqual(next.requests,[]);
});
test('cart entry revalidates the server despite a valid display cache',async()=>{
 const stored=new Map([[DISPLAY_CACHE_KEY,JSON.stringify(cacheRecord({linked:true,ready:true,expected_points:100},'scope'))]]);
 const result=await browserRun({stored,isCart:true,suffix:'cart-force'});assert.ok(result.requests.includes('/apps/members'));
});

test('test coupon visibility is limited to exact issued coupon while ordinary exchange stays paused',async()=>{
 const {isTestCoupon}=await import('../app/test-coupon.ts');
 const c={id:'test-500-3000-20261028',cost:500,minimum:3000,status:'available'};
 assert.equal(isTestCoupon(c),true);
 for(const bad of [{...c,id:'normal'},{...c,status:'pending'},{...c,minimum:7000}])assert.equal(isTestCoupon(bad),false);
 assert.equal(storefrontPresentation({linked:true,coupons:[c]},cart,true).test_coupon_count,1);
 assert.equal(storefrontPresentation({linked:false,coupons:[c]},cart,true).test_coupon_count,0);
});

test('automatic coupon sets only a verified test code on an empty discount selection',()=>{
 const code='AMTEST'+'A'.repeat(32);
 assert.deepEqual(automaticDiscount({},code),{discount:code});
 assert.equal(automaticDiscount({discount_codes:[{code,applicable:false}]},code),null);
 assert.equal(automaticDiscount({discount_codes:[{code:'OTHER'}]},code),null);
 assert.equal(automaticDiscount({cart_level_discount_applications:[{title:'automatic'}]},code),null);
 assert.equal(automaticDiscount({},'OTHER'),null);
 const state=storefrontPresentation({linked:true,ready:true,coupons:[{id:'test-500-3000-20261028',code,cost:500,minimum:3000,status:'available'}]},cart,true);
 assert.equal(state.automatic_coupon,code);
 assert.ok(!JSON.stringify(cacheRecord(state,'scope')).includes(code));
 assert.equal(storefrontPresentation({linked:false},cart,true).automatic_coupon,'');
});

test('identity cache survives cart changes without reusing purchase benefits',()=>{
 const record=cacheRecord({linked:true,ready:true,expected_points:100,coupon_count:2},'old-cart',1000,'same-person');
 const storage={getItem:()=>JSON.stringify(record)};
 const next=readDisplayCache(storage,'new-cart',1001,'same-person');
 assert.equal(next.linked,true);assert.equal(next.ready,false);assert.equal(next.expected_points,0);assert.equal(next.coupon_count,0);
 assert.equal(readDisplayCache(storage,'new-cart',1001,'another-person'),null);
 assert.equal(cacheRecord({ready:true},'key'),null);
 storage.getItem=()=>JSON.stringify({...record,state:{ready:true}});
 assert.equal(readDisplayCache(storage,'old-cart',1001,'same-person'),null);
});
