import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^'|'$/g, "");
}
if (!("WebSocket" in globalThis)) { const { WebSocket } = await import("ws"); (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket; }
const { createAdminClient } = await import("../src/lib/supabase/admin");
const { decrypt } = await import("../src/lib/crypto");
const { syncProduits } = await import("../src/lib/sync/shopify");
const admin = createAdminClient();
const { data: shop } = await admin.from("shops").select("id").eq("slug", process.argv[2]).single();
const { data: c } = await admin.from("connectors").select("creds_encrypted").eq("shop_id", shop!.id).eq("platform", "shopify").single();
const creds = JSON.parse(decrypt(c!.creds_encrypted));
console.log("produits synchronises :", await syncProduits(admin as any, creds, shop!.id));
