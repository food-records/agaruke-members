import type {ActionFunctionArgs, LoaderFunctionArgs} from "react-router";
import {authenticate, unauthenticated} from "../shopify.server";
import {customerContext, membersCall, provisionCoupon} from "../members.server";

export async function loader({request}: LoaderFunctionArgs) {
  const {cors} = await authenticate.public.customerAccount(request);
  return cors(new Response(null, {status: 204}));
}
export async function action({request}: ActionFunctionArgs) {
  const {cors, sessionToken} = await authenticate.public.customerAccount(request);
  const headers = {"Cache-Control": "no-store"};
  if (process.env.SHOPIFY_MEMBERS_ENABLED !== "true") return cors(Response.json({error: "現在準備中です。"}, {status: 503, headers}));
  try {
    const shop = process.env.SHOPIFY_SHOP_DOMAIN ?? "";
    const customer = customerContext(sessionToken, shop, process.env.SHOPIFY_API_KEY ?? "");
    const text = await request.text();
    if (text.length > 4096) return cors(new Response(null, {status: 413, headers}));
    const body = JSON.parse(text);
    if (process.env.SHOPIFY_LINK_TEST_ONLY === "true" && ["exchange", "retry"].includes(body.action)) {
      return cors(Response.json({error: "連携の結合試験中のため、クーポン交換はまだ開始していません。"}, {status: 403, headers}));
    }
    const allowed = ["status", "start", "intent", "confirm", "exchange", "retry"];
    if (!allowed.includes(body.action)) return cors(new Response(null, {status: 400, headers}));
    // Only whitelisted fields cross the boundary. Never forward a browser UID,
    // customer ID, discount node ID or Admin API input.
    let data;
    if (body.action === "retry") {
      const state = await membersCall(customer, "status");
      const coupon = state.coupons?.find((c: {id: string}) => c.id === body.coupon_id);
      if (!coupon) throw new Error("COUPON_NOT_FOUND");
      const {admin} = await unauthenticated.admin(shop);
      await provisionCoupon(coupon, customer, admin.graphql);
      data = await membersCall(customer, "status");
    } else if (body.action === "exchange") {
      const result = await membersCall(customer, "exchange", {cost: body.cost, request_id: body.request_id});
      if (!result.coupon) throw new Error("LINK_REQUIRED");
      const {admin} = await unauthenticated.admin(shop);
      await provisionCoupon(result.coupon, customer, admin.graphql);
      data = await membersCall(customer, "status");
    } else {
      data = await membersCall(customer, body.action, {token: body.token, confirmation_code: body.confirmation_code});
    }
    const storefront = new URL(process.env.SHOPIFY_STOREFRONT_URL ?? "");
    if (storefront.protocol !== "https:" || storefront.username || storefront.password) throw new Error("STORE_NOT_CONFIGURED");
    return cors(Response.json({...data, link_test_only: process.env.SHOPIFY_LINK_TEST_ONLY === "true", cart_url: `${storefront.origin}/cart`, storefront_url: storefront.origin}, {headers}));
  } catch {
    // Do not expose tokens, LINE identifiers, GraphQL errors or service keys.
    return cors(Response.json({error: "処理できませんでした。連携状態・残高を再確認してください。交換処理中の券は「発行を再開」から再開できます。"}, {status: 400, headers}));
  }
}
