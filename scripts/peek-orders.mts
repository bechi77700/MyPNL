import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^'|'$/g, "");
}
if (!("WebSocket" in globalThis)) { const { WebSocket } = await import("ws"); (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket; }
const { createAdminClient } = await import("../src/lib/supabase/admin");
const admin = createAdminClient();
const { data: shop } = await admin.from("shops").select("id").eq("slug", "garden-gather").single();
const { data: skus } = await admin.from("shop_skus").select("sku, title").eq("shop_id", shop!.id);
const t = Object.fromEntries((skus ?? []).map((s) => [s.sku, s.title.slice(0, 28)]));
const { data } = await admin.from("orders").select("order_number, country, postal_code, items, shipping_cost, product_cost").eq("shop_id", shop!.id).in("order_number", process.argv.slice(2));
for (const o of data ?? []) console.log(`#${o.order_number} ${o.country} ship ${o.shipping_cost} prod ${o.product_cost} :`, Object.entries(o.items).map(([s, q]) => `${t[s] ?? s}×${q}`).join(" + "));
