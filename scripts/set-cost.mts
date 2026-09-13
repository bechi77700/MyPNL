/** npx tsx scripts/set-cost.mts <slug> <sku> <cout> <pays> <standard> <upsell> [estime] */
import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^'|'$/g, "");
}
if (!("WebSocket" in globalThis)) { const { WebSocket } = await import("ws"); (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket; }
const { createAdminClient } = await import("../src/lib/supabase/admin");
const { recalculerBoutique } = await import("../src/lib/recalcul");
const admin = createAdminClient();
const [slug, sku, cout, pays, standard, upsell, estime] = process.argv.slice(2);
const { data: shop } = await admin.from("shops").select("id").eq("slug", slug).single();
const e1 = (await admin.from("product_costs").upsert({ shop_id: shop!.id, sku, cost: Number(cout), effective_from: "2000-01-01", source: "manual" }, { onConflict: "shop_id,sku,effective_from" })).error;
const e2 = (await admin.from("shipping_costs").upsert({ shop_id: shop!.id, sku, country: pays, standard: Number(standard), upsell: Number(upsell), is_estimated: estime === "estime", effective_from: "2000-01-01" }, { onConflict: "shop_id,sku,country,effective_from" })).error;
if (e1 || e2) throw new Error(String(e1?.message ?? e2?.message));
const r = await recalculerBoutique(admin as any, shop!.id);
console.log(`${slug} ${sku} : cout ${cout}, port ${pays} ${standard}/${upsell}${estime === "estime" ? " (standard estime)" : ""} — ${r.commandes} commandes recalculees`);
