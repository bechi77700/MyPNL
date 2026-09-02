import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^'|'$/g, "");
}
if (!("WebSocket" in globalThis)) { const { WebSocket } = await import("ws"); (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket; }
const { createAdminClient } = await import("../src/lib/supabase/admin");
const admin = createAdminClient();
const DU = "2026-08-04", AU = "2026-09-02";
const { data: shops } = await admin.from("shops").select("id, slug, name, currency, timezone, tax_mode, fallback_country").order("name");
for (const s of shops ?? []) {
  console.log(`\n================ ${s.name} (${s.currency}, ${s.timezone}, TVA: ${s.tax_mode}, repli ${s.fallback_country})`);
  const { data: p } = await admin.rpc("pnl_summary", { p_shop: s.id, p_from: DU, p_to: AU }); const d = p[0];
  const pct = (x: number) => (d.net_revenue ? (x / d.net_revenue * 100).toFixed(1) + " %" : "—");
  console.log(`30 j : ${d.orders_count} cmd, CA net ${Math.round(d.net_revenue)}, remb ${Math.round(d.refunds)}, TVA ${Math.round(d.taxes)} (Shopify: ${Math.round(d.taxes)}), produit ${Math.round(d.product_cost)} (${pct(d.product_cost)}), port ${Math.round(d.shipping_cost)} (${pct(d.shipping_cost)}), frais ${Math.round(d.transaction_fees)} (${pct(d.transaction_fees)}), litiges ${Math.round(d.disputes_lost)}, pub ${Math.round(d.ad_spend)} ${JSON.stringify(d.ad_spend_detail)}, charges ${Math.round(d.opex)} ${JSON.stringify(d.opex_detail)}, remun ${Math.round(d.owner_salary)}, EBITDA ${Math.round(d.ebitda)} (${pct(d.ebitda)})`);
  // commandes : couverture
  const { data: cmds } = await admin.from("orders").select("revenue, refunded, taxes, product_cost, shipping_cost, shipping_estimated, transaction_fee, fee_estimated, gateway, country, units, cancelled_at").eq("shop_id", s.id).gte("order_day", DU).lte("order_day", AU).range(0, 9999);
  const c = cmds ?? []; const n = c.length;
  const prodZero = c.filter((o) => Number(o.product_cost) === 0 && Number(o.units) > 0).length;
  const shipEst = c.filter((o) => o.shipping_estimated).length;
  const shipZero = c.filter((o) => Number(o.shipping_cost) === 0 && Number(o.units) > 0).length;
  const feeReal = c.filter((o) => Number(o.transaction_fee) > 0 && !o.fee_estimated).length;
  const feeEst = c.filter((o) => o.fee_estimated).length;
  const feeZero = c.filter((o) => Number(o.transaction_fee) === 0).length;
  const taxes = c.reduce((a, o) => a + Number(o.taxes), 0);
  const gw: Record<string, number> = {}; for (const o of c) gw[o.gateway ?? "?"] = (gw[o.gateway ?? "?"] ?? 0) + 1;
  const pays: Record<string, number> = {}; for (const o of c) pays[o.country ?? "?"] = (pays[o.country ?? "?"] ?? 0) + 1;
  console.log(`couverture : ${n} cmd | produit à 0 : ${prodZero} | port estimé : ${shipEst}, port à 0 : ${shipZero} | frais réels : ${feeReal}, estimés : ${feeEst}, sans frais : ${feeZero} | taxes Shopify déclarées : ${Math.round(taxes)}`);
  console.log(`passerelles : ${JSON.stringify(gw)} | pays : ${JSON.stringify(Object.fromEntries(Object.entries(pays).sort((a, b) => b[1] - a[1]).slice(0, 6)))}`);
  // connecteurs, comptes pub, frais, versements
  const { data: conn } = await admin.from("connectors").select("platform, status, last_sync_at, last_error, expires_at").eq("shop_id", s.id);
  console.log("connecteurs :", JSON.stringify(conn));
  const { data: acc } = await admin.from("ad_accounts").select("name, currency, enabled, last_sync_at, last_error").eq("shop_id", s.id);
  console.log("comptes pub :", JSON.stringify(acc));
  const { data: fees } = await admin.from("shop_fees_daily").select("date, fees").eq("shop_id", s.id).gte("date", DU).order("date", { ascending: false }).limit(3);
  console.log("frais réels derniers jours :", JSON.stringify(fees));
  const { data: costs } = await admin.from("costs").select("label, category, kind, amount, effective_from, effective_to").eq("shop_id", s.id);
  console.log("charges :", JSON.stringify(costs));
  const { data: gf } = await admin.from("gateway_fees").select("gateway, rate, fixed").eq("shop_id", s.id);
  console.log("taux passerelles :", JSON.stringify(gf));
  const { data: vat } = await admin.from("shop_vat_rates").select("*").eq("shop_id", s.id);
  console.log("TVA manuelle :", JSON.stringify(vat));
  const { data: rep } = await admin.rpc("shipping_fallback_usage", { p_shop: s.id });
  console.log("repli port :", JSON.stringify(rep));
  const { data: sk } = await admin.rpc("sku_overview", { p_shop: s.id, p_actifs_seulement: true });
  const sans = ((sk ?? []) as any[]).filter((r) => Number(r.cost) === 0 && !r.exclude_from_shipping).map((r) => `${r.title} (${r.orders_count} cmd)`);
  console.log("actifs sans coût :", sans.join(" | ") || "aucun");
}
// cron
const { data: cron } = await admin.from("connectors").select("shop_id, platform, last_sync_at").order("last_sync_at", { ascending: false }).limit(3);
console.log("\ndernières synchros :", JSON.stringify(cron));
