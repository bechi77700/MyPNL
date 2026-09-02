/** Import d'un export Ads Manager par jour, memes regles que l'ecran Integrations.
 *  npx tsx scripts/import-csv-pub.mts <slug> <plateforme> <fichier.csv> */
import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1);
}
if (!("WebSocket" in globalThis)) {
  const { WebSocket } = await import("ws");
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket;
}
const { createAdminClient } = await import("../src/lib/supabase/admin");
const { lireCsvDepenses } = await import("../src/lib/csv");
const [slug, plateforme, fichier] = process.argv.slice(2);
const admin = createAdminClient();
const { data: shop } = await admin.from("shops").select("id").eq("slug", slug).single();
const shopId = shop!.id as string;

const parse = lireCsvDepenses(fs.readFileSync(fichier!, "utf8"));
const debut = parse.lignes[0].date, fin = parse.lignes.at(-1)!.date;

// Les jours deja remplis par l'API restent intacts.
const { data: api } = await admin.from("ad_spend").select("date")
  .eq("shop_id", shopId).eq("platform", plateforme).eq("source", "api").gte("date", debut).lte("date", fin);
const protegees = new Set((api ?? []).map((r) => r.date as string));
const retenues = parse.lignes.filter((l) => !protegees.has(l.date) && l.montant > 0);

const { error } = await admin.from("ad_spend").upsert(
  retenues.map((l) => ({ shop_id: shopId, date: l.date, platform: plateforme, amount: l.montant,
    source: "manual", updated_at: new Date().toISOString() })),
  { onConflict: "shop_id,date,platform" });
if (error) throw new Error(error.message);
await admin.rpc("refresh_daily_facts", { p_shop: shopId, p_from: debut, p_to: fin });

const total = retenues.reduce((a, l) => a + l.montant, 0);
console.log(`${retenues.length} jours importes, ${Math.round(total).toLocaleString("fr-FR")} $ · ${protegees.size} jour(s) API conserve(s) · cache rafraichi`);
