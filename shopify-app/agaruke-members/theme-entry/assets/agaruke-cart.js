export function createCartClient({fetcher,now=()=>Date.now(),maxAge=1000}) {
  let version=0, snapshot=null, savedAt=0, pending=null;
  const copy=value=>structuredClone(value);
  function invalidate(){version++;snapshot=null;pending=null;}
  async function read({fresh=false}={}) {
    if(pending?.version===version)return copy(await pending.promise);
    if(!fresh&&snapshot&&now()-savedAt>=0&&now()-savedAt<maxAge)return copy(snapshot);
    const generation=version;
    const entry={version:generation,promise:null};
    entry.promise=(async()=>{
      const cart=await fetcher();
      if(generation!==version)return read({fresh:true});
      snapshot=copy(cart);savedAt=now();return cart;
    })();
    pending=entry;
    try{return copy(await entry.promise);}catch(error){if(generation===version)snapshot=null;throw error;}finally{if(pending===entry)pending=null;}
  }
  async function mutate(send){
    invalidate();
    try{return await send();}finally{invalidate();}
  }
  return {read,invalidate,mutate};
}
const root=()=>typeof window==='undefined'?'/':window.Shopify?.routes?.root||'/';
async function json(url,options){
  const response=await fetch(url,{cache:'no-store',...options});
  if(!response.ok)throw Error('CART_UNAVAILABLE');
  return response.json();
}
const client=createCartClient({fetcher:()=>json(root()+'cart.js')});
export const getCart=options=>client.read(options);
export const invalidateCart=()=>client.invalidate();
export const mutateCart=(url,body)=>client.mutate(()=>json(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
if(typeof window!=='undefined') {
  window.addEventListener('pageshow',event=>{if(event.persisted)client.invalidate();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)client.invalidate();});
  window.addEventListener('agaruke:members-authenticated',()=>client.invalidate());
  window.addEventListener('agaruke:members-unlinked',()=>client.invalidate());
  if(typeof subscribe==='function'&&typeof PUB_SUB_EVENTS!=='undefined')subscribe(PUB_SUB_EVENTS.cartUpdate,()=>client.invalidate());
}
