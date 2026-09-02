import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^'|'$/g, "");
}
if (!("WebSocket" in globalThis)) { const { WebSocket } = await import("ws"); (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket; }
const { createAdminClient } = await import("../src/lib/supabase/admin");
const admin = createAdminClient();
const { data: shop } = await admin.from("shops").select("id").eq("slug", "garden-gather").single();
const id = shop!.id as string;

// export TrueProfit : parse CSV avec champs multi-lignes
const brut = fs.readFileSync("/Users/celinasomerville/Downloads/trueprofit-97004781878-orders-20260803-20260902.csv", "utf8").replace(/^﻿/, "");
const lignes: string[][] = []; let champ = "", ligne: string[] = [], q = false;
for (let i = 0; i < brut.length; i++) {
  const c = brut[i];
  if (q) { if (c === '"' && brut[i + 1] === '"') { champ += '"'; i++; } else if (c === '"') q = false; else champ += c; }
  else if (c === '"') q = true;
  else if (c === ",") { ligne.push(champ); champ = ""; }
  else if (c === "\n") { ligne.push(champ); lignes.push(ligne); ligne = []; champ = ""; }
  else if (c !== "\r") champ += c;
}
if (champ || ligne.length) { ligne.push(champ); lignes.push(ligne); }
const [tete, ...corps] = lignes;
const col = (n: string) => tete.indexOf(n);
const tp = new Map(corps.filter((l) => l.length >= 6).map((l) => [l[col("ORDER CODE")].replace(/\D/g, ""), {
  ship: Number(l[col("SHIPPING COST")]), cogs: Number(l[col("TOTAL COGS")]), fee: Number(l[col("TRANSACTION FEE")]), rev: Number(l[col("REVENUE")]) }]));

const { data: cmds } = await admin.from("orders").select("order_number, country, revenue, product_cost, shipping_cost, transaction_fee, shipping_estimated").eq("shop_id", id).gte("order_day", "2026-08-03").lte("order_day", "2026-09-02");
let n = 0, sTp = 0, sNous = 0, cTp = 0, cNous = 0, fTp = 0, fNous = 0;
const ecarts: { num: string; pays: string; tp: number; nous: number; est: boolean }[] = [];
for (const o of cmds ?? []) {
  const t = tp.get(String(o.order_number).replace(/\D/g, "")); if (!t) { if (n === 0 && !ecarts.length) console.log("ex. numero MyPNL :", o.order_number); continue; }
  n++; sTp += t.ship; sNous += Number(o.shipping_cost); cTp += t.cogs; cNous += Number(o.product_cost); fTp += t.fee; fNous += Number(o.transaction_fee);
  ecarts.push({ num: String(o.order_number), pays: o.country, tp: t.ship, nous: Number(o.shipping_cost), est: o.shipping_estimated });
}
console.log(`${n} commandes appariees sur ${tp.size} TrueProfit / ${cmds?.length} MyPNL`);
console.log(`shipping  TP ${sTp.toFixed(0)}  MyPNL ${sNous.toFixed(0)}`);
console.log(`produit   TP ${cTp.toFixed(0)}  MyPNL ${cNous.toFixed(0)}`);
console.log(`frais     TP ${fTp.toFixed(0)}  MyPNL ${fNous.toFixed(0)} (reels)`);
const parPays: Record<string, [number, number, number]> = {};
for (const e of ecarts) { const p = parPays[e.pays] ??= [0, 0, 0]; p[0]++; p[1] += e.tp; p[2] += e.nous; }
console.log("\npar pays [n, TP, MyPNL] :", JSON.stringify(Object.fromEntries(Object.entries(parPays).map(([k, v]) => [k, [v[0], v[1].toFixed(0), v[2].toFixed(0)]]))));
ecarts.sort((a, b) => Math.abs(b.tp - b.nous) - Math.abs(a.tp - a.nous));
console.log("\nplus gros ecarts :"); for (const e of ecarts.slice(0, 8)) console.log(`  #${e.num} ${e.pays}${e.est ? " (estime)" : ""}  TP ${e.tp}  MyPNL ${e.nous}`);
const hist: Record<string, number> = {};
for (const e of ecarts) { const d = e.nous - e.tp; const k = Math.abs(d) < 0.5 ? "≈0" : d > 0 ? (d < 2 ? "+0.5..2" : "> +2") : (d > -2 ? "-0.5..-2" : "< -2"); hist[k] = (hist[k] ?? 0) + 1; }
console.log("\nrepartition des ecarts MyPNL - TP :", JSON.stringify(hist));
