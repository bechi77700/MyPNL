import { lireCsvDepenses } from "../src/lib/csv";

const cas: [string, string][] = [
  ["Meta anglais", `Reporting starts,Reporting ends,Campaign name,Amount spent (USD),Impressions
2026-08-01,2026-08-01,Looma - Broad,"1,234.56",45012
2026-08-01,2026-08-01,Looma - LAL,"890.10",22105
2026-08-02,2026-08-02,Looma - Broad,"1,002.00",39887`],
  ["Meta francais (;)", `Jour;Nom de la campagne;Montant dépensé (USD);Impressions
01/08/2026;Looma - Broad;"1 234,56";45012
02/08/2026;Looma - Broad;"1 002,00";39887`],
  ["Google Ads (tab)", `Day\tCampaign\tCost
2026-08-01\tSearch - Brand\t$412.30
2026-08-02\tSearch - Brand\t$388.90`],
  ["dates US", `Date,Spend
08/31/2026,100.00
09/01/2026,200.00`],
];

for (const [nom, contenu] of cas) {
  try {
    const r = lireCsvDepenses(contenu);
    const total = r.lignes.reduce((a, l) => a + l.montant, 0);
    console.log(`${nom.padEnd(20)} OK   "${r.colonneDate}" / "${r.colonneMontant}"`);
    console.log(`${" ".repeat(21)}${r.lignes.length} jours, total ${total.toFixed(2)} — ${r.lignes.map((l) => `${l.date}=${l.montant}`).join("  ")}`);
  } catch (e) {
    console.log(`${nom.padEnd(20)} ECHEC : ${e instanceof Error ? e.message : e}`);
  }
}
