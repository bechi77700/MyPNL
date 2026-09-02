import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^'|'$/g, "");
}
if (!("WebSocket" in globalThis)) { const { WebSocket } = await import("ws"); (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket; }
const { createAdminClient } = await import("../src/lib/supabase/admin");
const { recalculerBoutique } = await import("../src/lib/recalcul");
const admin = createAdminClient();
const { data: shop } = await admin.from("shops").select("id").eq("slug", "looma").single();
const id = shop!.id as string;
const { data: skus } = await admin.from("shop_skus").select("sku, title, variant_title, status, exclude_from_shipping").eq("shop_id", id);
const { data: couts } = await admin.from("product_costs").select("sku, cost").eq("shop_id", id);
const coutDe = Object.fromEntries((couts ?? []).map((c) => [c.sku, Number(c.cost)]));
console.log("SKUs Looma :");
for (const s of skus ?? []) console.log(`  ${s.sku} · ${s.title}${s.variant_title ? " / " + s.variant_title : ""} [${s.status}] cout=${coutDe[s.sku] ?? "—"}${s.exclude_from_shipping ? " (numérique)" : ""}`);
const stick = (skus ?? []).filter((s) => s.sku === "44469457518695");
const pads = (skus ?? []).filter((s) => s.sku === "44407103815783");
console.log("\nstick :", stick.map((s) => `${s.sku} ${s.title}`), "\npads  :", pads.map((s) => `${s.sku} ${s.title}`));
if (!process.argv.includes("--apply")) process.exit(0);
// Hypothese : "Upsell price" inclut le prix produit, comme "Total price" (port upsell = upsell - produit)
const lignes = [
  ...stick.map((s) => ({ sku: s.sku, cost: 1.20, standard: 5.10, upsell: 1.70 - 1.20 })),
  ...pads.map((s) => ({ sku: s.sku, cost: 1.25, standard: 4.60, upsell: 2.05 - 1.25 })),
];
await admin.from("product_costs").upsert(lignes.map((l) => ({ shop_id: id, sku: l.sku, cost: l.cost, source: "manual" })), { onConflict: "shop_id,sku" });
await admin.from("shipping_costs").upsert(lignes.map((l) => ({ shop_id: id, sku: l.sku, country: "US", standard: l.standard, upsell: l.upsell, is_estimated: false })), { onConflict: "shop_id,sku,country" });
const r = await recalculerBoutique(admin as any, id);
console.log(`\napplique sur ${lignes.length} SKU, recalcul ${r.commandes} commandes`);
