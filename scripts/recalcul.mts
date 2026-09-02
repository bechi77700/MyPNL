/** Recalcul complet d'une boutique, par mois.  npx tsx scripts/recalcul.mts <slug> */
import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^'|'$/g, "");
}
if (!("WebSocket" in globalThis)) { const { WebSocket } = await import("ws"); (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket; }
const { createAdminClient } = await import("../src/lib/supabase/admin");
const { recalculerBoutique } = await import("../src/lib/recalcul");
const admin = createAdminClient();
const { data: shop } = await admin.from("shops").select("id").eq("slug", process.argv[2]).single();
const t0 = Date.now();
const r = await recalculerBoutique(admin as any, shop!.id);
console.log(`${process.argv[2]} : ${r.commandes} commandes, ${r.jours} jours, en ${Math.round((Date.now() - t0) / 1000)} s`);
