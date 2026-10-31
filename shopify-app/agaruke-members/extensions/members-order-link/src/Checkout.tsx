import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect,useState} from 'preact/hooks';
export default function(){render(<PurchaseLink/>,document.body);}
function PurchaseLink(){
 const [message,setMessage]=useState('LINEポイントカードの連携を確認しています。');
 const [retry,setRetry]=useState(false);
 const purchase=shopify.attributes.value.find(a=>a.key==='_agaruke_purchase')?.value;
 const order=shopify.orderConfirmation.value?.order.id;
 async function sync(){
  if(!purchase||!order)return;
  setRetry(false);
  try{
   const token=await shopify.sessionToken.get();
   const base=String(shopify.settings.value.backend_url||'https://shopify-members-438247672947.us-central1.run.app');
   const response=await fetch(base.replace(/\/$/,'')+'/api/purchase-order',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({token:purchase,order_id:order})});
   const result=await response.json();if(!response.ok)throw new Error('PENDING');
   setMessage(result.guest?'今回の注文にLINEポイントカードを設定しています。継続的なアカウント連携は行いません。':'ShopifyアカウントとLINEポイントカードを連携しました。');
  }catch{setMessage('注文情報を確認中です。下のボタンから連携を再確認してください。');setRetry(true);}
 }
 useEffect(()=>{sync();},[purchase,order]);
 if(!purchase){
  if(!shopify.orderConfirmation.value?.isFirstOrder)return null;
  return <s-banner heading="LINEポイントカードのご案内"><s-stack gap="base"><s-text>次回のお買い物に向けて、LINEポイントカードを登録・連携できます。登録は任意です。</s-text><s-link href="https://shop.agaruke.com/apps/members">LINEポイントカードを登録・連携する</s-link></s-stack></s-banner>;
 }
 return <s-banner heading="LINEポイントカード"><s-stack gap="base"><s-text>{message}</s-text>{retry&&<s-button onClick={sync}>連携を再確認</s-button>}</s-stack></s-banner>;
}
