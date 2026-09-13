import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^'|'$/g, "");
}
if (!("WebSocket" in globalThis)) { const { WebSocket } = await import("ws"); (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket; }
const { createAdminClient } = await import("../src/lib/supabase/admin");
const admin = createAdminClient();
const [slug, sku] = process.argv.slice(2);
const { data: shop } = await admin.from("shops").select("id").eq("slug", slug).single();
const { data: c } = await admin.from("product_costs").select("cost, effective_from").eq("shop_id", shop!.id).eq("sku", sku);
const { data: s } = await admin.from("shipping_costs").select("country, standard, upsell, effective_from").eq("shop_id", shop!.id).eq("sku", sku);
console.log("cout produit :", JSON.stringify(c)); console.log("port :", JSON.stringify(s));
