import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formaterMontant, formaterPourcent, resoudrePeriode } from "@/lib/periode";
import SelecteurPeriode from "@/components/periode";
import { Carte } from "@/components/ui";

export const dynamic = "force-dynamic";

type Ligne = {
  bucket: string; orders_count: number;
  gross_sales: number; refunds: number; net_revenue: number; taxes: number;
  revenue_ht: number; product_cost: number; shipping_cost: number; cogs: number;
  transaction_fees: number; disputes_lost: number; ad_spend: number;
  gross_margin: number; contribution: number;
  opex: number; owner_salary: number; ebitda: number;
};

type Poste = {
  label: string;
  cle: keyof Ligne;
  cout?: boolean;   // affiché entre parenthèses, en négatif
  total?: boolean;  // sous-total mis en avant
  indent?: boolean;
};

const POSTES: Poste[] = [
  { label: "Chiffre d'affaires", cle: "gross_sales" },
  { label: "Remboursements", cle: "refunds", cout: true },
  { label: "CA net", cle: "net_revenue", total: true },
  { label: "Taxes et TVA", cle: "taxes", cout: true },
  { label: "CA hors taxes", cle: "revenue_ht", total: true },
  { label: "Coût produit", cle: "product_cost", cout: true, indent: true },
  { label: "Livraison", cle: "shipping_cost", cout: true, indent: true },
  { label: "COGS", cle: "cogs", cout: true },
  { label: "Frais de transaction", cle: "transaction_fees", cout: true },
  { label: "Marge brute", cle: "gross_margin", total: true },
  { label: "Dépense publicitaire", cle: "ad_spend", cout: true },
  { label: "Contribution", cle: "contribution", total: true },
  { label: "Charges et litiges", cle: "opex", cout: true },
  { label: "Profit net (EBITDA)", cle: "ebitda", total: true },
  { label: "Rémunération dirigeant", cle: "owner_salary", cout: true },
];

export default async function PnlPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ p?: string; du?: string; au?: string; grain?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const grain = sp.grain === "day" ? "day" : "month";

  const supabase = await createClient();
  const { data: boutique } = await supabase
    .from("shops").select("id, name, currency, timezone").eq("slug", slug).maybeSingle();
  const devise = boutique!.currency as string;
  const periode = resoudrePeriode(boutique!.timezone, sp);

  const { data } = await supabase.rpc("pnl_series", {
    p_shop: boutique!.id, p_from: periode.du, p_to: periode.au, p_grain: grain,
  });
  const lignes = (data ?? []) as Ligne[];

  const total = POSTES.reduce((acc, p) => {
    acc[p.cle] = lignes.reduce((s, l) => s + Number(l[p.cle] ?? 0), 0);
    return acc;
  }, {} as Record<string, number>);
  const caHtTotal = total.revenue_ht ?? 0;

  const m = (v: number, cout?: boolean) =>
    cout && v !== 0
      ? `(${formaterMontant(Math.abs(v), devise, true)})`
      : formaterMontant(v, devise, true);

  const enTete = (b: string) =>
    grain === "month"
      ? new Date(b + "T12:00:00Z").toLocaleDateString("fr-FR", { month: "short", year: "2-digit" })
      : new Date(b + "T12:00:00Z").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });

  const lienGrain = (g: string) => {
    const q = new URLSearchParams();
    if (sp.p) q.set("p", sp.p);
    if (sp.du) q.set("du", sp.du);
    if (sp.au) q.set("au", sp.au);
    q.set("grain", g);
    return `/dashboard/${slug}/pnl?${q}`;
  };

  return (
    <div className="px-7 py-8">
      <div className="mb-6">
        <h1 className="text-[19px] font-semibold tracking-[-0.02em] text-texte">P&amp;L Report</h1>
        <p className="mt-1.5 text-[13px] text-doux">{boutique!.name} · {periode.libelle}</p>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <SelecteurPeriode actif={periode.preset} libelle={periode.libelle} />
        <span className="text-bord">|</span>
        <div className="flex gap-1.5">
          {[["month", "Par mois"], ["day", "Par jour"]].map(([g, label]) => (
            <Link
              key={g}
              href={lienGrain(g)}
              className={`rounded-full px-3 py-1.5 text-[13px] transition ${
                g === grain
                  ? "bg-carte-haut font-medium text-texte"
                  : "border border-bord text-doux hover:border-bord-fort hover:text-texte"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {lignes.length === 0 ? (
        <Carte className="border-dashed px-6 py-14 text-center">
          <p className="text-doux">Aucune donnée sur cette période.</p>
        </Carte>
      ) : (
        <Carte className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-[13px]">
              <thead>
                <tr className="bg-carte-haut surtitre">
                  <th className="sticky left-0 z-10 bg-carte-haut px-4 py-2.5 text-left font-medium">
                    Poste
                  </th>
                  {lignes.map((l) => (
                    <th key={l.bucket} className="px-4 py-2.5 text-right font-medium">
                      {enTete(l.bucket)}
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-right font-medium text-doux">Total</th>
                  <th className="px-4 py-2.5 text-right font-medium">% CA HT</th>
                </tr>
              </thead>
              <tbody>
                {POSTES.map((p) => {
                  const t = total[p.cle] ?? 0;
                  return (
                    <tr
                      key={p.label}
                      className={`border-t border-bord ${
                        p.total ? "bg-carte-haut/40" : ""
                      }`}
                    >
                      <td
                        className={`sticky left-0 z-10 px-4 py-[9px] ${
                          p.total ? "bg-carte-haut font-medium text-texte" : "bg-carte text-doux"
                        } ${p.indent ? "pl-9" : ""}`}
                      >
                        {p.label}
                      </td>
                      {lignes.map((l) => {
                        const v = Number(l[p.cle] ?? 0);
                        return (
                          <td
                            key={l.bucket}
                            className={`chiffres px-4 py-2.5 text-right ${
                              p.cout ? "text-faible" : p.total ? "text-texte" : "text-doux"
                            } ${p.total && v < 0 ? "text-negatif" : ""}`}
                          >
                            {m(v, p.cout)}
                          </td>
                        );
                      })}
                      <td
                        className={`chiffres px-4 py-[9px] text-right font-medium ${
                          p.total && t < 0 ? "text-negatif" : "text-texte"
                        }`}
                      >
                        {m(t, p.cout)}
                      </td>
                      <td className="chiffres px-4 py-[9px] text-right text-faible">
                        {caHtTotal ? formaterPourcent((t / caHtTotal) * 100) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Carte>
      )}

      <p className="mt-4 max-w-3xl text-[11.5px] leading-relaxed text-faible">
        Les montants entre parenthèses sont des coûts. Les pourcentages sont
        rapportés au <b className="text-doux">CA hors taxes</b>. Les charges
        mensuelles sont réparties au prorata des jours de chaque colonne — la somme
        des colonnes égale exactement le total.
      </p>
    </div>
  );
}
