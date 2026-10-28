import type {ActionFunctionArgs} from "react-router";
import {authenticate, sessionStorage} from "../shopify.server";
export async function action({request}: ActionFunctionArgs) {
  const {payload, session, shop} = await authenticate.webhook(request);
  if (shop !== process.env.SHOPIFY_SHOP_DOMAIN) return new Response(null, {status: 403});
  if (session) { session.scope = (payload.current as string[]).join(","); await sessionStorage.storeSession(session); }
  return new Response(null, {status: 200});
}
