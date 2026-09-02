/** Historique complet de la depense Meta.  npx tsx scripts/backfill-meta.mts <slug> [jours] */
import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1);
}
if (!("WebSocket" in globalThis)) {
  const { WebSocket } = await import("ws");
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket;
}
const { createAdminClient } = await import("../src/lib/supabase/admin");
const { syncSpendMeta } = await import("../src/lib/sync/meta");

const slug = process.argv[2] ?? "looma";
const jours = Number(process.argv[3] ?? 400);
const admin = createAdminClient();
const { data: shop } = await admin.from("shops").select("id, name").eq("slug", slug).single();
if (!shop) { console.error("boutique introuvable"); process.exit(1); }

console.log(`Depense Meta de ${shop.name}, ${jours} derniers jours…`);
const r = await syncSpendMeta(admin, shop.id, { jours });
console.log(`${r.jours} jours importes`);
r.erreurs.forEach((e) => console.log("  -", e));

const debut = new Date(Date.now() - jours * 86400_000).toISOString().slice(0, 10);
await admin.rpc("refresh_daily_facts", {
  p_shop: shop.id, p_from: debut,
  p_to: new Date(Date.now() + 86400_000).toISOString().slice(0, 10),
});
console.log("cache rafraichi");
