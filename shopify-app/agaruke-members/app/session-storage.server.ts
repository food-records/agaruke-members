import {createCipheriv, createDecipheriv, randomBytes} from "node:crypto";
import {Session} from "@shopify/shopify-api";
import type {SessionStorage} from "@shopify/shopify-app-session-storage";

function key() {
  const value = Buffer.from(process.env.SHOPIFY_SESSION_ENCRYPTION_KEY ?? "", "base64");
  if (value.length !== 32) throw new Error("SESSION_ENCRYPTION_KEY_REQUIRED");
  return value;
}
export function sealSession(session: Session) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(session.shop));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(session.toPropertyArray(true))), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}
export function openSession(sealed: string, shop: string) {
  const data = Buffer.from(sealed, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12));
  decipher.setAAD(Buffer.from(shop)); decipher.setAuthTag(data.subarray(12, 28));
  const plaintext = Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]);
  const session = Session.fromPropertyArray(JSON.parse(plaintext.toString()), true);
  if (session.shop !== shop) throw new Error("SESSION_SHOP_MISMATCH");
  return session;
}
export class MembersSessionStorage implements SessionStorage {
  private async request(action: string, fields: Record<string, unknown> = {}) {
    const endpoint = process.env.MEMBERS_API_URL;
    const serviceKey = process.env.MEMBERS_SERVICE_KEY;
    const shop = process.env.SHOPIFY_SHOP_DOMAIN;
    if (!endpoint || !serviceKey || !shop || new URL(endpoint).protocol !== "https:") throw new Error("SESSION_STORAGE_NOT_CONFIGURED");
    const response = await fetch(`${new URL(endpoint).origin}/shopify/app-sessions`, {
      method: "POST", signal: AbortSignal.timeout(12000),
      headers: {"Content-Type": "application/json", "X-Members-Service-Key": serviceKey},
      body: JSON.stringify({...fields, shop, action}),
    });
    const body = await response.json();
    if (!response.ok || body.message !== "success") throw new Error("SESSION_STORAGE_FAILED");
    return body.data;
  }
  async storeSession(session: Session) {
    if (session.shop !== process.env.SHOPIFY_SHOP_DOMAIN) throw new Error("SESSION_SHOP_MISMATCH");
    await this.request("store", {id: session.id, sealed: sealSession(session)}); return true;
  }
  async loadSession(id: string) {
    const data = await this.request("load", {id});
    if (!data.sealed) return undefined;
    const session = openSession(data.sealed, process.env.SHOPIFY_SHOP_DOMAIN!);
    if (session.id !== id) throw new Error("SESSION_ID_MISMATCH");
    return session;
  }
  async deleteSession(id: string) { await this.request("delete", {id}); return true; }
  async deleteSessions(ids: string[]) { await Promise.all(ids.map(id => this.deleteSession(id))); return true; }
  async findSessionsByShop(shop: string): Promise<Session[]> {
    if (shop !== process.env.SHOPIFY_SHOP_DOMAIN) return [];
    const data = await this.request("find");
    return data.sessions.map((sealed: string) => openSession(sealed, shop));
  }
}
