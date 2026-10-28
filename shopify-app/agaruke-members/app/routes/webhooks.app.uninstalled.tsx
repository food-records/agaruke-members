import type {ActionFunctionArgs} from "react-router";
import {authenticate, sessionStorage} from "../shopify.server";
export async function action({request}: ActionFunctionArgs) {
  const {shop} = await authenticate.webhook(request);
  if (shop !== process.env.SHOPIFY_SHOP_DOMAIN) return new Response(null, {status: 403});
  const sessions = await sessionStorage.findSessionsByShop(shop);
  await sessionStorage.deleteSessions(sessions.map(session => session.id));
  return new Response(null, {status: 200});
}
