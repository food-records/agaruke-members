const STATUSES = new Set(['guest','not_used','used','unknown','expired']);
export function createLaunchCouponState({lookup,onChange=()=>{},initial='unknown'}) {
  let status=initial, pending=null, generation=0;
  function publish(value){status=value;onChange(status);}
  async function check(){
    if(pending)return pending.promise;
    const version=generation;
    publish('checking');
    const entry={promise:null};
    entry.promise=(async()=>{
      let result;
      try{result=await lookup();}catch{result='unknown';}
      if(version!==generation)return check();
      publish(STATUSES.has(result)?result:'unknown');
      return status;
    })();
    pending=entry;
    try{return await entry.promise;}finally{if(pending===entry)pending=null;}
  }
  function invalidate(){generation++;pending=null;publish('unknown');}
  return {current:()=>status,check,invalidate};
}
export function launchRemoval(cart) {
  const codes=(cart.discount_codes||[]).map(item=>item.code).filter(code=>typeof code==='string');
  if(!codes.some(code=>code.toUpperCase()==='AGARUKE500'))return null;
  return {discount:codes.filter(code=>code.toUpperCase()!=='AGARUKE500').join(','),attributes:{_agaruke_coupon_label:'',_agaruke_coupon_hash:''}};
}
