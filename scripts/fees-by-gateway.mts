import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^'|'$/g, "");
}
if (!("WebSocket" in globalThis)) { const { WebSocket } = await import("ws"); (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket; }
const { createAdminClient } = await import("../src/lib/supabase/admin");
const { recalculerBoutique } = await import("../src/lib/recalcul");
const admin = createAdminClient();
for (const slug of ["looma", "garden-gather"]) {
  const { data: shop } = await admin.from("shops").select("id").eq("slug", slug).single();
  const { data: c } = await admin.from("orders").select("gateway, transaction_fee, revenue").eq("shop_id", shop!.id).gte("order_day", "2026-06-04").range(0, 9999);
  const agg: Record<string, [number, number, number, number]> = {};
  for (const o of c ?? []) { const a = agg[o.gateway ?? "?"] ??= [0, 0, 0, 0]; a[0]++; a[1] += Number(o.revenue); a[2] += Number(o.transaction_fee); if (Number(o.transaction_fee) === 0) a[3]++; }
  console.log(`\n${slug} (90 j) :`);
  for (const [g, a] of Object.entries(agg)) console.log(`  ${g}: ${a[0]} cmd, CA ${a[1].toFixed(0)}, frais ${a[2].toFixed(0)} (${(a[2] / a[1] * 100).toFixed(2)} %), sans frais : ${a[3]}`);
}
// TwistJet sur Garden & Gather : CSG v4 (port = shipping + picking)
const { data: gg } = await admin.from("shops").select("id").eq("slug", "garden-gather").single();
const { data: tj } = await admin.from("shop_skus").select("sku, title").eq("shop_id", gg!.id).ilike("title", "%TwistJet%");
if (tj?.length) {
  const grille = [["US", 4.42 + 0.35, 0.89 + 0.15], ["GB", 2.99 + 0.35, 0.48 + 0.15], ["CA", 4.40 + 0.35, 0.72 + 0.15], ["AU", 4.78 + 0.35, 0.51 + 0.15]] as const;
  await admin.from("product_costs").upsert(tj.map((t) => ({ shop_id: gg!.id, sku: t.sku, cost: 0.84, source: "manual" })), { onConflict: "shop_id,sku" });
  await admin.from("shipping_costs").upsert(tj.flatMap((t) => grille.map(([country, standard, upsell]) => ({ shop_id: gg!.id, sku: t.sku, country, standard: Math.round(standard * 100) / 100, upsell: Math.round(upsell * 100) / 100, is_estimated: false }))), { onConflict: "shop_id,sku,country" });
  const r = await recalculerBoutique(admin as any, gg!.id);
  console.log(`\nTwistJet : ${tj.length} variante(s) ${tj.map((t) => t.sku).join(",")} — coûts appliqués, ${r.commandes} commandes recalculées`);
}
