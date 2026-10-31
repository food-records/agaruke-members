export const LAUNCH_COUPON_END = Date.parse('2026-11-30T14:59:00Z');
export type LaunchCouponStatus = 'guest' | 'not_used' | 'used' | 'unknown' | 'expired';
type GraphQL = (query: string, options: {variables: Record<string, unknown>}) => Promise<Response>;
export const launchUsageQuery = `#graphql
query LaunchCouponUsage($query: String!) {
  orders(first: 10, query: $query, sortKey: CREATED_AT, reverse: true) {
    nodes { customer { id } discountCodes cancelledAt displayFinancialStatus }
    pageInfo { hasNextPage }
  }
}`;
export async function launchCouponStatus(customer: string, graphql: GraphQL, now = Date.now()): Promise<LaunchCouponStatus> {
  if (now >= LAUNCH_COUPON_END) return 'expired';
  if (!customer) return 'guest';
  if (!/^[1-9][0-9]*$/.test(customer)) return 'unknown';
  try {
    const response = await graphql(launchUsageQuery, {variables: {query: `customer_id:${customer} discount_code:AGARUKE500 status:any created_at:>=2026-10-01`}});
    const result = await response.json();
    if (!response.ok || result.errors || !Array.isArray(result.data?.orders?.nodes)) return 'unknown';
    const {nodes, pageInfo} = result.data.orders;
    if (nodes.some((order: {customer?: {id?: string}; discountCodes?: string[]}) => order.customer?.id !== `gid://shopify/Customer/${customer}` || !order.discountCodes?.some(code => code.toUpperCase() === 'AGARUKE500'))) return 'unknown';
    if (nodes.some((order: {cancelledAt?: string; displayFinancialStatus?: string}) => !order.cancelledAt && ['PAID', 'PARTIALLY_REFUNDED'].includes(order.displayFinancialStatus || ''))) return 'used';
    return nodes.length || pageInfo?.hasNextPage ? 'unknown' : 'not_used';
  } catch { return 'unknown'; }
}
