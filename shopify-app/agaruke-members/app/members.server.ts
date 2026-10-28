import {purchaseCall} from "./purchase.server.ts";
import type {JwtPayload} from "@shopify/shopify-api";

export function customerContext(token: Pick<JwtPayload, "sub" | "dest" | "aud">, shop: string, apiKey: string) {
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) throw new Error("SHOP_NOT_CONFIGURED");
  if (!apiKey || !(Array.isArray(token.aud) ? token.aud.includes(apiKey) : token.aud === apiKey) || (token.dest !== shop && token.dest !== `https://${shop}`) || !/^gid:\/\/shopify\/Customer\/[1-9][0-9]*$/.test(token.sub ?? "")) {
    throw new Error("CUSTOMER_LOGIN_REQUIRED");
  }
  return token.sub!.split("/").pop()!;
}

export async function membersCall(customer: string, action: string, fields: Record<string, unknown> = {}) {
  const endpoint = process.env.MEMBERS_API_URL;
  const key = process.env.MEMBERS_SERVICE_KEY;
  if (!endpoint || !key) throw new Error("MEMBERS_NOT_CONFIGURED");
  const url = new URL(endpoint);
  if (url.protocol !== "https:" && !(process.env.NODE_ENV === "test" && url.hostname === "127.0.0.1")) throw new Error("HTTPS_REQUIRED");
  const response = await fetch(`${url.origin}/shopify/customer/action`, {
    method: "POST", signal: AbortSignal.timeout(12000),
    headers: {"Content-Type": "application/json", "X-Members-Service-Key": key},
    body: JSON.stringify({...fields, customer, action}),
  });
  const body = await response.json();
  if (!response.ok || body.message !== "success") throw new Error("MEMBERS_REQUEST_FAILED");
  return body.data;
}

export interface Coupon {id: string; code: string; cost: number; minimum: number; status: string; expires_at: string}
export function discountInput(c: Coupon, customer: string) {
  return {
    title: `AGARUKE Members ${c.cost}円券 ${c.id}`, code: c.code,
    context: customer ? {customers: {add: [`gid://shopify/Customer/${customer}`]}} : {all: "ALL"},
    customerGets: {value: {discountAmount: {amount: String(c.cost), appliesOnEachItem: false}}, items: {all: true}},
    minimumRequirement: {subtotal: {greaterThanOrEqualToSubtotal: String(c.minimum)}},
    startsAt: new Date(Date.now() - 60000).toISOString(), endsAt: c.expires_at,
    usageLimit: 1, appliesOncePerCustomer: true,
    combinesWith: {orderDiscounts: false, productDiscounts: false, shippingDiscounts: false},
  };
}
type GraphQL = (query: string, options: {variables: Record<string, unknown>}) => Promise<Response>;
const findDiscount = `#graphql
query FindMembersDiscount($code: String!) { codeDiscountNodeByCode(code: $code) { id } }`;
const createDiscount = `#graphql
mutation CreateMembersDiscount($input: DiscountCodeBasicInput!) { discountCodeBasicCreate(basicCodeDiscount: $input) { codeDiscountNode { id } userErrors { field message code } } }`;
export async function provisionCoupon(coupon: Coupon, customer: string, graphql: GraphQL) {
 return provision(coupon,customer,graphql,(code,id)=>membersCall(customer,"activate",{code,discount_id:id}));
}
export async function provisionPurchaseCoupon(coupon: Coupon, fields: {token:string;cart:string}, graphql: GraphQL) {
 return provision(coupon,"",graphql,(code,id)=>purchaseCall("activate",{...fields,code,discount_id:id}));
}
async function provision(coupon: Coupon, customer: string, graphql: GraphQL, activate: (code:string,id:string)=>Promise<unknown>) {
  if (coupon.status !== "pending") return;
  const lookup = async () => {
    const body = await (await graphql(findDiscount, {variables: {code: coupon.code}})).json();
    if (body.errors) throw new Error("DISCOUNT_LOOKUP_FAILED");
    return body.data?.codeDiscountNodeByCode?.id as string | undefined;
  };
  let id = await lookup();
  if (!id) {
    const body = await (await graphql(createDiscount, {variables: {input: discountInput(coupon, customer)}})).json();
    if (body.errors) throw new Error("DISCOUNT_CREATE_FAILED");
    id = body.data?.discountCodeBasicCreate?.codeDiscountNode?.id;
    // A simultaneous retry can have created this same high-entropy code.
    if (!id) id = await lookup();
    if (!id) throw new Error("DISCOUNT_CREATE_FAILED");
  }
  await activate(coupon.code,id);
}
