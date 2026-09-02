import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^'|'$/g, "");
}
if (!("WebSocket" in globalThis)) { const { WebSocket } = await import("ws"); (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket; }
const { createAdminClient } = await import("../src/lib/supabase/admin");
const admin = createAdminClient();
const { data: shop } = await admin.from("shops").select("id").eq("slug", "garden-gather").single();
const id = shop!.id as string;
const { data: pnl, error } = await admin.rpc("pnl_summary", { p_shop: id, p_from: "2026-08-01", p_to: "2026-08-31" });
console.log("P&L aout :", JSON.stringify(pnl ?? error));
const { data: est } = await admin.from("orders").select("country, shipping_estimated").eq("shop_id", id).gte("order_day", "2026-08-01");
const parPays: Record<string, [number, number]> = {};
for (const o of est ?? []) { const p = parPays[o.country ?? "?"] ??= [0, 0]; p[0]++; if (o.shipping_estimated) p[1]++; }
console.log("aout par pays [commandes, shipping estime] :", JSON.stringify(parPays));
const { data: sans } = await admin.from("orders").select("items").eq("shop_id", id).gte("order_day", "2026-08-01").eq("product_cost", 0);
console.log("commandes aout a cout produit 0 :", sans?.length);
const { data: acc } = await admin.from("ad_accounts").select("*").eq("shop_id", id);
const { data: conn } = await admin.from("connectors").select("platform,status,last_sync_at,expires_at").eq("shop_id", id);
console.log("connecteurs :", JSON.stringify(conn), "comptes pub :", JSON.stringify(acc));
