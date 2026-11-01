import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../../members-site/sw.js',import.meta.url),'utf8');
function worker(fetcher){
 const handlers={},stored=new Map();let claimed=false;
 const cache={put:async(key,value)=>stored.set(typeof key==='string'?key:new URL(key.url).pathname,value),match:async key=>stored.get(typeof key==='string'?key:new URL(key.url).pathname)?.clone()};
 vm.runInNewContext(source,{URL,Request,Response,Promise,fetch:fetcher,caches:{open:async()=>cache,keys:async()=>[],delete:async()=>true},self:{location:{origin:'https://members.test'},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:()=>{},clients:{claim:()=>{claimed=true}}}});
 return {handlers,stored};
}
test('install bypasses old CDN assets with the release version and canonical cache keys',async()=>{
 const requests=[];const w=worker(async req=>{requests.push(req);return new Response('fresh')});let done;
 w.handlers.install({waitUntil:p=>done=p});await done;
 assert.ok(requests.length>6);for(const req of requests){assert.ok(new URL(req.url).searchParams.has('__release'));assert.equal(req.cache,'reload')}
 assert.equal(await w.stored.get('/liff.js').text(),'fresh');assert.ok(w.stored.has('/index.js'));
});
test('core UI uses network, avoids caching query credentials, and falls back only offline',async()=>{
 let offline=false;const requests=[];const w=worker(async req=>{requests.push(req);if(offline)throw Error('offline');return new Response('new UI')});w.stored.set('/liff.js',new Response('old UI'));
 async function read(path){let done;w.handlers.fetch({request:new Request('https://members.test'+path),respondWith:p=>done=p});return done}
 assert.equal(await (await read('/liff.js')).text(),'new UI');assert.equal(requests[0].cache,'no-cache');
 w.stored.set('/',new Response('fallback'));
 assert.equal(await (await read('/?code=synthetic')).text(),'new UI');assert.equal(await w.stored.get('/').clone().text(),'fallback');
 offline=true;assert.equal(await (await read('/?code=synthetic')).text(),'fallback');
 let intercepted=false;w.handlers.fetch({request:new Request('https://api.test/status'),respondWith:()=>intercepted=true});assert.equal(intercepted,false);
});
