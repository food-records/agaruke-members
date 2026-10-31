import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect} from 'preact/hooks';
export default function(){render(<PurchaseLink/>,document.body);}
function PurchaseLink(): null {
 const purchase=shopify.attributes.value.find(a=>a.key==='_agaruke_purchase')?.value;
 const order=shopify.orderConfirmation.value?.order.id;
 useEffect(()=>{
  if(!purchase||!order)return;
  async function sync(){
   try{
    const token=await shopify.sessionToken.get();
    const base=String(shopify.settings.value.backend_url||'https://shopify-members-438247672947.us-central1.run.app');
    await fetch(base.replace(/\/$/,'')+'/api/purchase-order',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({token:purchase,order_id:order})});
   }catch{}
  }
  void sync();
 },[purchase,order]);
 return null;
}
