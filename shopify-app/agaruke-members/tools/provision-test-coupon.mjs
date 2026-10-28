// Explicit operator-only grant. No points are deducted; no messages are sent.
import {execFileSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {openSession} from '../app/session-storage.server.ts';
import {discountInput} from '../app/members.server.ts';
const gcloud='/Users/saku/google-cloud-sdk/bin/gcloud';
const run=(...args)=>execFileSync(gcloud,args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const input=JSON.parse(readFileSync(process.argv[2],'utf8'));
if(!/^U[a-f0-9]{32}$/.test(input.uid)||!input.expires_at||!input.result_path)throw Error('INPUT_REQUIRED');
const apply=process.argv.includes('--apply');
const hash=x=>createHash('sha256').update(x).digest('hex');
const shop='stxmu0-ef.myshopify.com';
const root='projects/food-records-prod/databases/(default)/documents/organizations/35095fe0-1efc-40ff-bd13-9720c6d09e0f';
const access=run('auth','print-access-token');
async function fs(path,options={}){const r=await fetch('https://firestore.googleapis.com/v1/'+path,{...options,headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json'}});if(r.status===404)return null;if(!r.ok)throw Error('FIRESTORE_'+r.status);return r.json();}
const value=f=>f?.stringValue??f?.integerValue??f?.timestampValue??f?.booleanValue??null;
const read=async path=>{const d=await fs(root+'/'+path);return d?Object.fromEntries(Object.entries(d.fields||{}).map(([k,v])=>[k,value(v)])):null;};
const reverse=await read('shopify_member_links/'+hash(shop+':'+input.uid));
const customer=reverse?.shopify_customer_id;
if(!customer||reverse.line_user_id!==input.uid)throw Error('VERIFIED_LINK_REQUIRED');
const forward=await read('shopify_customer_links/'+hash(shop+':'+customer));
if(forward?.line_user_id!==input.uid)throw Error('FORWARD_LINK_REQUIRED');
const member=await read('members/'+input.uid);if(!member||member.deleted_at)throw Error('ACTIVE_MEMBER_REQUIRED');
const id='test-500-3000-20261028';
const memberPath='members/'+input.uid+'/shopify_coupons/'+id;
let coupon=await read(memberPath);
const expires=new Date(input.expires_at);if(!(expires>Date.now()&&expires-Date.now()<8*86400000))throw Error('EXPIRY_WITHIN_8_DAYS_REQUIRED');
if(coupon&&(coupon.customer!==customer||Number(coupon.cost)!==500||Number(coupon.minimum)!==3000||coupon.status!=='available'))throw Error('EXISTING_COUPON_CONFLICT');
console.log(JSON.stringify({verified_member:true,verified_link:true,amount:500,minimum:3000,customer_restricted:true,one_use:true,expires_at:input.expires_at,existing:!!coupon,apply}));
if(!apply)process.exit(0);
const service=JSON.parse(run('run','services','describe','shopify-members','--project','fr-agaruke','--region','us-central1','--format=json'));
const env=service.spec.template.spec.containers[0].env;
const secret=env.find(e=>e.name==='SHOPIFY_SESSION_ENCRYPTION_KEY').valueFrom.secretKeyRef;
process.env.SHOPIFY_SESSION_ENCRYPTION_KEY=run('secrets','versions','access',secret.key,'--secret',secret.name,'--project','fr-agaruke');
const sessionDoc=await read('shopify_app_sessions/'+hash(shop+':offline_'+shop));
const session=openSession(sessionDoc.sealed,shop);
if(!session.accessToken||session.expires&&session.expires<Date.now())throw Error('REFRESH_SHOPIFY_SESSION_REQUIRED');
const gql=async(query,variables)=>{const r=await fetch(`https://${shop}/admin/api/2026-07/graphql.json`,{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':session.accessToken},body:JSON.stringify({query,variables})});const b=await r.json();if(!r.ok||b.errors)throw Error('ADMIN_QUERY_FAILED');return b.data;};
const planPath=input.result_path+'.plan';
if(!coupon&&existsSync(planPath))coupon=JSON.parse(readFileSync(planPath,'utf8'));
if(coupon&&(coupon.id!==id||coupon.uid!==input.uid||coupon.customer!==customer||Number(coupon.minimum)!==3000||Number(coupon.cost)!==500))throw Error('PLAN_CONFLICT');
coupon=coupon||{id,code:'AMTEST'+randomBytes(16).toString('hex').toUpperCase(),customer,uid:input.uid,purchase:'',cost:500,minimum:3000,status:'available',expires_at:input.expires_at,order_id:''};
writeFileSync(planPath,JSON.stringify(coupon),{mode:0o600});
let node=(await gql('query($code:String!){codeDiscountNodeByCode(code:$code){id}}',{code:coupon.code})).codeDiscountNodeByCode;
if(!node){const result=await gql('mutation($input:DiscountCodeBasicInput!){discountCodeBasicCreate(basicCodeDiscount:$input){codeDiscountNode{id} userErrors{field message code}}}',{input:{...discountInput(coupon,customer),title:'AGARUKE 連携テスト 3,000円以上500円引き'}});node=result.discountCodeBasicCreate.codeDiscountNode;if(!node)throw Error('ADMIN_CREATE_FAILED');}
coupon.discount_id=node.id;
const fields=Object.fromEntries(Object.entries(coupon).map(([k,v])=>[k,k==='expires_at'?{timestampValue:v}:typeof v==='number'?{integerValue:String(v)}:{stringValue:v}]));
if(!await read(memberPath)) {
 const paths=[memberPath,'shopify_coupons/'+hash(shop+':'+coupon.code)];
 await fs(root.split('/documents/')[0]+'/documents:commit',{method:'POST',body:JSON.stringify({writes:paths.map(p=>({update:{name:root+'/'+p,fields},currentDocument:{exists:false}}))})});
}
const check=await read(memberPath);if(check?.discount_id!==node.id)throw Error('READBACK_FAILED');
writeFileSync(input.result_path,JSON.stringify({id,code:coupon.code,discount_id:node.id,expires_at:coupon.expires_at,customer_restricted:true,amount:500,minimum:3000},null,2),{mode:0o600});
console.log('TEST_COUPON_GRANTED_READBACK_OK; points unchanged; no messages sent');
