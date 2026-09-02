import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formaterMontant, formaterPourcent, aujourdhui } from "@/lib/periode";
import { Carte, EnTetePage, Pastille } from "@/components/ui";

export const dynamic = "force-dynamic";

type Mois = {
  bucket: string; gross_sales: number; revenue_ht: number;
  cogs: number; transaction_fees: number; gross_margin: number;
  ad_spend: number; contribution: number; opex: number;
  owner_salary: number; ebitda: number;
};

/** Santé des charges de structure, en % du CA HT. */
function sante(pct: number): [string, "vert" | "ambre" | "neutre", string] {
  if (pct < 5) return ["Très bas", "ambre", "Soit tu sous-investis en structure, soit des charges ne sont pas saisies."];
  if (pct <= 13) return ["Sain", "vert", "Zone confortable pour une marque en croissance."];
  if (pct <= 16) return ["Tendu", "ambre", "Surveille : la structure commence à peser sur le résultat."];
  return ["Trop lourd", "neutre", "Tes charges fixes absorbent une part critique de la marge."];
}

export default async function PlanningPage({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: boutique } = await supabase
    .from("shops").select("id, name, currency, timezone").eq("slug", slug).maybeSingle();
  const devise = boutique!.currency as string;

  const auj = aujourdhui(boutique!.timezone);
  const [an, mo] = auj.split("-").map(Number);
  const debut = new Date(Date.UTC(an, mo - 7, 1)).toISOString().slice(0, 10);

  const [{ data }, { count: nbCharges }] = await Promise.all([
    supabase.rpc("pnl_series", { p_shop: boutique!.id, p_from: debut, p_to: auj, p_grain: "month" }),
    supabase.from("costs").select("id", { count: "exact", head: true }).eq("shop_id", boutique!.id),
  ]);
  const mois = (data ?? []) as Mois[];
  const aucuneCharge = (nbCharges ?? 0) === 0;

  const m = (v: number) => formaterMontant(v, devise, true);
  const n = (v: unknown) => Number(v ?? 0);

  const cumul = mois.reduce(
    (a, x) => ({
      caHt: a.caHt + n(x.revenue_ht),
      cogs: a.cogs + n(x.cogs),
      frais: a.frais + n(x.transaction_fees),
      margeBrute: a.margeBrute + n(x.gross_margin),
      pub: a.pub + n(x.ad_spend),
      contribution: a.contribution + n(x.contribution),
      opex: a.opex + n(x.opex),
      remuneration: a.remuneration + n(x.owner_salary),
      ebitda: a.ebitda + n(x.ebitda),
    }),
    { caHt: 0, cogs: 0, frais: 0, margeBrute: 0, pub: 0, contribution: 0, opex: 0, remuneration: 0, ebitda: 0 },
  );

  const pct = (v: number) => (cumul.caHt > 0 ? (v / cumul.caHt) * 100 : 0);
  const pctOpex = pct(cumul.opex + cumul.remuneration);
  const [etat, ton, explication] = sante(pctOpex);

  const cascade: [string, number, boolean][] = [
    ["CA hors taxes", cumul.caHt, false],
    ["COGS", -cumul.cogs, true],
    ["Frais de transaction", -cumul.frais, true],
    ["Marge brute", cumul.margeBrute, false],
    ["Publicité", -cumul.pub, true],
    ["Contribution", cumul.contribution, false],
    ["Charges de structure", -(cumul.opex + cumul.remuneration), true],
    ["EBITDA", cumul.ebitda, false],
  ];

  return (
    <div className="px-7 py-8">
      <EnTetePage
        titre="Planning"
        sous={`${boutique!.name} · structure de marge sur les 6 derniers mois`}
      />

      <Carte className="px-6 py-6">
        <h2 className="mb-4 text-[13px] font-medium text-texte">Du CA hors taxes à l&apos;EBITDA</h2>
        <div className="space-y-1.5">
          {cascade.map(([label, valeur, cout]) => {
            const p = pct(Math.abs(valeur));
            const total = !cout;
            return (
              <div key={label} className="flex items-center gap-4">
                <span className={`w-48 shrink-0 text-[13px] ${total ? "font-medium text-texte" : "text-doux"}`}>
                  {label}
                </span>
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-carte-haut">
                  <div
                    className={`h-full rounded-full ${
                      total ? "bg-accent" : "bg-[#d95926]"
                    }`}
                    style={{ width: `${Math.min(100, p)}%` }}
                  />
                </div>
                <span className={`chiffres w-28 shrink-0 text-right text-[13px] ${
                  valeur < 0 && total ? "text-negatif" : total ? "text-texte" : "text-faible"
                }`}>
                  {m(valeur)}
                </span>
                <span className="chiffres w-16 shrink-0 text-right text-[11.5px] text-faible">
                  {formaterPourcent(p, 0)}
                </span>
              </div>
            );
          })}
        </div>
      </Carte>

      <Carte className="mt-4 px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[13px] font-medium text-texte">Poids des charges fixes dans le CA</h2>
            <p className="mt-1 text-[12px] text-faible">
              Salaires + partenaires + outils + Shopify, divisés par le CA hors taxes.
              Combien de chaque euro vendu part dans la structure.
            </p>
          </div>
          <span className="flex items-center gap-2.5">
            <span className={`chiffres text-[22px] font-semibold ${aucuneCharge ? "text-faible" : "text-texte"}`}>
              {formaterPourcent(pctOpex)}
            </span>
            {!aucuneCharge && <Pastille ton={ton}>{etat}</Pastille>}
          </span>
        </div>

        {aucuneCharge ? (
          <div className="mt-4 rounded-[9px] border border-alerte/25 bg-alerte/[0.06] px-4 py-3">
            <p className="text-[13px] text-alerte">Aucune charge saisie — cet indicateur n&apos;a pas encore de sens.</p>
            <p className="mt-1 text-[12.5px] text-doux">
              Renseigne tes abonnements, salaires et rémunération dans{" "}
              <Link href={`/dashboard/${slug}/custom-costs`} className="text-accent underline underline-offset-2">Custom Costs</Link>
              {" "}et il te dira si ta structure est saine, tendue ou trop lourde.
            </p>
          </div>
        ) : (
          <>
            {/* Jauge a zones nommees : on lit la zone, pas un chiffre isole. */}
            <div className="relative mt-5 flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full">
              {[
                ["0", "5", "bg-alerte/40", "trop bas"],
                ["5", "13", "bg-accent/50", "sain"],
                ["13", "16", "bg-alerte/40", "tendu"],
                ["16", "25", "bg-negatif/45", "trop lourd"],
              ].map(([a, b, cls]) => (
                <div key={a} className={`${cls} rounded-full`} style={{ width: `${((Number(b) - Number(a)) / 25) * 100}%` }} />
              ))}
              <div
                className="absolute top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-texte shadow-[0_0_8px_rgb(255_255_255/0.6)]"
                style={{ left: `calc(${Math.min(99, (pctOpex / 25) * 100)}% - 1px)` }}
              />
            </div>
            <div className="mt-1.5 grid grid-cols-4 text-[10.5px] text-faible">
              <span>trop bas · 0–5 %</span>
              <span>sain · 5–13 %</span>
              <span>tendu · 13–16 %</span>
              <span className="text-right">trop lourd · &gt; 16 %</span>
            </div>
            <p className="mt-3 max-w-2xl text-[13px] text-doux">{explication}</p>
          </>
        )}
      </Carte>

      <Carte className="mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-[13px]">
            <thead className="bg-carte-haut surtitre">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Mois</th>
                <th className="px-4 py-2.5 text-right font-medium">CA HT</th>
                <th className="px-4 py-2.5 text-right font-medium">Marge brute</th>
                <th className="px-4 py-2.5 text-right font-medium">Taux</th>
                <th className="px-4 py-2.5 text-right font-medium">Contribution</th>
                <th className="px-4 py-2.5 text-right font-medium">EBITDA</th>
              </tr>
            </thead>
            <tbody>
              {mois.map((x) => {
                const ht = n(x.revenue_ht);
                return (
                  <tr key={x.bucket} className="border-t border-bord">
                    <td className="px-4 py-[9px] text-doux">
                      {new Date(x.bucket + "T12:00:00Z").toLocaleDateString("fr-FR", {
                        month: "long", year: "numeric",
                      })}
                    </td>
                    <td className="chiffres px-4 py-[9px] text-right text-texte">{m(ht)}</td>
                    <td className="chiffres px-4 py-[9px] text-right text-doux">{m(n(x.gross_margin))}</td>
                    <td className="chiffres px-4 py-[9px] text-right text-faible">
                      {ht > 0 ? formaterPourcent((n(x.gross_margin) / ht) * 100, 0) : "—"}
                    </td>
                    <td className="chiffres px-4 py-[9px] text-right text-doux">{m(n(x.contribution))}</td>
                    <td className={`chiffres px-4 py-[9px] text-right font-medium ${
                      n(x.ebitda) < 0 ? "text-negatif" : "text-texte"
                    }`}>
                      {m(n(x.ebitda))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Carte>
    </div>
  );
}
