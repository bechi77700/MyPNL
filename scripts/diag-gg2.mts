import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^'|'$/g, "");
}
if (!("WebSocket" in globalThis)) { const { WebSocket } = await import("ws"); (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket; }
const { createAdminClient } = await import("../src/lib/supabase/admin");
const admin = createAdminClient();
const { data: shop } = await admin.from("shops").select("id").eq("slug", "garden-gather").single();
const id = shop!.id as string;
const { data: ads } = await admin.from("ad_spend").select("platform, spend, date").eq("shop_id", id).gte("date", "2026-08-03").lte("date", "2026-09-02");
const par: Record<string, number> = {};
for (const a of ads ?? []) par[a.platform] = (par[a.platform] ?? 0) + Number(a.spend);
console.log("pub 3 aout → 2 sept :", JSON.stringify(par), "jours :", new Set((ads ?? []).map((a) => a.date)).size);

const { data: cmds } = await admin.from("orders").select("shipping_zone, items").eq("shop_id", id).gte("order_day", "2026-08-03").lte("order_day", "2026-09-02");
const { data: grille } = await admin.from("shipping_costs").select("sku, country, standard, upsell").eq("shop_id", id);
const { data: skus } = await admin.from("shop_skus").select("sku, exclude_from_shipping").eq("shop_id", id);
const tarif = (sku: string, c: string) => (grille ?? []).find((g) => g.sku === sku && g.country === c) ?? (grille ?? []).find((g) => g.sku === sku && g.country === "US");
let maxSeul = 0;
for (const o of cmds ?? []) {
  const lignes = Object.keys(o.items ?? {}).filter((s) => !(skus ?? []).find((k) => k.sku === s)?.exclude_from_shipping).map((s) => tarif(s, o.shipping_zone)).filter(Boolean);
  if (lignes.length) maxSeul += Math.max(...lignes.map((t) => Number(t!.standard)));
}
console.log(`E (standard max une fois par commande, sans upsell) : ${maxSeul.toFixed(0)}  — TrueProfit 5 364`);
