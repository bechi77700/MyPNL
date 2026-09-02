/** Passe COMPLETE des frais (une fois) : pose le curseur since_id pour les passages incrementaux. */
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
const admin = createAdminClient();
const { data: shop } = await admin.from("shops").select("id, timezone").eq("slug", process.argv[2] ?? "looma").single();
const creds = await S.chargerCreds(admin, shop!.id);
const t = Date.now();
const n = await S.syncFrais(admin, creds, shop!.id, shop!.timezone);
const { data: c } = await admin.from("connectors").select("sync_cursor").eq("shop_id", shop!.id).eq("platform", "shopify").single();
console.log(`passe complete : ${n} jours en ${((Date.now() - t) / 1000).toFixed(1)}s · curseur =`, c?.sync_cursor);
