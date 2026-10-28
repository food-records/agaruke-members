import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect,useState} from 'preact/hooks';
export default function(){render(<Members/>,document.body);}
function Members(){
 const [label,setLabel]=useState('連携状態を確認しています。');
 useEffect(()=>{(async()=>{
  try{
   const token=await shopify.sessionToken.get();
   const backend=String(shopify.settings.value.backend_url||'https://shopify-members-438247672947.us-central1.run.app');
   const response=await fetch(backend.replace(/\/$/,'')+'/api/members',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({action:'status'})});
   const state=await response.json();if(!response.ok)throw new Error('STATUS_FAILED');
   setLabel(state.linked?`会員番号 FR${String(state.member_number).padStart(6,'0')} ／ ${state.point}ポイント。LINEポイントカードと連携済みです。`:'まだLINEポイントカードと連携していません。ショップでLINE認証を行ってください。');
  }catch{setLabel('連携状態を確認できませんでした。ショップからお進みください。');}
 })();},[]);
 return <s-page heading="LINEポイントカード"><s-section><s-stack gap="base"><s-text>{label}</s-text><s-link href="https://shop.agaruke.com/apps/members">ショップでLINEポイントカードを使う</s-link></s-stack></s-section></s-page>;
}
