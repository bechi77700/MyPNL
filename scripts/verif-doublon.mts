import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^'|'$/g, "");
}
if (!("WebSocket" in globalThis)) { const { WebSocket } = await import("ws"); (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket; }
const { createAdminClient } = await import("../src/lib/supabase/admin");
const { decrypt } = await import("../src/lib/crypto");
const admin = createAdminClient();
const { data: shop } = await admin.from("shops").select("id, domain").eq("slug", "looma").single();
const { data: c } = await admin.from("connectors").select("creds_encrypted").eq("shop_id", shop!.id).eq("platform", "shopify").single();
const { token } = JSON.parse(decrypt(c!.creds_encrypted));
const H = { "X-Shopify-Access-Token": token };
const { products } = await (await fetch(`https://${shop!.domain}/admin/api/2026-07/products.json?status=active&limit=250&fields=id,title,handle,variants`, { headers: H })).json();
console.log("PRODUITS ACTIFS SUR SHOPIFY :");
for (const p of products) for (const v of p.variants) console.log(`  produit ${p.id} « ${p.title} » (${p.handle}) — variante ${v.id}, SKU « ${v.sku ?? "" } »`);
// commandes des 30 derniers jours : unites par produit / variante
let url: string | null = `https://${shop!.domain}/admin/api/2026-07/orders.json?status=any&limit=250&created_at_min=2026-08-10T00:00:00Z&fields=id,line_items`;
const parProduit: Record<string, { titre: string; sku: string; variante: string; unites: number }> = {};
while (url) {
  const r: Response = await fetch(url, { headers: H }); const j = await r.json();
  for (const o of j.orders) for (const li of o.line_items) {
    const k = `${li.product_id}/${li.variant_id}`;
    const e = parProduit[k] ??= { titre: li.title, sku: li.sku ?? "", variante: String(li.variant_id), unites: 0 };
    e.unites += li.quantity;
  }
  const next = r.headers.get("link")?.split(",").find((p) => p.includes('rel="next"'))?.match(/<([^>]+)>/)?.[1]; url = next ?? null;
}
console.log("\nUNITES VENDUES DEPUIS LE 10 AOUT, PAR PRODUIT/VARIANTE SHOPIFY :");
for (const [k, e] of Object.entries(parProduit).sort((a, b) => b[1].unites - a[1].unites)) console.log(`  ${k} « ${e.titre} » SKU « ${e.sku} » : ${e.unites} unités`);
// ce que MyPNL connait
const { data: skus } = await admin.from("shop_skus").select("sku, title, product_id, status").eq("shop_id", shop!.id).ilike("title", "%cream%");
console.log("\nDANS MYPNL (shop_skus, 'cream') :", JSON.stringify(skus));
const { data: couts } = await admin.from("product_costs").select("sku, cost, effective_from").eq("shop_id", shop!.id);
console.log("COUTS :", JSON.stringify(couts));
