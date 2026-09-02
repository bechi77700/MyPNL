/**
 * Charge la table code postal australien -> zone tarifaire, puis les tarifs AU.
 *   npx tsx scripts/import-zones-au.mts
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

// Le fichier a ete converti en JSON par le script python d'import.
const paires = JSON.parse(fs.readFileSync("scripts/data/au-zones.json", "utf8")) as [string, string][];
console.log(`codes postaux a charger : ${paires.length}`);

const lignes = paires.map(([postcode, zone]) => ({
  shop_id: shopId, country: "AU", postcode, zone,
}));
for (let i = 0; i < lignes.length; i += 1000) {
  const { error } = await admin.from("shipping_zones")
    .upsert(lignes.slice(i, i + 1000), { onConflict: "shop_id,country,postcode" });
  if (error) throw new Error(error.message);
  process.stdout.write(`\r  ${Math.min(i + 1000, lignes.length)} / ${lignes.length}`);
}
console.log("\nzones chargees");

const CREME = "44105506226279", SAVON = "44227569778791";
// [sku, zone, standard, upsell] — AU4 creme non quote : repli US automatique.
const tarifs: [string, string, number, number][] = [
  [CREME, "AU1", 4.40, 0.50],
  [CREME, "AU2", 5.70, 0.50],
  [CREME, "AU3", 10.10, 0.50],
  [SAVON, "AU1", 4.80, 0.80],
  [SAVON, "AU2", 6.10, 0.90],
  [SAVON, "AU3", 10.50, 0.80],
  [SAVON, "AU4", 11.90, 1.10],
];
const { error } = await admin.from("shipping_costs").upsert(
  tarifs.map(([sku, country, standard, upsell]) => ({
    shop_id: shopId, sku, country, standard, upsell, is_estimated: false,
  })), { onConflict: "shop_id,sku,country" });
if (error) throw new Error(error.message);
console.log(`tarifs AU : ${tarifs.length} lignes`);
