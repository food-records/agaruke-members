import {test} from 'node:test';
import assert from 'node:assert/strict';
import {benefitPoints,couponChoices} from '../theme-entry/assets/agaruke-benefits.js';
test('purchase promise requires a ready linked cart and live points mode',()=>{
 assert.match(benefitPoints({linked:false}),/購入前のLINE/);
 assert.match(benefitPoints({linked:true,ready:true,expected_points:100,link_test_only:false}),/支払い完了後に 100pt/);
 assert.match(benefitPoints({linked:true,ready:true,expected_points:0,link_test_only:true}),/停止中/);
 assert.match(benefitPoints({linked:true,ready:false,link_test_only:false}),/カートで/);
});
test('public coupon needs no LINE; private expired coupons stay hidden and launch offer ends in JST',()=>{
 const now=Date.parse('2026-11-01T00:00:00Z');
 const c={code:'private',cost:200,minimum:3800,expires_at:'2026-12-01T00:00:00Z'};
 assert.equal(couponChoices({linked:false,coupons:[c]},now).length,1);
 assert.equal(couponChoices({linked:true,coupons:[c,c,{...c,code:'expired',expires_at:'2026-10-01T00:00:00Z'}]},now).length,2);
 assert.equal(couponChoices({},Date.parse('2026-11-30T14:59:00Z')).length,0);
});
