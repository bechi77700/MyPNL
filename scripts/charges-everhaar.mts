import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^'|'$/g, "");
}
if (!("WebSocket" in globalThis)) { const { WebSocket } = await import("ws"); (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket; }
const { createAdminClient } = await import("../src/lib/supabase/admin");
const { recalculerBoutique } = await import("../src/lib/recalcul");
const admin = createAdminClient();
const { data: shop } = await admin.from("shops").select("id").eq("slug", "everhaar").single();
const id = shop!.id as string;

// Taux BCE du jour pour les charges facturees en dollars
const fx = (await (await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR")).json()) as { rates: { EUR: number }; date: string };
const usd = (n: number) => Math.round(n * fx.rates.EUR * 100) / 100;
console.log(`taux USD→EUR du ${fx.date} : ${fx.rates.EUR}`);

const depuis = "2026-01-01";
const charges = [
  { label: "Emailing", category: "fixed", kind: "monthly", amount: 1500, note: "1 500 € / mois" },
  { label: "Frais d'applications", category: "fixed", kind: "monthly", amount: 1000, note: "1 000 € / mois" },
  { label: "SAV", category: "partner", kind: "monthly", amount: usd(500), note: `500 $ / mois, converti au taux BCE du ${fx.date} (${fx.rates.EUR})` },
  { label: "Editing", category: "partner", kind: "monthly", amount: usd(400), note: `400 $ / mois, converti au taux BCE du ${fx.date} (${fx.rates.EUR})` },
  { label: "Créative stratégiste", category: "partner", kind: "monthly", amount: usd(2500), note: `2 500 $ / mois, converti au taux BCE du ${fx.date} (${fx.rates.EUR})` },
];
const { data: existantes } = await admin.from("costs").select("label").eq("shop_id", id);
const deja = new Set((existantes ?? []).map((c) => c.label));
const nouvelles = charges.filter((c) => !deja.has(c.label)).map((c) => ({ shop_id: id, ...c, effective_from: depuis }));
if (nouvelles.length) { const { error } = await admin.from("costs").insert(nouvelles); if (error) throw new Error(error.message); }
console.table(charges.map((c) => ({ charge: c.label, "€ / mois": c.amount })));

// Conversion PayPal EUR→HKD : 2 % uniquement sur les ventes PayPal -> ajoute au taux de la passerelle
const { error: e2 } = await admin.from("gateway_fees").update({ rate: 4.4 + 2 }).eq("shop_id", id).eq("gateway", "paypal");
if (e2) throw new Error(e2.message);
console.log("PayPal : 4,40 % + 2 % conversion = 6,40 % + 0,35 €");

const r = await recalculerBoutique(admin as any, id);
console.log(`recalcule : ${r.commandes} commandes, ${r.jours} jours`);
