import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCartClient} from '../theme-entry/assets/agaruke-cart.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {resolve,reject,promise};};
test('member and coupon readers share one request and receive isolated data',async()=>{
 let calls=0;const response=deferred();const client=createCartClient({fetcher:()=>{calls++;return response.promise;}});
 const a=client.read(), b=client.read({fresh:true});response.resolve({total_price:100,items:[]});
 const [one,two]=await Promise.all([a,b]);assert.equal(calls,1);one.total_price=0;assert.equal(two.total_price,100);
});
test('fresh checkout validation bypasses the short-lived snapshot',async()=>{
 let calls=0,clock=0;const client=createCartClient({fetcher:async()=>({total_price:++calls}),now:()=>clock});
 await client.read();await client.read();assert.equal(calls,1);
 await client.read({fresh:true});assert.equal(calls,2);
 clock=1000;await client.read();assert.equal(calls,3);
});
test('mutation prevents an old in-flight response from replacing the updated cart',async()=>{
 const old=deferred();let calls=0;const client=createCartClient({fetcher:()=>++calls===1?old.promise:Promise.resolve({discount_codes:[]})});
 const stale=client.read();await client.mutate(async()=>({discount_codes:[]}));old.resolve({discount_codes:[{code:'OLD'}]});
 assert.deepEqual(await stale,{discount_codes:[]});assert.equal(calls,2);
});
test('a failed mutation or read never leaves a reusable stale cart',async()=>{
 let calls=0;const client=createCartClient({fetcher:async()=>{if(++calls===2)throw Error('offline');return {total_price:calls};}});
 await client.read();await assert.rejects(client.mutate(async()=>{throw Error('failed')}));
 await assert.rejects(client.read());assert.equal((await client.read()).total_price,3);
});
test('failed fresh validation invalidates the previous successful snapshot',async()=>{
 let calls=0;const client=createCartClient({fetcher:async()=>{if(++calls===2)throw Error('offline');return {total_price:calls};}});
 await client.read();await assert.rejects(client.read({fresh:true}));assert.equal((await client.read()).total_price,3);
});
