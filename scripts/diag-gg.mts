import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^'|'$/g, "");
}
if (!("WebSocket" in globalThis)) { const { WebSocket } = await import("ws"); (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket; }
const { createAdminClient } = await import("../src/lib/supabase/admin");
const admin = createAdminClient();
const { data: shop } = await admin.from("shops").select("id").eq("slug", "garden-gather").single();
const id = shop!.id as string;

// fenetres candidates vs TrueProfit (411 commandes, 31 528 $, 1 685 unites)
for (const [from, to] of [] as string[][]) {
  const { data } = await admin.from("orders").select("revenue, refunded, units, product_cost, shipping_cost, transaction_fee").eq("shop_id", id).gte("order_day", from).lte("order_day", to);
  const s = (k: string) => (data ?? []).reduce((a, o: any) => a + Number(o[k] ?? 0), 0);
  console.log(from, "→", to, `${data?.length} cmd, CA ${s("revenue").toFixed(0)}, remb ${s("refunded").toFixed(0)}, unites ${s("units")}, prod ${s("product_cost").toFixed(0)}, ship ${s("shipping_cost").toFixed(0)}, frais ${s("transaction_fee").toFixed(0)}`);
}

// detail des commandes de la fenetre TP : combinaisons d'articles et shipping calcule
const { data: cmds } = await admin.from("orders").select("id, order_number, country, shipping_zone, units, items, shipping_cost, shipping_estimated, product_cost").eq("shop_id", id).gte("order_day", "2026-08-03").lte("order_day", "2026-09-02");
const { data: grille } = await admin.from("shipping_costs").select("sku, country, standard, upsell").eq("shop_id", id);
const { data: skus } = await admin.from("shop_skus").select("sku, title, exclude_from_shipping").eq("shop_id", id);
const titre = Object.fromEntries((skus ?? []).map((s) => [s.sku, s.title.slice(0, 22)]));
const tarif = (sku: string, c: string) => (grille ?? []).find((g) => g.sku === sku && g.country === c) ?? (grille ?? []).find((g) => g.sku === sku && g.country === "US");

let regleA = 0, regleB = 0, regleC = 0, regleD = 0;
const parUnites: Record<number, number> = {};
const combos: Record<string, [number, number]> = {};
for (const o of cmds ?? []) {
  const brut = o.items ?? [];
  const items: { sku: string; quantity: number }[] = Array.isArray(brut)
    ? brut.map((i: any) => ({ sku: String(i.sku ?? i.variant_id ?? ""), quantity: Number(i.quantity ?? i.qty ?? 1) }))
    : Object.entries(brut as Record<string, unknown>).map(([sku, q]) => ({ sku, quantity: typeof q === "number" ? q : Number((q as any)?.quantity ?? (q as any)?.qty ?? 1) }));
  if (o === cmds![0]) console.log("format items :", JSON.stringify(brut).slice(0, 200));
  const phys = items.filter((i) => !(skus ?? []).find((s) => s.sku === i.sku)?.exclude_from_shipping);
  const lignes = phys.map((i) => ({ ...i, t: tarif(i.sku, o.shipping_zone) })).filter((l) => l.t);
  if (!lignes.length) continue;
  const stdMax = Math.max(...lignes.map((l) => Number(l.t!.standard)));
  const ancre = lignes.find((l) => Number(l.t!.standard) === stdMax)!;
  const totalUnits = lignes.reduce((a, l) => a + l.quantity, 0);
  // A = regle actuelle : max standard + chaque autre unite a SON upsell
  regleA += stdMax + lignes.reduce((a, l) => a + l.quantity * Number(l.t!.upsell), 0) - Number(ancre.t!.upsell);
  // B = standard de l'ancre + unites additionnelles a l'upsell de l'ancre
  regleB += stdMax + (totalUnits - 1) * Number(ancre.t!.upsell);
  // C = standard une fois par SKU distinct (pas d'upsell)
  regleC += lignes.reduce((a, l) => a + Number(l.t!.standard), 0);
  // D = standard x quantite (par unite, sans upsell)
  regleD += lignes.reduce((a, l) => a + l.quantity * Number(l.t!.standard), 0);
  parUnites[o.units] = (parUnites[o.units] ?? 0) + 1;
  const cle = items.map((i) => `${titre[i.sku] ?? i.sku}×${i.quantity}`).sort().join(" + ");
  const c = combos[cle] ??= [0, 0]; c[0]++; c[1] += Number(o.shipping_cost);
}
console.log("\nTrueProfit : shipping 5 364 $ pour 411 cmd (13,05 $/cmd)");
console.log(`A actuelle (max std + upsell propre) : ${regleA.toFixed(0)}`);
console.log(`B (std ancre + (n-1) x upsell ancre)  : ${regleB.toFixed(0)}`);
console.log(`C (std par SKU distinct)             : ${regleC.toFixed(0)}`);
console.log(`D (std x quantite)                   : ${regleD.toFixed(0)}`);
console.log("\ncommandes par nombre d'unites :", JSON.stringify(parUnites));
console.log("\ncombinaisons les plus frequentes [nb, shipping total] :");
for (const [k, v] of Object.entries(combos).sort((a, b) => b[1][0] - a[1][0]).slice(0, 12)) console.log(`  ${v[0]}× ${k} → ${(v[1] / v[0]).toFixed(2)} $/cmd`);

// frais : types de transactions de la fenetre
const { data: fees } = await admin.from("shop_fees_daily").select("*").eq("shop_id", id).gte("day", "2026-08-03").lte("day", "2026-09-02").limit(3);
console.log("\nexemple shop_fees_daily :", JSON.stringify(fees?.[0]));
