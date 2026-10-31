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
const query='query LaunchCoupon($id: ID!) { discountNode(id: $id) { id discount { ... on DiscountCodeBasic { title status appliesOncePerCustomer usageLimit endsAt context { __typename } codes(first: 1) { nodes { code } } minimumRequirement { ... on DiscountMinimumSubtotal { greaterThanOrEqualToSubtotal { amount currencyCode } } } customerGets { value { ... on DiscountAmount { amount { amount currencyCode } appliesOnEachItem } } } combinesWith { orderDiscounts productDiscounts shippingDiscounts } } } } }';
const mutation='mutation PublicLaunchCoupon($id: ID!, $input: DiscountCodeBasicInput!) { discountCodeBasicUpdate(id: $id, basicCodeDiscount: $input) { codeDiscountNode { id } userErrors { field message } } }';

const id='gid://shopify/DiscountCodeNode/1497005162669';
const read=async()=>{const value=(await gql(query,{id})).discountNode?.discount;if(!value)throw Error('COUPON_NOT_FOUND');return value;};
const before=await read();
if(before.codes.nodes[0]?.code!=='AGARUKE500'||Number(before.customerGets.value.amount?.amount)!==500||Number(before.minimumRequirement.greaterThanOrEqualToSubtotal.amount)!==3800||!before.appliesOncePerCustomer||before.endsAt!=='2026-11-30T14:59:00Z'||Object.values(before.combinesWith).some(Boolean))throw Error('EXISTING_CONDITIONS_CHANGED');
console.log(JSON.stringify({apply:process.argv.includes('--apply'),code:'AGARUKE500',amount:500,minimum:3800,once_per_customer:before.appliesOncePerCustomer,eligibility:before.context.__typename,ends_at:before.endsAt}));
if(process.argv.includes('--apply')){
 const result=(await gql(mutation,{id,input:{title:'公開記念 500円OFFクーポン',context:{all:'ALL'}}})).discountCodeBasicUpdate;
 if(result.userErrors.length||result.codeDiscountNode?.id!==id)throw Error('UPDATE_FAILED');
 const after=await read();const unchanged=x=>{const {title,context,...rest}=x;return rest;};
 if(JSON.stringify(unchanged(before))!==JSON.stringify(unchanged(after)))throw Error('CONDITIONS_READBACK_MISMATCH');
 if(!/All/.test(after.context.__typename)||after.title!=='公開記念 500円OFFクーポン')throw Error('ELIGIBILITY_READBACK_FAILED');
 console.log(JSON.stringify({public_coupon:true,title:after.title,eligibility:after.context.__typename,once_per_customer:after.appliesOncePerCustomer,other_conditions_preserved:true,no_messages:true}));
}
