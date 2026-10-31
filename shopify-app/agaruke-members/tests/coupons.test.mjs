import {test} from 'node:test';
import assert from 'node:assert/strict';
import {couponTitle,couponChange,couponSummary,benefitBanner} from '../theme-entry/assets/agaruke-coupons.js';
test('selected code is replaced or fully removed without changing cart items or member attributes',async()=>{
 const patch=await couponChange('AM'+'a'.repeat(64),'EC 200円OFFクーポン');
 assert.equal(patch.discount,'AM'+'a'.repeat(64));assert.equal(patch.attributes._agaruke_coupon_hash.length,64);
 assert.deepEqual(Object.keys(patch).sort(),['attributes','discount']);
 assert.equal(patch.items,undefined);assert.equal(patch.attributes._agaruke_purchase,undefined);
 assert.deepEqual(await couponChange(''),{discount:'',attributes:{_agaruke_coupon_label:'',_agaruke_coupon_hash:''}});
});
test('status uses Shopify applicability, distinguishes unmet requirements and never displays serial codes',()=>{
 const code='AM'+'a'.repeat(64);
 assert.deepEqual(couponSummary({discount_codes:[]}),{selected:false,text:'クーポン未選択'});
 assert.match(couponSummary({discount_codes:[{code,applicable:false}]},'EC 200円OFFクーポン').text,/200円OFF.*条件未達/);
 const cart={discount_codes:[{code,applicable:true}],cart_level_discount_applications:[{type:'discount_code',total_allocated_amount:20000}]};
 const text=couponSummary(cart).text;assert.equal(text,'EC 200円OFFクーポン 適用中');assert.ok(!text.includes(code));
 assert.equal(couponTitle('AGARUKE500'),'公開記念 500円OFFクーポン');
 assert.equal(couponTitle('AMTEST'+'A'.repeat(32)),'テスト 500円OFFクーポン');
});

test('an old ineligible code never masks the actually applicable code',()=>{
 const cart={discount_codes:[{code:'AM'+'a'.repeat(64),applicable:false},{code:'AGARUKE500',applicable:true}],cart_level_discount_applications:[{type:'discount_code',total_allocated_amount:50000}]};
 assert.equal(couponSummary(cart).text,'公開記念 500円OFFクーポン 適用中');
});

test('coupon takes priority without LINE, registration is optional and linked shoppers see no empty banner',()=>{
 const coupon={selected:true,applicable:true,text:'公開記念 500円OFFクーポン 適用中'};
 for(const member of [undefined,{linked:false},{linked:true,ready:true,link_test_only:true}]){
  const view=benefitBanner(member,coupon);assert.equal(view.visible,true);assert.equal(view.mode,'applied');assert.equal(view.text,coupon.text);assert.ok(!view.text.includes('pt'));
 }
 assert.equal(benefitBanner(undefined,{selected:false}).visible,false);
 const unlinked=benefitBanner({linked:false},{selected:false});assert.equal(unlinked.mode,'unlinked');assert.match(unlinked.text,/任意/);
 assert.equal(benefitBanner({linked:true},{selected:false}).visible,false);
 assert.equal(benefitBanner({linked:false},{...coupon,applicable:false,text:'条件未達'}).mode,'unmet');
});
