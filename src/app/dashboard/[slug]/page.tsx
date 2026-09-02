import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { chargerSkus } from "@/lib/skus";
import {
  formaterMontant, formaterNombre, formaterPourcent,
  periodePrecedente, resoudrePeriode,
} from "@/lib/periode";
import SelecteurPeriode from "@/components/periode";
import { BarreRepartition, Colonnes, Courbe } from "@/components/charts";
import { Carte } from "@/components/ui";
import AlerteConnecteur, { type Renouvellement } from "@/components/alerte-connecteur";

export const dynamic = "force-dynamic";

type Pnl = {
  orders_count: number; units: number; new_customers: number;
  gross_sales: number; refunds: number; net_revenue: number;
  taxes: number; revenue_ht: number;
  product_cost: number; shipping_cost: number; cogs: number;
  transaction_fees: number; disputes_lost: number; cos: number;
  gross_margin: number; ad_spend: number; contribution: number;
  opex: number; owner_salary: number; ebitda: number;
  sessions: number; add_to_carts: number;
};

type Serie = {
  bucket: string; orders_count: number; gross_sales: number;
};

export default async function Dashboard({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ p?: string; du?: string; au?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  const supabase = await createClient();
  const { data: boutique } = await supabase
    .from("shops").select("id, name, currency, timezone").eq("slug", slug).maybeSingle();
  const shopId = boutique!.id as string;
  const devise = boutique!.currency as string;

  const periode = resoudrePeriode(boutique!.timezone, sp);
  const avant = periodePrecedente(periode.du, periode.au);

  const [{ data: actuel }, { data: precedent }, { data: serie }, skus, { data: renouv }] = await Promise.all([
    supabase.rpc("pnl_summary", { p_shop: shopId, p_from: periode.du, p_to: periode.au }),
    supabase.rpc("pnl_summary", { p_shop: shopId, p_from: avant.du, p_to: avant.au }),
    supabase.rpc("pnl_series", { p_shop: shopId, p_from: periode.du, p_to: periode.au, p_grain: "day" }),
    chargerSkus(shopId, false),
    supabase.rpc("connecteurs_a_renouveler", { p_shop: shopId, p_seuil_jours: 10 }),
  ]);

  const a = (actuel?.[0] ?? {}) as Partial<Pnl>;
  const b = (precedent?.[0] ?? {}) as Partial<Pnl>;
  const n = (v: unknown) => Number(v ?? 0);
  const jours = (serie ?? []) as Serie[];

  const sansCout = skus.actifs.filter((s) => s.cost === 0).length;
  const m = (v: number) => formaterMontant(v, devise, true);

  const ebitda = n(a.ebitda);
  const caHt = n(a.revenue_ht);
  const coutsTotaux = n(a.cogs) + n(a.transaction_fees) + n(a.ad_spend) + n(a.opex) + n(a.owner_salary);

  const cartes: [string, string, number | null][] = [
    ["Commandes", formaterNombre(n(a.orders_count)), evolution(n(a.orders_count), n(b.orders_count))],
    ["Chiffre d'affaires", m(n(a.gross_sales)), evolution(n(a.gross_sales), n(b.gross_sales))],
    ["Coûts totaux", m(coutsTotaux), null],
    ["Marge nette", caHt > 0 ? formaterPourcent((ebitda / caHt) * 100) : "—", null],
    ["Dépense pub", m(n(a.ad_spend)), evolution(n(a.ad_spend), n(b.ad_spend))],
    ["Panier moyen", n(a.orders_count) ? m(n(a.gross_sales) / n(a.orders_count)) : "—", null],
    ["Articles vendus", formaterNombre(n(a.units)), null],
    ["Marge brute", m(n(a.gross_margin)), evolution(n(a.gross_margin), n(b.gross_margin))],
  ];

  const repartition = [
    { label: "Coût produit", valeur: n(a.product_cost) },
    { label: "Livraison", valeur: n(a.shipping_cost) },
    { label: "Frais de transaction", valeur: n(a.transaction_fees) },
    { label: "Publicité", valeur: n(a.ad_spend) },
    { label: "Charges", valeur: n(a.opex) + n(a.owner_salary) },
  ];

  return (
    <div className="px-7 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-texte">Dashboard</h1>
          <p className="mt-1.5 text-sm text-doux">{boutique!.name} · {periode.libelle}</p>
        </div>
      </div>
      <div className="mb-6">
        <SelecteurPeriode actif={periode.preset} libelle={periode.libelle} />
      </div>

      <AlerteConnecteur renouvellements={(renouv ?? []) as Renouvellement[]} slug={slug} />

      {sansCout > 0 && (
        <Carte className="mb-4 border-alerte/30 bg-alerte/5 px-5 py-3.5">
          <p className="text-sm text-alerte">
            {sansCout} produit{sansCout > 1 ? "s" : ""} actif{sansCout > 1 ? "s" : ""} sans
            coût —{" "}
            <Link href={`/dashboard/${slug}/cost-of-goods`} className="underline underline-offset-4">
              tes marges sont sous-estimées
            </Link>
          </p>
        </Carte>
      )}
      {n(a.ad_spend) === 0 && (
        <Carte className="mb-4 border-alerte/30 bg-alerte/5 px-5 py-3.5">
          <p className="text-sm text-alerte">
            Aucune dépense publicitaire sur la période — le profit net affiché est donc
            une <b>marge brute</b>, pas un vrai résultat.{" "}
            <Link href={`/dashboard/${slug}/integrations`} className="underline underline-offset-4">
              Connecter Meta
            </Link>
          </p>
        </Carte>
      )}

      {/* Profit net en heros + metriques secondaires */}
      <Carte className="px-6 py-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr]">
          <div>
            <p className="text-sm text-doux">Profit net (EBITDA)</p>
            <p
              className={`chiffres mt-2 text-[40px] font-semibold leading-none tracking-tight ${
                ebitda < 0 ? "text-negatif" : "text-texte"
              }`}
            >
              {m(ebitda)}
            </p>
            <div className="mt-3 flex items-center gap-2.5">
              <Evolution valeur={evolution(ebitda, n(b.ebitda))} />
              <span className="text-xs text-faible">
                période précédente {m(n(b.ebitda))}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            {cartes.map(([label, valeur, evo]) => (
              <div key={label}>
                <p className="text-xs text-faible">{label}</p>
                <p className="chiffres mt-1 text-lg text-texte">{valeur}</p>
                {evo !== null && <Evolution valeur={evo} petit />}
              </div>
            ))}
          </div>
        </div>
      </Carte>

      {/* Repartition des couts */}
      <Carte className="mt-4 px-6 py-6">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-medium text-texte">Répartition des coûts</h2>
          <span className="chiffres text-sm text-doux">{m(coutsTotaux)}</span>
        </div>
        <BarreRepartition parts={repartition} total={coutsTotaux} devise={devise} />
      </Carte>

      {/* Courbes */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Carte className="px-6 py-6">
          <h2 className="mb-4 text-sm font-medium text-texte">Chiffre d&apos;affaires par jour</h2>
          <Courbe
            points={jours.map((j) => ({ x: j.bucket, y: Number(j.gross_sales) }))}
            unite="monnaie" devise={devise}
          />
        </Carte>
        <Carte className="px-6 py-6">
          <h2 className="mb-4 text-sm font-medium text-texte">Commandes par jour</h2>
          <Colonnes
            points={jours.map((j) => ({ x: j.bucket, y: Number(j.orders_count) }))}
            unite="nombre"
          />
        </Carte>
      </div>

      {/* Acquisition */}
      <Carte className="mt-4 px-6 py-6">
        <h2 className="mb-4 text-sm font-medium text-texte">Acquisition</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <Metrique label="Sessions" valeur={formaterNombre(n(a.sessions))} />
          <Metrique label="Ajouts au panier" valeur={formaterNombre(n(a.add_to_carts))} />
          <Metrique
            label="Taux d'ajout"
            valeur={n(a.sessions) ? formaterPourcent((n(a.add_to_carts) / n(a.sessions)) * 100) : "—"}
          />
          <Metrique
            label="Taux de conversion"
            valeur={n(a.sessions) ? formaterPourcent((n(a.orders_count) / n(a.sessions)) * 100) : "—"}
          />
          <Metrique
            label="Revenu par session"
            valeur={n(a.sessions) ? m(n(a.gross_sales) / n(a.sessions)) : "—"}
          />
          <Metrique label="Nouveaux clients" valeur={formaterNombre(n(a.new_customers))} />
          <Metrique
            label="ROAS blended"
            valeur={n(a.ad_spend) ? (n(a.gross_sales) / n(a.ad_spend)).toFixed(2) : "—"}
          />
          <Metrique
            label="ROAS seuil de rentabilité"
            valeur={
              caHt > 0 && n(a.gross_margin) > 0
                ? (1 / (n(a.gross_margin) / caHt)).toFixed(2)
                : "—"
            }
          />
        </div>
      </Carte>
    </div>
  );
}

function Metrique({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div>
      <p className="text-xs text-faible">{label}</p>
      <p className="chiffres mt-1 text-lg text-texte">{valeur}</p>
    </div>
  );
}

function evolution(actuel: number, avant: number): number | null {
  if (!avant) return null;
  return ((actuel - avant) / Math.abs(avant)) * 100;
}

function Evolution({ valeur, petit }: { valeur: number | null; petit?: boolean }) {
  if (valeur === null) return null;
  const positif = valeur >= 0;
  return (
    <span
      className={`chiffres mt-1 inline-block rounded-md px-1.5 py-0.5 ${petit ? "text-[11px]" : "text-xs"} ${
        positif ? "bg-accent/10 text-accent" : "bg-negatif/10 text-negatif"
      }`}
    >
      {positif ? "↑" : "↓"} {Math.abs(valeur).toFixed(1).replace(".", ",")} %
    </span>
  );
}
