import {test} from 'node:test';
import assert from 'node:assert/strict';
import {couponTitle,couponChange,couponSummary} from '../theme-entry/assets/agaruke-coupons.js';
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
 assert.equal(couponTitle('AGARUKE500'),'初回購入 500円OFFクーポン');
 assert.equal(couponTitle('AMTEST'+'A'.repeat(32)),'テスト 500円OFFクーポン');
});
