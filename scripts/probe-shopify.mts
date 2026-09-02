import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^'|'$/g, "");
}
if (!("WebSocket" in globalThis)) { const { WebSocket } = await import("ws"); (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket; }
const { createAdminClient } = await import("../src/lib/supabase/admin");
const { decrypt } = await import("../src/lib/crypto");
const admin = createAdminClient();
const { data: shop } = await admin.from("shops").select("id, domain").eq("slug", process.argv[2]).single();
const { data: c } = await admin.from("connectors").select("creds_encrypted").eq("shop_id", shop!.id).eq("platform", "shopify").single();
const { token } = JSON.parse(decrypt(c!.creds_encrypted));
const v = process.env.SHOPIFY_API_VERSION ?? "2026-07";
for (const chemin of ["products/count.json?status=active", "products.json?limit=3&fields=id,title,status", "shopify_payments/balance/transactions.json?limit=1", "shopify_payments/payouts.json?limit=1", "shopify_payments/disputes.json?limit=1", "oauth/access_scopes.json"]) {
  const r = await fetch(`https://${shop!.domain}/admin/api/${v}/${chemin}`, { headers: { "X-Shopify-Access-Token": token } });
  const txt = await r.text();
  console.log(r.status, chemin, "→", txt.slice(0, 300));
}
