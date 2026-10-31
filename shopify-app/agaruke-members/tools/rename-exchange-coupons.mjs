// Rename titles only. Never modify codes, values, eligibility, points or expiry.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {openSession} from '../app/session-storage.server.ts';
const run=(...args)=>execFileSync('/Users/saku/google-cloud-sdk/bin/gcloud',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const shop='stxmu0-ef.myshopify.com';
const svc=JSON.parse(run('run','services','describe','shopify-members','--project','fr-agaruke','--region','us-central1','--format=json'));
const ref=svc.spec.template.spec.containers[0].env.find(e=>e.name==='SHOPIFY_SESSION_ENCRYPTION_KEY').valueFrom.secretKeyRef;
process.env.SHOPIFY_SESSION_ENCRYPTION_KEY=run('secrets','versions','access',ref.key,'--secret',ref.name,'--project','fr-agaruke');
const key=createHash('sha256').update(shop+':offline_'+shop).digest('hex');
const path='https://firestore.googleapis.com/v1/projects/food-records-prod/databases/(default)/documents/organizations/35095fe0-1efc-40ff-bd13-9720c6d09e0f/shopify_app_sessions/'+key;
const r=await fetch(path,{headers:{Authorization:'Bearer '+run('auth','print-access-token')}});if(!r.ok)throw Error('SESSION_READ_FAILED');
const doc=await r.json();const session=openSession(doc.fields.sealed.stringValue,shop);
if(!session.accessToken||session.expires&&session.expires<Date.now())throw Error('SESSION_REFRESH_REQUIRED');
async function gql(query,variables){const response=await fetch(`https://${shop}/admin/api/2026-07/graphql.json`,{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':session.accessToken},body:JSON.stringify({query,variables})});const body=await response.json();if(!response.ok||body.errors)throw Error('ADMIN_QUERY_FAILED');return body.data;}
const query=`query ExchangeCouponTitles($after: String) { discountNodes(first: 100, after: $after) { nodes { id discount { ... on DiscountCodeBasic { title } } } pageInfo { hasNextPage endCursor } } }`;
const mutation=`mutation RenameExchangeCoupon($id: ID!, $input: DiscountCodeBasicInput!) { discountCodeBasicUpdate(id: $id, basicCodeDiscount: $input) { codeDiscountNode { id codeDiscount { ... on DiscountCodeBasic { title } } } userErrors { field message } } }`;
const matches=[];let after=null;
do{const result=(await gql(query,{after})).discountNodes;for(const node of result.nodes){const match=/^AGARUKE Members (200|500|1000)円券 [a-f0-9]{64}$/.exec(node.discount.title||'');if(match){const amount=Number(match[1]);matches.push({id:node.id,title:`EC ${amount.toLocaleString('ja-JP')}円OFFクーポン（商品合計${({200:3800,500:7000,1000:12000})[amount].toLocaleString('ja-JP')}円以上）`});}}after=result.pageInfo.hasNextPage?result.pageInfo.endCursor:null;}while(after);
console.log(JSON.stringify({apply:process.argv.includes('--apply'),count:matches.length,titles:matches.map(x=>x.title)}));
if(process.argv.includes('--apply'))for(const item of matches){const result=(await gql(mutation,{id:item.id,input:{title:item.title}})).discountCodeBasicUpdate;if(result.userErrors.length||result.codeDiscountNode?.codeDiscount.title!==item.title)throw Error('RENAME_READBACK_FAILED');}
if(process.argv.includes('--apply'))console.log('TITLES_UPDATED_READBACK_OK; codes/points/conditions unchanged; no messages');
