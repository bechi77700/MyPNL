/**
 * Remplit les couts Looma depuis COGS_Looma_v1.xlsx (lu et transcrit a la main).
 * Produit + shipping standard/upsell par marche. AU en attente du zonage postal.
 *   npx tsx scripts/import-cogs-looma.mts
 */
import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1);
}
if (!("WebSocket" in globalThis)) {
  const { WebSocket } = await import("ws");
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket;
}
const { createAdminClient } = await import("../src/lib/supabase/admin");
const admin = createAdminClient();

const { data: shop } = await admin.from("shops").select("id").eq("slug", "looma").single();
const shopId = shop!.id as string;

const CREME = "44105506226279";
const SAVON = "44227569778791";
const NUMERIQUES = ["44133154553959", "44133165203559"]; // guides PDF

// cout produit, identique tous marches
const produits = [
  { sku: CREME, cost: 1.10 },
  { sku: SAVON, cost: 0.90 },
  ...NUMERIQUES.map((sku) => ({ sku, cost: 0 })),
];

// shipping : [sku, pays, standard, upsell].  UK -> code ISO 'GB' cote Shopify.
const shipping: [string, string, number, number][] = [
  [CREME, "US", 5.20, 0.90],
  [CREME, "CA", 5.00, 1.00],
  [CREME, "GB", 3.60, 0.50],
  [SAVON, "US", 5.70, 1.30],
  [SAVON, "CA", 5.70, 1.30],
  [SAVON, "GB", 5.70, 1.30],
];

await admin.from("product_costs").upsert(
  produits.map((p) => ({ shop_id: shopId, ...p, source: "manual" })),
  { onConflict: "shop_id,sku" },
);
console.log(`couts produit : ${produits.length}`);

await admin.from("shop_skus")
  .update({ exclude_from_shipping: true })
  .eq("shop_id", shopId).in("sku", NUMERIQUES);
console.log(`produits numeriques exclus du shipping : ${NUMERIQUES.length}`);

await admin.from("shipping_costs").upsert(
  shipping.map(([sku, country, standard, upsell]) => ({
    shop_id: shopId, sku, country, standard, upsell, is_estimated: false,
  })),
  { onConflict: "shop_id,sku,country" },
);
console.log(`lignes de shipping : ${shipping.length}`);

await admin.rpc("recompute_orders_cogs", { p_shop: shopId });
const { data: n } = await admin.rpc("refresh_daily_facts", {
  p_shop: shopId, p_from: "2000-01-01",
  p_to: new Date(Date.now() + 86400_000).toISOString().slice(0, 10),
});
console.log(`commandes recalculees, ${n} jours rafraichis`);
