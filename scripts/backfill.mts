/**
 * Import initial complet d'une boutique, execute depuis la machine locale
 * pour ne pas etre coupe par la limite de 60 s des fonctions Vercel.
 *   npx tsx scripts/backfill.mts <slug>
 */
import fs from "node:fs";

// Node 20 local n'a pas de WebSocket natif ; Supabase en exige un a la
// construction du client, meme si on ne se sert jamais du temps reel.
if (!("WebSocket" in globalThis)) {
  const { WebSocket } = await import("ws");
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket;
}


for (const ligne of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = ligne.indexOf("=");
  if (i > 0) process.env[ligne.slice(0, i)] ??= ligne.slice(i + 1);
}

const { createAdminClient } = await import("../src/lib/supabase/admin");
const { syncBoutique } = await import("../src/lib/sync/shopify");

const slug = process.argv[2];
if (!slug) { console.error("usage : npx tsx scripts/backfill.mts <slug>"); process.exit(1); }

const admin = createAdminClient();
const { data: shop } = await admin.from("shops").select("id, name").eq("slug", slug).single();
if (!shop) { console.error(`boutique "${slug}" introuvable`); process.exit(1); }

console.log(`Import complet de ${shop.name}…`);
const t0 = Date.now();
const res = await syncBoutique(shop.id, { complet: true });
console.log(`\nTermine en ${Math.round((Date.now() - t0) / 1000)} s`);
console.table({
  commandes: res.commandes,
  produits: res.produits,
  "jours de frais": res.jours_frais,
  versements: res.payouts,
  litiges: res.litiges,
  "jours de sessions": res.jours_sessions,
  "jours recalcules": res.jours_recalcules,
});
if (res.erreurs.length) { console.log("\nErreurs :"); res.erreurs.forEach((e) => console.log("  -", e)); }
