import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {shopEntryUrl} from '../app/shop-entry.server.ts';
const entrySource=readFileSync(new URL('../app/shop-entry-client.js',import.meta.url),'utf8');
const client=readFileSync(new URL('../app/purchase-client.js',import.meta.url),'utf8');
function api(){const window={};vm.runInNewContext(entrySource,{window,URLSearchParams});return window.agarukeShopEntry}
test('closed entry URLs contain UTM and coupon ID, never bearer code or arbitrary redirects',()=>{
 const rich=new URL(shopEntryUrl('https://shop.agaruke.com'));assert.equal(rich.searchParams.get('utm_medium'),'social');assert.equal(rich.searchParams.get('entry'),'rich_menu');
 const ticket=new URL(shopEntryUrl(rich.origin,{id:'own-coupon',cost:200}));assert.equal(ticket.searchParams.get('utm_content'),'pointcard_ticket_200');
 const a=api();assert.equal(a.parse('?entry=ticket&coupon=../foreign&offer=200'),null);assert.equal(a.parse('?entry=ticket&coupon=id&offer=300'),null);
 assert.equal(a.parse('?entry=external&redirect=https://evil.invalid'),null);
 assert.equal(a.destination(a.parse(ticket.search)),'/?utm_source=line&utm_medium=social&utm_campaign=point_exchange&utm_content=pointcard_ticket_200');
 assert.throws(()=>shopEntryUrl('http://shop.agaruke.com'));
});
async function run({initial=false,kind='ticket',couponStatus='available',missing=false,wrongProof=false}={}){
 const created=[],calls=[],selected=[],assigned=[],redirected=[];
 function el(tag){const n={tag,dataset:{},children:[],append(...a){this.children.push(...a)},prepend(...a){this.children.unshift(...a)},replaceChildren(){this.children=[]},addEventListener(t,f){this[t]=f;}};created.push(n);return n}
 const actions=el('div'),message=el('p'),root={querySelectorAll:()=>created.filter(x=>x.tag==='button')};
 const document={createElement:el,getElementById:id=>id==='members-purchase-config'?{textContent:JSON.stringify({path:'/apps/members',customer_authenticated:false})}:id==='members-actions'?actions:id==='members-message'?message:root};
 const entry={kind,...(kind==='ticket'?{coupon_id:'own-coupon',offer:200}:{})};
 const proof={token:'a'.repeat(64),verifier:'b'.repeat(64),at:Date.now(),entry};
 const locals=new Map([['agaruke-line-proof-v2',JSON.stringify(proof)]]),sessions=new Map();
 const storage=map=>({getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)});
 const window={addEventListener(){},dispatchEvent(){},agarukeCoupons:{select:async(c,t)=>selected.push({c,t}),current:()=>({selected:false}),isSelected:()=>false}};
 const location={pathname:'/apps/members',search:initial?`?entry=${kind}&coupon=own-coupon&offer=200`:'',hash:initial?'':`#grant=${(wrongProof?'c':'a').repeat(64)}&code=${'d'.repeat(64)}`,assign:u=>assigned.push(u),replace:u=>redirected.push(u)};
 const fetch=async(url,options)=>{const b=options?.body?JSON.parse(options.body):null;calls.push({url,b});if(url==='/cart.js')return Response.json({token:'empty-stable-cart',item_count:0,currency:'JPY'});if(url==='/cart/update.js')return Response.json({token:'persisted-empty-cart',item_count:0,currency:'JPY'});if(b.action==='start')return Response.json({token:'e'.repeat(64),liff_url:'https://members.agaruke.com/?shopify_purchase='+ 'e'.repeat(64)});if(b.action==='consume')return Response.json({token:'new-session'});return Response.json({point:800,member_number:1,coupons:missing?[]:[{id:'own-coupon',code:'PRIVATE-SYNTHETIC',cost:200,minimum:3800,status:couponStatus,expires_at:'2027-01-31T00:00:00Z'}],coupon_exchange_enabled:true,link_test_only:false});};
 const ctx={URLSearchParams,document,window,location,history:{replaceState(){}},sessionStorage:storage(sessions),localStorage:storage(locals),fetch,crypto:webcrypto,Uint8Array,TextEncoder,Event:class{},CustomEvent:class{},confirm:()=>false};
 vm.runInNewContext(entrySource,ctx);await vm.runInNewContext(client,ctx);
 return {calls,selected,assigned,redirected,message,proof:JSON.parse(locals.get('agaruke-line-proof-v2')||'null'),sessions};
}
test('entry always starts same-browser PKCE, rather than trusting a previous member session',async()=>{
 const r=await run({initial:true});assert.equal(r.assigned.length,1);assert.equal(r.calls.filter(c=>c.b?.action==='start').length,1);assert.equal(r.calls.filter(c=>c.b?.action==='status').length,0);assert.equal(r.proof.entry.coupon_id,'own-coupon');assert.equal(r.proof.verifier.length,64);
});
test('callback links the cart before applying the owned ticket and restores UTM at top',async()=>{
 const r=await run();assert.equal(r.sessions.get('agaruke-purchase-v2'),'new-session');assert.equal(r.proof,null);
 assert.deepEqual(r.calls.find(c=>c.url==='/cart/update.js'&&c.b.attributes._agaruke_purchase).b,{attributes:{_agaruke_purchase:'new-session',_agaruke_link_pending:''}});
 assert.equal(r.calls.find(c=>c.b?.action==='consume').b.cart,'persisted-empty-cart');assert.equal(r.selected[0].c,'PRIVATE-SYNTHETIC');assert.equal(r.redirected[0],'/?utm_source=line&utm_medium=social&utm_campaign=point_exchange&utm_content=pointcard_ticket_200');
});
test('rich menu links points and preserves any previously selected coupon',async()=>{
 const r=await run({kind:'rich_menu'});assert.equal(r.selected.length,0);assert.equal(r.redirected[0],'/?utm_source=line&utm_medium=social&utm_campaign=agaruke_ec&utm_content=rich_menu_shop');
});
test('unavailable or foreign tickets do not silently proceed without the requested coupon',async()=>{
 for(const args of [{missing:true},{couponStatus:'used'},{couponStatus:'pending'}]){const r=await run(args);assert.equal(r.selected.length,0);assert.equal(r.redirected.length,0);assert.match(r.message.textContent,/チケットは適用できません/)}
});
test('different browser proof cannot link a cart or select a ticket',async()=>{
 const r=await run({wrongProof:true});assert.equal(r.calls.length,0);assert.equal(r.selected.length,0);assert.equal(r.redirected.length,0);assert.match(r.message.textContent,/認証を始めたブラウザ/);
});
