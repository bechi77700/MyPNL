/**
 * Couts Garden & Gather depuis COGS_Garden_Gather_v4.csv.
 * standard = Total (shipping + picking 1er article), upsell = Total Upsell.
 * UK -> GB. "A devis" = pas de tarif -> fallback US automatique (estime).
 *   npx tsx scripts/import-cogs-gg.mts
 */
import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^'|'$/g, "");
}
if (!("WebSocket" in globalThis)) {
  const { WebSocket } = await import("ws");
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket;
}
const { createAdminClient } = await import("../src/lib/supabase/admin");
const admin = createAdminClient();
const { data: shop } = await admin.from("shops").select("id").eq("slug", "garden-gather").single();
const shopId = shop!.id as string;

const GANTS_CLAW = ["51176360837418"];
const GENOUILLERE = ["51178515267882"];
const GATHER_GLOVE = ["51154667471146"];
const GRANGE = ["51243832508714","51243832574250","51243832541482","51243832246570","51243832213802","51243832279338"];
const WEEDER = ["GG-HOMESTEAD-WEEDER-001"];
const NUMERIQUES = ["51133172842794", "51133172908330"]; // e-guides

const csv = fs.readFileSync("/Users/celinasomerville/Downloads/COGS_Garden_Gather_v4.csv", "utf8")
  .split("\n").slice(1).filter(Boolean).map((l) => l.split(","));
const skusPour: Record<string, string[]> = {
  "The Claw Gardening Gloves - For Planting": GANTS_CLAW,
  "Extra Thick Garden Kneeling Pad": GENOUILLERE,
  "The Gather Glove": GATHER_GLOVE,
  "The Grange Carrier - Instant-Release Harvest System": GRANGE,
  "Weeder": WEEDER,
};
const produits = new Map<string, number>();
const shipping: { sku: string; country: string; standard: number; upsell: number }[] = [];
const ignores = new Set<string>();
for (const [marche, nom, prix, , , , , total, totalUp] of csv) {
  const skus = skusPour[nom];
  if (!skus) { ignores.add(nom); continue; }
  for (const sku of skus) produits.set(sku, Number(prix));
  if (Number.isNaN(Number(total))) continue; // "A devis"
  const country = marche === "UK" ? "GB" : marche;
  for (const sku of skus) shipping.push({ sku, country, standard: Number(total), upsell: Number(totalUp) });
}
console.log("produits du CSV absents de la boutique :", [...ignores]);

await admin.from("product_costs").upsert(
  [...produits].map(([sku, cost]) => ({ shop_id: shopId, sku, cost, source: "manual" }))
    .concat(NUMERIQUES.map((sku) => ({ shop_id: shopId, sku, cost: 0, source: "manual" }))),
  { onConflict: "shop_id,sku" });
await admin.from("shop_skus").update({ exclude_from_shipping: true }).eq("shop_id", shopId).in("sku", NUMERIQUES);
await admin.from("shipping_costs").upsert(
  shipping.map((s) => ({ shop_id: shopId, ...s, is_estimated: false })), { onConflict: "shop_id,sku,country" });
console.log(`couts produit : ${produits.size + NUMERIQUES.length}, lignes shipping : ${shipping.length}`);

await admin.rpc("recompute_orders_cogs", { p_shop: shopId });
const { data: n } = await admin.rpc("refresh_daily_facts", { p_shop: shopId, p_from: "2000-01-01", p_to: new Date(Date.now() + 86400_000).toISOString().slice(0, 10) });
console.log(`recalcule, ${n} jours`);
const { data: cov } = await admin.from("cogs_coverage").select("*").eq("shop_id", shopId);
console.log(JSON.stringify(cov));
const { data: fb } = await admin.from("shipping_fallback_usage").select("*").eq("shop_id", shopId);
console.log(JSON.stringify(fb));
const { data: ads } = await admin.from("ad_accounts").select("platform, account_id, name, currency, enabled").eq("shop_id", shopId);
console.log("comptes pub :", JSON.stringify(ads));
