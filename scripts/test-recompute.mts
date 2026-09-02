import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^'|'$/g, "");
}
if (!("WebSocket" in globalThis)) { const { WebSocket } = await import("ws"); (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket; }
const { createAdminClient } = await import("../src/lib/supabase/admin");
const admin = createAdminClient();
const { data: shop } = await admin.from("shops").select("id").eq("slug", "everhaar").single();
const t0 = Date.now();
const r = await admin.rpc("recompute_orders_cogs", { p_shop: shop!.id });
console.log(`recompute : ${Math.round((Date.now() - t0) / 1000)} s →`, r.error ? `ERREUR ${r.error.code} ${r.error.message}` : `ok, ${r.data} lignes`);
const { count } = await admin.from("orders").select("id", { count: "exact", head: true }).eq("shop_id", shop!.id).eq("fee_estimated", true);
console.log("commandes avec frais estimes :", count);
