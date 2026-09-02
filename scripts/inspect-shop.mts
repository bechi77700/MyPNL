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
const { data: shops } = await admin.from("shops").select("id, slug, name, domain, currency, timezone, is_active, created_at").order("created_at");
console.log(JSON.stringify(shops, null, 1));
for (const s of shops ?? []) {
  if (s.slug === "looma") continue;
  const { count: nCmd } = await admin.from("orders").select("id", { count: "exact", head: true }).eq("shop_id", s.id);
  const { data: skus } = await admin.from("shop_skus").select("sku, title, variant_title, status, price, exclude_from_shipping").eq("shop_id", s.id).order("title");
  const { data: conn } = await admin.from("connectors").select("platform, status, last_sync_at, last_error").eq("shop_id", s.id);
  console.log(`\n== ${s.slug} : ${nCmd} commandes`, JSON.stringify(conn));
  console.table(skus ?? []);
}
