import type {ActionFunctionArgs} from "react-router";
import {authenticate} from "../shopify.server";
export async function action({request}: ActionFunctionArgs) {
  const {topic, shop, payload, admin} = await authenticate.webhook(request);
  if (shop !== process.env.SHOPIFY_SHOP_DOMAIN || !["REFUNDS_CREATE", "ORDERS_CANCELLED"].includes(topic)) return new Response(null, {status: 403});
  if (process.env.SHOPIFY_MEMBERS_ENABLED !== "true" || !admin) return new Response(null, {status: 503});
  const id = topic === "REFUNDS_CREATE" ? String(payload.order_id) : String(payload.id);
  if (!/^[1-9][0-9]*$/.test(id)) return new Response(null, {status: 400});
  try {
    const result = await (await admin.graphql(`#graphql
      query MembersRefundOrder($id: ID!) { order(id: $id) { id displayFinancialStatus cancelledAt customer { id } discountCodes } }
    `, {variables: {id: `gid://shopify/Order/${id}`}})).json();
    const order = result.data?.order;
    if (!order) throw new Error("ORDER_LOOKUP_FAILED");
    // Partial refunds retain the flat per-order award; full refunds/cancellation
    // reverse it once. Re-read handles duplicate and out-of-order notifications.
    if (order.displayFinancialStatus !== "REFUNDED" && !order.cancelledAt) return new Response(null, {status: 200});
    const endpoint = process.env.MEMBERS_API_URL;
    const key = process.env.MEMBERS_SERVICE_KEY;
    if (!endpoint || !key || new URL(endpoint).protocol !== "https:") throw new Error("MEMBERS_NOT_CONFIGURED");
    const response = await fetch(`${new URL(endpoint).origin}/shopify/orders/reverse`, {
      method: "POST", signal: AbortSignal.timeout(12000),
      headers: {"Content-Type": "application/json", "X-Members-Service-Key": key},
      body: JSON.stringify({order_id: id, customer: order.customer?.id ?? "", codes: order.discountCodes}),
    });
    if (!response.ok) throw new Error("REVERSAL_FAILED");
    return new Response(null, {status: 200});
  } catch { return new Response(null, {status: 503}); }
}
