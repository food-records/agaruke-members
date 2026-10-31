import {test} from 'node:test';
import assert from 'node:assert/strict';
import {customerContext, discountInput, provisionCoupon} from '../app/members.server.ts';
const shop='stxmu0-ef.myshopify.com';
test('Shopify signed context still requires the correct audience, shop and logged-in customer',()=>{
 const good={sub:'gid://shopify/Customer/123',dest:shop,aud:'test-app'};
 assert.equal(customerContext(good,shop,'test-app'),'123');
 for(const bad of [{...good,sub:undefined},{...good,sub:'123'},{...good,dest:'foreign.myshopify.com'},{...good,aud:'another-app'}]) assert.throws(()=>customerContext(bad,shop,'test-app'));
});
const coupon={id:'test-coupon',code:'AMTEST',cost:200,minimum:4000,status:'pending',expires_at:'2027-01-01T00:00:00Z'};
test('discount is one-use, customer-restricted, has the correct threshold and cannot combine',()=>{
 const input=discountInput(coupon,'123');
 assert.deepEqual(input.context,{customers:{add:['gid://shopify/Customer/123']}});
 assert.equal(input.title,'EC 200円OFFクーポン（商品合計4,000円以上）');assert.equal(input.usageLimit,1);assert.equal(input.customerGets.value.discountAmount.amount,'200');
 assert.equal(input.minimumRequirement.subtotal.greaterThanOrEqualToSubtotal,'4000');
 assert.deepEqual(input.combinesWith,{orderDiscounts:false,productDiscounts:false,shippingDiscounts:false});
});
test('retry finds an already-created code and activates the same coupon without a second mutation',async()=>{
 process.env.MEMBERS_API_URL='https://members.example.test';process.env.MEMBERS_SERVICE_KEY='test-only';
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'https://members.example.test/shopify/customer/action');const b=JSON.parse(options.body);assert.equal(b.action,'activate');assert.equal(b.code,coupon.code);assert.equal(b.customer,'123');return Response.json({message:'success',data:{active:true}})};
 try {await provisionCoupon(coupon,'123',async(query)=>{assert.match(query,/query FindMembersDiscount/);return Response.json({data:{codeDiscountNodeByCode:{id:'gid://shopify/DiscountCodeNode/1'}}})});assert.equal(calls,1)} finally {globalThis.fetch=original}
});
test('failed Admin mutation leaves the deducted coupon pending for recovery',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('must not activate')};
 try {await assert.rejects(()=>provisionCoupon(coupon,'123',async(query)=>Response.json(query.includes('mutation')?{data:{discountCodeBasicCreate:{userErrors:[{message:'failed'}]}}}:{data:{codeDiscountNodeByCode:null}})),/DISCOUNT_CREATE_FAILED/)}finally{globalThis.fetch=original}
});

test('OAuth session ciphertext survives reload and detects tampering or the wrong shop',async()=>{
 const {Session}=await import('@shopify/shopify-api');
 const {sealSession,openSession}=await import('../app/session-storage.server.ts');
 process.env.SHOPIFY_SESSION_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64');
 const session=new Session({id:'offline_test',shop,state:'test-state',isOnline:false,accessToken:'test-secret-token',scope:'read_orders',expires:new Date('2027-01-01T00:00:00Z'),refreshToken:'test-refresh-token',refreshTokenExpires:new Date('2027-02-01T00:00:00Z')});
 const sealed=sealSession(session);assert.ok(!sealed.includes('test-secret-token'));
 const loaded=openSession(sealed,shop);assert.equal(loaded.accessToken,'test-secret-token');assert.equal(loaded.refreshToken,'test-refresh-token');assert.equal(loaded.expires.toISOString(),session.expires.toISOString());
 assert.throws(()=>openSession(sealed,'foreign.myshopify.com'));
 const changed=Buffer.from(sealed,'base64');changed[30]^=1;assert.throws(()=>openSession(changed.toString('base64'),shop));
});

