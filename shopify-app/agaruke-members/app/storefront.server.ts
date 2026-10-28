export interface StorefrontState {linked?:boolean;permanent?:boolean;ready?:boolean;token?:string;coupons?:Array<{minimum:number;status:string}>}
export function storefrontPresentation(state:StorefrontState,cart:{item_count:number;total_price:number;currency:string},testOnly:boolean){
 const linked=state.linked===true;
 const ready=linked&&state.ready===true&&cart.item_count>0&&cart.total_price>0&&cart.currency==='JPY';
 return {linked,ready,permanent:state.permanent===true,expected_points:ready&&!testOnly?100:0,standard_points:ready?100:0,
  link_test_only:testOnly,coupon_count:linked?(state.coupons||[]).filter(c=>c.status==='available').length:0,
  coupon_url:'/apps/members',purchase_token:state.token||''};
}
