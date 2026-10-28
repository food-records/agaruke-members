// Only an already-provisioned coupon from the authenticated member API can be shown.
export function isTestCoupon(c: {id?:string;cost?:number;minimum?:number;status?:string}) {
  return c.id === 'test-500-3000-20261028' && c.cost === 500 && c.minimum === 3000 && c.status === 'available';
}