test('guest coupon keeps one use and threshold without requiring a Shopify customer',()=>{
 const input=discountInput(coupon,'');assert.deepEqual(input.context,{all:'ALL'});assert.equal(input.usageLimit,1);assert.equal(input.minimumRequirement.subtotal.greaterThanOrEqualToSubtotal,'4000');
});
test('cart identity strips private cart key and rejects arbitrary object input',async()=>{
 const {cartIdentity,proxyCustomer}=await import('../app/purchase.server.ts');
 assert.equal(cartIdentity('cart123?key=private'),'cart123');assert.throws(()=>cartIdentity({token:'anything'}));
 assert.equal(proxyCustomer(new URL('https://app.test?logged_in_customer_id=123')),'123');assert.throws(()=>proxyCustomer(new URL('https://app.test?logged_in_customer_id=abc')));
});


test('exchange testing opens independently while paid/refund processing stays paused',async()=>{
 const {couponExchangeEnabled}=await import('../app/runtime-mode.ts');
 assert.equal(couponExchangeEnabled({SHOPIFY_LINK_TEST_ONLY:'true'}),false);
 assert.equal(couponExchangeEnabled({SHOPIFY_LINK_TEST_ONLY:'true',SHOPIFY_COUPON_EXCHANGE_ENABLED:'false'}),false);
 const env={SHOPIFY_LINK_TEST_ONLY:'true',SHOPIFY_COUPON_EXCHANGE_ENABLED:'true'};
 assert.equal(couponExchangeEnabled(env),true);
 assert.equal(env.SHOPIFY_LINK_TEST_ONLY,'true');
 assert.equal(couponExchangeEnabled({SHOPIFY_LINK_TEST_ONLY:'false'}),true);
});

test('coupon UI groups selection, owned tickets and optional exchange; insufficient points stay disabled',async()=>{
 const {readFile}=await import('node:fs/promises');const {runInNewContext}=await import('node:vm');
 const source=await readFile(new URL('../app/purchase-client.js',import.meta.url),'utf8');
 const created=[];
 function element(tag){const node={tag,className:'',textContent:'',dataset:{},children:[],append(...items){this.children.push(...items)},replaceChildren(){this.children=[]},addEventListener(){}};created.push(node);return node;}
 const actions=element('div');const message=element('p');const root={querySelectorAll:()=>created.filter(n=>n.tag==='button')};
 const document={getElementById:id=>id==='members-purchase-config'?{textContent:'{"path":"/apps/members"}'}:id==='members-actions'?actions:id==='members-message'?message:root,createElement:element};
 const state={member_number:1,point:800,permanent:true,link_test_only:true,coupon_exchange_enabled:true,coupons:[{id:'normal',status:'available',cost:200,minimum:3800,code:'test-only-code'}]};
 const storage={getItem:()=> 'test-session',removeItem(){}};
 await runInNewContext(source,{URLSearchParams,document,sessionStorage:storage,window:{dispatchEvent(){},addEventListener(){}},Event:class{},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail}},location:{hash:'',search:'?return_to=%2Fsearch%3Fq%3Dcurry'},fetch:async url=>Response.json(url==='/cart.js'?{token:'cart'}:state)});
 const labels=created.map(n=>n.textContent||'').join(' ');
 for(const text of ['現在の選択','お持ちのクーポン','ポイントでクーポンに交換','このクーポンを使う','選択を解除する','LINE連携を解除する','税込商品合計 3,800円以上'])assert.ok(labels.includes(text),text);
 const details=created.find(n=>n.className==='coupon-exchange');assert.equal(details.tag,'details');assert.equal(details.open,undefined);
 const insufficient=created.find(n=>n.textContent==='1,000pt必要（残高不足）');assert.equal(insufficient.disabled,true);assert.equal(insufficient.dataset.locked,'true');
 assert.equal(created.find(n=>n.textContent==='お買い物を続ける').href,'/search?q=curry');
 assert.ok(labels.includes('購入ポイント付与は停止'));assert.equal(message.textContent,'');
});
