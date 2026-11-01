import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../../members-site/liff.js',import.meta.url),'utf8');
async function boot(search,{inClient=true,loggedIn=true}={}) {
 const redirects=[],logins=[],calls=[];
 const location={search,href:'https://members.agaruke.com/'+search,replace:u=>redirects.push(u)};
 const context={URLSearchParams,location,window:{location,APP_CONFIG:{},addEventListener(){}},document:{},
  $:()=>({ready(){}}),
  liff:{init:async()=>{},isInClient:()=>inClient,isLoggedIn:()=>loggedIn,getAccessToken:()=> 'synthetic-token',login:o=>logins.push(o)}};
 vm.createContext(context);vm.runInContext(source,context);
 context.showAlert=(_m,next)=>next?.();context.showRewards=()=>calls.push('rewards');
 context.showPoint=()=>calls.push('point');
 context.initializeLiff('test-liff');await new Promise(r=>setImmediate(r));
 return {redirects,logins,calls};
}
test('rich menu authenticates in LIFF before fixed Shopify handoff; no card reads or token in URL',async()=>{
 const r=await boot('?shopify_entry=rich_menu&redirect=https://evil.invalid&access_token=ignored');
 assert.equal(r.redirects.length,1);const u=new URL(r.redirects[0]);
 assert.equal(u.origin,'https://shop.agaruke.com');assert.equal(u.pathname,'/apps/members');
 assert.equal(u.searchParams.get('entry'),'rich_menu');assert.equal(u.searchParams.get('utm_content'),'rich_menu_shop');
 assert.equal(u.searchParams.has('access_token'),false);assert.equal(u.searchParams.has('redirect'),false);
 assert.deepEqual(r.calls,[]);assert.deepEqual(r.logins,[]);
});
test('LIFF primary redirect state carries the rich menu destination',async()=>{
 for(const state of ['/?shopify_entry=rich_menu','?shopify_entry=rich_menu']) {
  const r=await boot('?liff.state='+encodeURIComponent(state));assert.equal(r.redirects.length,1);
 }
});
test('external logged-out browser still authenticates and preserves entry; never bypasses LINE',async()=>{
 const r=await boot('?shopify_entry=rich_menu',{inClient:false,loggedIn:false});
 assert.equal(r.redirects.length,0);assert.equal(r.logins.length,1);assert.match(r.logins[0].redirectUri,/shopify_entry=rich_menu/);
});
test('normal card, unknown entry and existing actions retain existing behavior',async()=>{
 for(const query of ['', '?shopify_entry=other','?shopify_entry=rich_menu&shopify_purchase=existing','?shopify_entry=rich_menu&code=FRtest','?shopify_entry=rich_menu&liff.state='+encodeURIComponent('?code=FRtest')]) {
  const r=await boot(query);assert.equal(r.redirects.length,0);assert.deepEqual(r.calls,['rewards','point']);
 }
});
