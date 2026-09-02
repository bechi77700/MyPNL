import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^'|'$/g, "");
}
if (!("WebSocket" in globalThis)) { const { WebSocket } = await import("ws"); (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket; }
const { createAdminClient } = await import("../src/lib/supabase/admin");
const admin = createAdminClient();
const { data: shop } = await admin.from("shops").select("id, currency").eq("slug", process.argv[2]).single();
const { data } = await admin.rpc("pnl_summary", { p_shop: shop!.id, p_from: process.argv[3], p_to: process.argv[4] });
const d = data[0];
for (const k of ["orders_count", "units", "net_revenue", "product_cost", "shipping_cost", "transaction_fees", "ad_spend", "ebitda"]) console.log(k, Math.round(d[k]));
console.log("marge nette %", (d.ebitda / d.net_revenue * 100).toFixed(1));
