import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^'|'$/g, "");
}
if (!("WebSocket" in globalThis)) { const { WebSocket } = await import("ws"); (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket; }
const { createAdminClient } = await import("../src/lib/supabase/admin");
const admin = createAdminClient();
const { data: shop } = await admin.from("shops").select("id").eq("slug", "everhaar").single();
const { data } = await admin.from("orders").select("order_number, order_day, items, units, product_cost, shipping_cost").eq("shop_id", shop!.id).order("order_date", { ascending: false }).limit(4);
for (const o of data ?? []) console.log(o.order_number, o.order_day, JSON.stringify(o.items), "units", o.units, "prod", o.product_cost, "ship", o.shipping_cost);
const { count } = await admin.from("orders").select("id", { count: "exact", head: true }).eq("shop_id", shop!.id).gte("order_day", "2026-08-04").lte("order_day", "2026-09-02");
console.log("commandes 30 j :", count);
