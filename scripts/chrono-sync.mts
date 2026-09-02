/** Chronometre chaque etape d'une synchro INCREMENTALE, pour trouver la lente. */
import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1);
}
if (!("WebSocket" in globalThis)) {
  const { WebSocket } = await import("ws");
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket;
}
const { createAdminClient } = await import("../src/lib/supabase/admin");
const S = await import("../src/lib/sync/shopify");
const M = await import("../src/lib/sync/meta");
const admin = createAdminClient();
const { data: shop } = await admin.from("shops").select("id, timezone").eq("slug", "looma").single();
const id = shop!.id as string, tz = shop!.timezone as string;
const creds = await S.chargerCreds(admin, id);
const depuis = new Date(Date.now() - 3 * 86400_000).toISOString();

async function chrono(nom: string, fn: () => PromiseLike<unknown>) {
  const t = Date.now();
  try { const r = await fn(); console.log(`${nom.padEnd(22)} ${((Date.now() - t) / 1000).toFixed(1)}s  →`, r); }
  catch (e) { console.log(`${nom.padEnd(22)} ERREUR`, e instanceof Error ? e.message : e); }
}
await chrono("commandes (3j)", () => S.syncCommandes(admin, creds, id, depuis));
await chrono("produits", () => S.syncProduits(admin, creds, id));
await chrono("frais (3j)", () => S.syncFrais(admin, creds, id, tz, depuis));
await chrono("payouts (tout)", () => S.syncPayouts(admin, creds, id));
await chrono("litiges (tout)", () => S.syncLitiges(admin, creds, id, tz));
await chrono("sessions (30j)", () => S.syncSessions(admin, creds, id, 30));
await chrono("nouveaux clients", () => admin.rpc("recompute_new_customers", { p_shop: id }).then((r) => r.data));
await chrono("cache (21j)", () => admin.rpc("refresh_daily_facts", { p_shop: id,
  p_from: new Date(Date.now() - 21 * 86400_000).toISOString().slice(0, 10),
  p_to: new Date(Date.now() + 86400_000).toISOString().slice(0, 10) }).then((r) => r.data));
await chrono("meta (14j)", () => M.syncSpendMeta(admin, id, { jours: 14 }));
