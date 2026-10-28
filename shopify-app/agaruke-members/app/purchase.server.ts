export async function purchaseCall(action: string, fields: Record<string, unknown> = {}) {
  const endpoint = new URL(process.env.MEMBERS_API_URL || '');
  if (endpoint.protocol !== 'https:' && !(process.env.NODE_ENV === 'test' && endpoint.hostname === '127.0.0.1')) throw new Error('HTTPS_REQUIRED');
  const key = process.env.MEMBERS_SERVICE_KEY;
  if (!key) throw new Error('NOT_CONFIGURED');
  const response = await fetch(`${endpoint.origin}/shopify/purchase/action`, {
    method: 'POST', signal: AbortSignal.timeout(12000),
    headers: {'Content-Type': 'application/json', 'X-Members-Service-Key': key},
    body: JSON.stringify({...fields, action}),
  });
  const body = await response.json();
  if (!response.ok || body.message !== 'success') throw new Error('PURCHASE_REQUEST_FAILED');
  return body.data;
}
export function cartIdentity(value: unknown) {
  if (typeof value !== 'string' || value.length > 256 || !/^[a-zA-Z0-9_?=.%&-]+$/.test(value)) throw new Error('INVALID_CART');
  return value.split('?')[0];
}
export function proxyCustomer(url: URL) {
  const id = url.searchParams.get('logged_in_customer_id') || '';
  if (id && !/^[1-9][0-9]*$/.test(id)) throw new Error('INVALID_CUSTOMER');
  return id;
}
