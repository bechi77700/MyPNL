/** Rattrape la passerelle de paiement de chaque commande.  npx tsx scripts/backfill-gateways.mts <slug> */
import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^'|'$/g, "");
}
if (!("WebSocket" in globalThis)) { const { WebSocket } = await import("ws"); (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket; }
const { createAdminClient } = await import("../src/lib/supabase/admin");
const { decrypt } = await import("../src/lib/crypto");
const admin = createAdminClient();
const { data: shop } = await admin.from("shops").select("id, domain").eq("slug", process.argv[2]).single();
const { data: c } = await admin.from("connectors").select("creds_encrypted").eq("shop_id", shop!.id).eq("platform", "shopify").single();
const { token } = JSON.parse(decrypt(c!.creds_encrypted));
let url: string | null = `https://${shop!.domain}/admin/api/2026-07/orders.json?status=any&limit=250&fields=id,payment_gateway_names`;
let total = 0, pages = 0;
while (url) {
  const r: Response = await fetch(url, { headers: { "X-Shopify-Access-Token": token } });
  if (r.status === 429) { await new Promise((z) => setTimeout(z, 2000)); continue; }
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const { orders } = (await r.json()) as { orders: { id: number; payment_gateway_names?: string[] }[] };
  const ids = orders.map((o) => String(o.id));
  const gws = orders.map((o) => o.payment_gateway_names?.[0] ?? "inconnu");
  const { data: n, error } = await admin.rpc("set_order_gateways", { p_shop: shop!.id, p_ids: ids, p_gateways: gws });
  if (error) throw new Error(error.message);
  total += Number(n ?? 0); pages++;
  const next = r.headers.get("link")?.split(",").find((p) => p.includes('rel="next"'))?.match(/<([^>]+)>/)?.[1];
  url = next ?? null;
}
console.log(`${pages} pages, ${total} commandes mises a jour`);
const { data: gw } = await admin.from("shop_gateways").select("gateway, orders_count, last_order").eq("shop_id", shop!.id).order("orders_count", { ascending: false });
console.table(gw ?? []);
