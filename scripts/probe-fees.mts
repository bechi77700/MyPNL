import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^'|'$/g, "");
}
if (!("WebSocket" in globalThis)) { const { WebSocket } = await import("ws"); (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket; }
const { createAdminClient } = await import("../src/lib/supabase/admin");
const { decrypt } = await import("../src/lib/crypto");
const admin = createAdminClient();
const { data: shop } = await admin.from("shops").select("id, domain").eq("slug", "everhaar").single();
const { data: c } = await admin.from("connectors").select("creds_encrypted").eq("shop_id", shop!.id).eq("platform", "shopify").single();
const { token } = JSON.parse(decrypt(c!.creds_encrypted));
const q = `{ orders(first: 60, reverse: true, query: "financial_status:paid") { nodes { name createdAt
  totalPriceSet { shopMoney { amount currencyCode } }
  transactions(first: 5) { kind status gateway formattedGateway amountSet { shopMoney { amount } }
    fees { amount { amount currencyCode } flatFee { amount } flatFeeName rate rateName type } } } } }`;
const r = await fetch(`https://${shop!.domain}/admin/api/2026-07/graphql.json`, { method: "POST", headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
const j = await r.json();
if (j.errors) { console.log(JSON.stringify(j.errors).slice(0, 500)); process.exit(1); }
const par: Record<string, { n: number; avecFrais: number; ca: number; frais: number; ex?: string }> = {};
for (const o of j.data.orders.nodes) {
  for (const t of o.transactions) {
    if (!["SALE", "CAPTURE"].includes(t.kind) || t.status !== "SUCCESS") continue;
    const g = t.formattedGateway || t.gateway;
    const p = par[g] ??= { n: 0, avecFrais: 0, ca: 0, frais: 0 };
    p.n++; p.ca += Number(t.amountSet.shopMoney.amount);
    if (t.fees?.length) { p.avecFrais++; for (const f of t.fees) p.frais += Number(f.amount.amount); p.ex ??= `${o.name} ${t.amountSet.shopMoney.amount} € → ` + t.fees.map((f: any) => `${f.type} ${f.amount.amount} ${f.amount.currencyCode} (taux ${f.rate ?? "?"}, fixe ${f.flatFee?.amount ?? "?"})`).join(" + "); }
  }
}
for (const [g, p] of Object.entries(par)) console.log(`${g}: ${p.n} transactions, ${p.avecFrais} avec frais Shopify, CA ${p.ca.toFixed(0)} €, frais ${p.frais.toFixed(2)} (${p.ca ? (p.frais / p.ca * 100).toFixed(2) : 0} %)`, p.ex ? `\n   ex: ${p.ex}` : "");
