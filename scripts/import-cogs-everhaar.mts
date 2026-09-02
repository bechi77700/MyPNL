/**
 * Couts EverHaar depuis COGS_EverHaar_v2.0.csv (EUR).
 *   port standard = "Logistique std", upsell = "Logistique upsell" (emballage inclus), pas de taxe UE.
 *   Pays absents -> repli DE (shops.fallback_country). LU/PT "a confirmer" -> is_estimated.
 *   npx tsx scripts/import-cogs-everhaar.mts          (apercu du mappage)
 *   npx tsx scripts/import-cogs-everhaar.mts --apply  (ecrit)
 */
import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^'|'$/g, "");
}
if (!("WebSocket" in globalThis)) { const { WebSocket } = await import("ws"); (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket; }
const { createAdminClient } = await import("../src/lib/supabase/admin");
const admin = createAdminClient();
const apply = process.argv.includes("--apply");
const { data: shop } = await admin.from("shops").select("id").eq("slug", "everhaar").single();
const shopId = shop!.id as string;
const { data: skus } = await admin.from("shop_skus").select("sku, title, variant_title, status").eq("shop_id", shopId);

// CSV (champs entre guillemets possibles dans la derniere colonne)
const lignes = fs.readFileSync("/Users/celinasomerville/Downloads/COGS_EverHaar_v2.0.csv", "utf8").split("\n").slice(1).filter(Boolean)
  .map((l) => l.split(",").slice(0, 5)); // marche, nom, prix, std, upsell
const perso = (t: string) => /personalis|personnalis|custom|individuell|mit namen|gravur/i.test(t);
const regles: [string, (t: string) => boolean][] = [
  ["Trennclips", (t) => /trennclip/i.test(t)],
  ["Magisches Ansatz", (t) => /ansatz/i.test(t)],
  ["Farbschutz-Conditioner (personnalisé)", (t) => /conditioner|spülung/i.test(t) && perso(t)],
  ["Farbschutz-Conditioner (non personnalisé)", (t) => /conditioner|spülung/i.test(t) && !perso(t)],
  ["5-in-1 Hairstyler", (t) => /hairstyler|5.in.1|airstyler/i.test(t)],
  ["Sofort-Farbshampoo (personnalisé)", (t) => /shampoo/i.test(t) && perso(t)],
  ["Sofort-Farbshampoo (non personnalisé)", (t) => /shampoo/i.test(t) && !perso(t)],
  ["Lederetui für GoBrush (personnalisé)", (t) => /etui|leder|case|hülle/i.test(t) && perso(t)],
  ["Lederetui für GoBrush (non personnalisé)", (t) => /etui|leder|case|hülle/i.test(t) && !perso(t)],
  ["Hitzeschutz-Spray", (t) => /hitzeschutz|heat/i.test(t)],
  ["Tragbare Glättungsbürste", (t) => /glättungsbürste|glaettungsbuerste|gobrush|bürste|brush/i.test(t)],
];
const csvNom = (prefixe: string) => lignes.find((l) => l[1].startsWith(prefixe))?.[1];
const mappage: Record<string, string[]> = {}; const sansMatch: string[] = [];
for (const s of skus ?? []) {
  const t = `${s.title} ${s.variant_title ?? ""}`;
  const r = regles.find(([, f]) => f(t));
  if (!r) { sansMatch.push(`${s.sku} · ${t} [${s.status}]`); continue; }
  const nom = csvNom(r[0].replace(" (personnalisé)", "").replace(" (non personnalisé)", "").split(" —")[0]) ? lignes.find((l) => l[1].startsWith(r[0].split(" (")[0]) && (r[0].includes("(") ? l[1].includes(r[0].includes("non") ? "non personnalisé" : "(personnalisé") : true))?.[1] : undefined;
  (mappage[nom ?? r[0]] ??= []).push(`${s.sku} · ${t} [${s.status}]`);
}
console.log("MAPPAGE produit CSV → SKUs Shopify"); for (const [k, v] of Object.entries(mappage)) { console.log(`\n${k}`); v.forEach((x) => console.log("   ", x)); }
console.log("\nSANS CORRESPONDANCE :"); sansMatch.forEach((x) => console.log("   ", x));
if (!apply) process.exit(0);

const produits: { sku: string; cost: number }[] = []; const ship: { sku: string; country: string; standard: number; upsell: number; is_estimated: boolean }[] = [];
for (const [nom, liste] of Object.entries(mappage)) {
  const lignesNom = lignes.filter((l) => l[1] === nom); if (!lignesNom.length) continue;
  for (const x of liste) {
    const sku = x.split(" · ")[0];
    produits.push({ sku, cost: Number(lignesNom[0][2]) });
    for (const [pays, , , std, up] of lignesNom) {
      if (Number.isNaN(Number(std)) || Number.isNaN(Number(up))) continue; // "A OBTENIR"
      ship.push({ sku, country: pays, standard: Number(std), upsell: Number(up), is_estimated: pays === "LU" || pays === "PT" });
    }
  }
}
await admin.from("product_costs").upsert(produits.map((p) => ({ shop_id: shopId, ...p, source: "manual" })), { onConflict: "shop_id,sku" });
await admin.from("shipping_costs").upsert(ship.map((s) => ({ shop_id: shopId, ...s })), { onConflict: "shop_id,sku,country" });
console.log(`\ncouts produit : ${produits.length}, lignes shipping : ${ship.length}`);
await admin.rpc("recompute_orders_cogs", { p_shop: shopId });
const { data: n } = await admin.rpc("refresh_daily_facts", { p_shop: shopId, p_from: "2000-01-01", p_to: new Date(Date.now() + 86400_000).toISOString().slice(0, 10) });
console.log(`recalcule, ${n} jours`);
