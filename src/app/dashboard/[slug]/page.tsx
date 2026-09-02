import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { chargerSkus } from "@/lib/skus";
import {
  formaterMontant, formaterNombre, formaterPourcent,
  periodePrecedente, resoudrePeriode,
} from "@/lib/periode";
import SelecteurPeriode from "@/components/periode";
import { BarreRepartition, Colonnes, Courbe } from "@/components/charts";
import { Carte, Delta, Section } from "@/components/ui";
import { Metrique, MetriqueLigne } from "@/components/metrique";
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

type Serie = { bucket: string; orders_count: number; gross_sales: number };

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

  const [{ data: actuel }, { data: precedent }, { data: serie }, skus, { data: renouv }] =
    await Promise.all([
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
  const evo = (x: number, y: number) => (y ? ((x - y) / Math.abs(y)) * 100 : null);

  const ebitda = n(a.ebitda);
  const caHt = n(a.revenue_ht);
  const coutsTotaux =
    n(a.cogs) + n(a.transaction_fees) + n(a.ad_spend) + n(a.opex) + n(a.owner_salary);

  const repartition = [
    { label: "Coût produit", valeur: n(a.product_cost) },
    { label: "Livraison", valeur: n(a.shipping_cost) },
    { label: "Frais de transaction", valeur: n(a.transaction_fees) },
    { label: "Publicité", valeur: n(a.ad_spend) },
    { label: "Charges", valeur: n(a.opex) + n(a.owner_salary) },
  ];

  return (
    <div className="px-6 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-semibold tracking-[-0.02em] text-texte">Dashboard</h1>
          <p className="mt-0.5 text-[12.5px] text-faible">
            {boutique!.name} · {periode.libelle}
          </p>
        </div>
        <SelecteurPeriode actif={periode.preset} libelle={periode.libelle} />
      </div>

      <AlerteConnecteur renouvellements={(renouv ?? []) as Renouvellement[]} slug={slug} />

      {(sansCout > 0 || n(a.ad_spend) === 0) && (
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          {sansCout > 0 && (
            <Carte ton="alerte" className="px-4 py-2.5">
              <p className="text-[12.5px] text-alerte">
                {sansCout} produit{sansCout > 1 ? "s" : ""} actif{sansCout > 1 ? "s" : ""} sans coût —{" "}
                <Link href={`/dashboard/${slug}/cost-of-goods`} className="underline underline-offset-2">
                  marges sous-estimées
                </Link>
              </p>
            </Carte>
          )}
          {n(a.ad_spend) === 0 && (
            <Carte ton="alerte" className="px-4 py-2.5">
              <p className="text-[12.5px] text-alerte">
                Aucune dépense pub — ce profit est une marge brute.{" "}
                <Link href={`/dashboard/${slug}/integrations`} className="underline underline-offset-2">
                  Connecter Meta
                </Link>
              </p>
            </Carte>
          )}
        </div>
      )}

      {/* ── Héros ── */}
      <Carte className="px-6 py-6">
        <div className="grid gap-7 lg:grid-cols-[minmax(0,300px)_1fr] lg:items-center">
          <div>
            <p className="surtitre">Profit net · EBITDA</p>
            <p className={`heros mt-3 text-[42px] font-semibold ${ebitda < 0 ? "text-negatif" : "text-texte"}`}>
              {m(ebitda)}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Delta valeur={evo(ebitda, n(b.ebitda))} taille="md" />
              <span className="text-[11.5px] text-faible">
                contre {m(n(b.ebitda))} la période précédente
              </span>
            </div>
            <p className="mt-4 text-[12px] text-faible">
              Marge nette{" "}
              <span className="chiffres text-doux">
                {caHt > 0 ? formaterPourcent((ebitda / caHt) * 100) : "—"}
              </span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-5 gap-y-4 border-t border-bord pt-5 sm:grid-cols-3 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
            <MetriqueLigne icone="commandes" teinte="bleu" label="Commandes" valeur={formaterNombre(n(a.orders_count))} />
            <MetriqueLigne icone="argent" teinte="vert" label="Chiffre d'affaires" valeur={m(n(a.gross_sales))} />
            <MetriqueLigne icone="cout" teinte="orange" label="Coûts totaux" valeur={m(coutsTotaux)} />
            <MetriqueLigne icone="pub" teinte="rose" label="Dépense pub" valeur={m(n(a.ad_spend))} />
            <MetriqueLigne icone="panier" teinte="jaune" label="Panier moyen" valeur={n(a.orders_count) ? m(n(a.gross_sales) / n(a.orders_count)) : "—"} />
            <MetriqueLigne icone="marge" teinte="accent" label="Marge brute" valeur={m(n(a.gross_margin))} />
          </div>
        </div>
      </Carte>

      {/* ── Répartition des coûts ── */}
      <Section
        titre="Répartition des coûts"
        className="mt-3"
        action={<span className="chiffres text-[13px] text-doux">{m(coutsTotaux)}</span>}
      >
        <div className="px-5 py-5">
          <BarreRepartition parts={repartition} total={coutsTotaux} devise={devise} />
        </div>
      </Section>

      {/* ── Courbes ── */}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Section titre="Chiffre d'affaires par jour">
          <div className="px-5 py-5">
            <Courbe
              points={jours.map((j) => ({ x: j.bucket, y: Number(j.gross_sales) }))}
              unite="monnaie" devise={devise}
            />
          </div>
        </Section>
        <Section titre="Commandes par jour">
          <div className="px-5 py-5">
            <Colonnes
              points={jours.map((j) => ({ x: j.bucket, y: Number(j.orders_count) }))}
              unite="nombre"
            />
          </div>
        </Section>
      </div>

      {/* ── Acquisition ── */}
      <div className="mt-3">
        <p className="surtitre mb-2.5">Acquisition</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metrique icone="trafic" teinte="bleu" label="Sessions" valeur={formaterNombre(n(a.sessions))}
            delta={evo(n(a.sessions), n(b.sessions))} />
          <Metrique icone="panier" teinte="jaune" label="Taux d'ajout au panier"
            valeur={n(a.sessions) ? formaterPourcent((n(a.add_to_carts) / n(a.sessions)) * 100) : "—"}
            note={`${formaterNombre(n(a.add_to_carts))} ajouts`} />
          <Metrique icone="cible" teinte="vert" label="Taux de conversion"
            valeur={n(a.sessions) ? formaterPourcent((n(a.orders_count) / n(a.sessions)) * 100) : "—"} />
          <Metrique icone="profit" teinte="accent" label="Revenu par session"
            valeur={n(a.sessions) ? m(n(a.gross_sales) / n(a.sessions)) : "—"} />
          <Metrique icone="clients" teinte="rose" label="Nouveaux clients"
            valeur={formaterNombre(n(a.new_customers))}
            delta={evo(n(a.new_customers), n(b.new_customers))} />
          <Metrique icone="articles" teinte="orange" label="Articles vendus" valeur={formaterNombre(n(a.units))} />
          <Metrique icone="cible" teinte="bleu" label="ROAS blended"
            valeur={n(a.ad_spend) ? (n(a.gross_sales) / n(a.ad_spend)).toFixed(2) : "—"} />
          <Metrique icone="frais" teinte="neutre" label="ROAS seuil de rentabilité"
            valeur={caHt > 0 && n(a.gross_margin) > 0 ? (1 / (n(a.gross_margin) / caHt)).toFixed(2) : "—"}
            note="en dessous, tu perds" />
        </div>
      </div>
    </div>
  );
}
