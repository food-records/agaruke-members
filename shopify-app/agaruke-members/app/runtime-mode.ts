// Exchange testing can be enabled without starting paid/refund processing.
export function couponExchangeEnabled(env: Record<string, string | undefined> = process.env) {
  return env.SHOPIFY_LINK_TEST_ONLY !== 'true' || env.SHOPIFY_COUPON_EXCHANGE_ENABLED === 'true';
}
