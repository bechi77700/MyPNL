import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^'|'$/g, "");
}
if (!("WebSocket" in globalThis)) { const { WebSocket } = await import("ws"); (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket; }
const { createAdminClient } = await import("../src/lib/supabase/admin");
const admin = createAdminClient();
const { data: shop } = await admin.from("shops").select("id").eq("slug", "everhaar").single();
const id = shop!.id as string;
// Valeurs PROVISOIRES : Airwallex = valeur saisie par l'utilisateur dans TrueProfit ;
// PayPal HK = tarif international commercial affiche par PayPal HK, A VERIFIER sur un releve ;
// Klarna / Global Payments = valeurs par defaut TrueProfit, A VERIFIER.
const taux = [
  { gateway: "paypal", rate: 4.4, fixed: 0.35 },
  { gateway: "Airwallex", rate: 4.6, fixed: 0.26 },
  { gateway: "Airwallex Klarna", rate: 2.9, fixed: 0.30 },
  { gateway: "Airwallex Global Payments (Auto-capture)", rate: 2.9, fixed: 0.30 },
];
const { error } = await admin.from("gateway_fees").upsert(taux.map((t) => ({ shop_id: id, ...t })), { onConflict: "shop_id,gateway" });
console.log("taux :", error ?? "ok");
const t0 = Date.now();
await admin.rpc("recompute_orders_cogs", { p_shop: id });
await admin.rpc("refresh_daily_facts", { p_shop: id, p_from: "2000-01-01", p_to: "2026-09-03" });
console.log(`recalcule en ${Math.round((Date.now() - t0) / 1000)} s`);
const { data } = await admin.rpc("pnl_summary", { p_shop: id, p_from: "2026-08-01", p_to: "2026-08-31" });
const d = data[0];
for (const k of ["orders_count", "net_revenue", "cogs", "transaction_fees", "ad_spend", "ebitda"]) console.log(k, Math.round(d[k]));
console.log("marge nette %", (d.ebitda / d.net_revenue * 100).toFixed(1));
const { data: parGw } = await admin.from("orders").select("gateway, transaction_fee, revenue").eq("shop_id", id).gte("order_day", "2026-08-01").lte("order_day", "2026-08-31").range(0, 4999);
const agg: Record<string, [number, number, number]> = {};
for (const o of parGw ?? []) { const a = agg[o.gateway] ??= [0, 0, 0]; a[0]++; a[1] += Number(o.revenue); a[2] += Number(o.transaction_fee); }
for (const [g, a] of Object.entries(agg)) console.log(`  ${g}: ${a[0]} cmd, CA ${a[1].toFixed(0)} €, frais ${a[2].toFixed(0)} € (${(a[2] / a[1] * 100).toFixed(2)} %)`);
