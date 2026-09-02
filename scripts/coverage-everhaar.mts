import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^'|'$/g, "");
}
if (!("WebSocket" in globalThis)) { const { WebSocket } = await import("ws"); (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket; }
const { createAdminClient } = await import("../src/lib/supabase/admin");
const admin = createAdminClient();
const { data: shop } = await admin.from("shops").select("id").eq("slug", "everhaar").single();
const id = shop!.id as string;
// guide numerique : cout 0, pas de shipping
await admin.from("product_costs").upsert({ shop_id: id, sku: "42993797005377", cost: 0, source: "manual" }, { onConflict: "shop_id,sku" });
await admin.from("shop_skus").update({ exclude_from_shipping: true }).eq("shop_id", id).eq("sku", "42993797005377");
await admin.rpc("recompute_orders_cogs", { p_shop: id });
await admin.rpc("refresh_daily_facts", { p_shop: id, p_from: "2026-01-01", p_to: "2026-09-03" });
// couverture 30 derniers jours : SKUs presents dans les commandes sans cout
const { data: couts } = await admin.from("product_costs").select("sku").eq("shop_id", id);
const connus = new Set((couts ?? []).map((c) => c.sku));
const { data: skus } = await admin.from("shop_skus").select("sku, title").eq("shop_id", id);
const titre = Object.fromEntries((skus ?? []).map((s) => [s.sku, s.title]));
const { data: cmds } = await admin.from("orders").select("items, country, shipping_estimated, product_cost, shipping_cost, revenue").eq("shop_id", id).gte("order_day", "2026-08-04").lte("order_day", "2026-09-02").range(0, 4999);
const inconnus: Record<string, number> = {}; const pays: Record<string, [number, number]> = {};
let ca = 0, prod = 0, ship = 0;
for (const o of cmds ?? []) {
  ca += Number(o.revenue); prod += Number(o.product_cost); ship += Number(o.shipping_cost);
  for (const [s, q] of Object.entries(o.items ?? {})) if (!connus.has(s)) inconnus[s] = (inconnus[s] ?? 0) + Number(q);
  const p = pays[o.country ?? "?"] ??= [0, 0]; p[0]++; if (o.shipping_estimated) p[1]++;
}
console.log(`30 jours : ${cmds?.length} cmd, CA ${ca.toFixed(0)} €, produit ${prod.toFixed(0)} €, shipping ${ship.toFixed(0)} €`);
console.log("pays [cmd, shipping estime] :", JSON.stringify(Object.fromEntries(Object.entries(pays).sort((a, b) => b[1][0] - a[1][0]))));
console.log("SKUs vendus sans cout (unites) :", Object.entries(inconnus).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([s, q]) => `${titre[s] ?? s}: ${q}`).join(" | ") || "aucun");
