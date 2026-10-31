import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const source=await readFile(new URL('../app/purchase-client.js',import.meta.url),'utf8');
async function run({confirmed=true,privateSelected=false,serverFails=false,accountOnly=false}={}){
 const created=[],requests=[],removed=[],selected=[],events=[];
 function el(tag){const n={tag,dataset:{},children:[],textContent:'',append(...a){this.children.push(...a)},replaceChildren(){this.children=[]},addEventListener(type,fn){this[type]=fn;}};created.push(n);return n;}
 const actions=el('div'),message=el('p'),root={querySelectorAll:()=>created.filter(n=>n.tag==='button')};
 const document={createElement:el,getElementById:id=>id==='members-purchase-config'?{textContent:JSON.stringify({path:'/apps/members',customer_authenticated:accountOnly})}:id==='members-actions'?actions:id==='members-message'?message:root};
 const state={permanent:true,point:800,member_number:1,link_test_only:false,coupon_exchange_enabled:true,coupons:[],...(accountOnly?{account_only:true,completed:true,unlink_hint:"a".repeat(64)}:{})};
 const storage={getItem:()=>accountOnly?null:'session-proof',removeItem:k=>removed.push(k),setItem(){}};
 const window={addEventListener(){},dispatchEvent:e=>events.push(e.type),agarukeCoupons:{current:()=>({selected:false}),isSelected:()=>false,memberSelected:()=>privateSelected,select:async code=>selected.push(code)}};
 const fetch=async(url,opts)=>{const b=opts?.body?JSON.parse(opts.body):null;requests.push({url,b});if(url==='/cart.js')return Response.json({token:'cart-identity',item_count:3,currency:'JPY'});if(url==='/cart/update.js')return Response.json({});if(b.action==='unlink')return Response.json(serverFails?{error:'failed'}:{unlinked:true},{status:serverFails?400:200});return Response.json(state);};
 await runInNewContext(source,{URLSearchParams,document,window,sessionStorage:storage,localStorage:storage,Event:class{constructor(t){this.type=t}},CustomEvent:class{constructor(t){this.type=t}},location:{hash:'',search:'',reload(){}},confirm:()=>confirmed,fetch});
 removed.length=0;
 const button=created.find(n=>n.textContent==='LINE連携を解除する');assert.ok(button);await button.click();
 return {requests,removed,selected,events,state,message};
}
test('unlink confirmation cancellation sends nothing and keeps current member',async()=>{
 const x=await run({confirmed:false});assert.equal(x.requests.filter(r=>r.b?.action==='unlink').length,0);assert.equal(x.removed.length,0);
});
test('unlink clears purchase proof and private selection, preserving points and item contents',async()=>{
 const x=await run({privateSelected:true});const request=x.requests.find(r=>r.b?.action==='unlink');assert.deepEqual(request.b,{action:'unlink',token:'session-proof',cart:'cart-identity',confirm:true});
 const cart=x.requests.find(r=>r.url==='/cart/update.js');assert.deepEqual(cart.b,{attributes:{_agaruke_purchase:''}});
 assert.deepEqual(x.selected,['']);assert.ok(x.removed.includes('agaruke-purchase-v2'));assert.ok(x.events.includes('agaruke:members-unlinked'));assert.equal(x.state.point,800);
});
test('unlink leaves public coupon selected and retains proof when server rejects',async()=>{
 const ok=await run();assert.deepEqual(ok.selected,[]);
 const failed=await run({serverFails:true});assert.ok(!failed.removed.includes('agaruke-purchase-v2'));assert.ok(!failed.requests.some(r=>r.url==='/cart/update.js'));
});

test('account-only unlink works with no active purchase proof and sends the observed link hint',async()=>{
 const x=await run({accountOnly:true});const request=x.requests.find(r=>r.b?.action==='unlink');assert.equal(request.b.account_only,true);assert.equal(request.b.link_hint,'a'.repeat(64));assert.equal(request.b.token,null);
});
