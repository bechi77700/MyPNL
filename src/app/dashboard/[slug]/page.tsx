import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  formaterMontant, formaterNombre, formaterPourcent,
  periodePrecedente, resoudrePeriode,
} from "@/lib/periode";
import BarreRapport from "@/components/barre-rapport";
import { BarreRepartition, Colonnes, Courbe } from "@/components/charts";
import { Carte, Delta, Section } from "@/components/ui";
import { Metrique, MetriqueLigne } from "@/components/metrique";
import AlerteConnecteur, { type Renouvellement } from "@/components/alerte-connecteur";

export const dynamic = "force-dynamic";
// Le bouton Actualiser synchronise Shopify et Meta : jusqu'a 60 s.
export const maxDuration = 60;

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

type Serie = { bucket: string; orders_count: number; gross_sales: number; ebitda: number };

function Groupe({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3.5">
      <p className="surtitre">{titre}</p>
      {children}
    </div>
  );
}

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

  // Un seul aller-retour vers la base : toutes les donnees du tableau de bord.
  const { data: paquet } = await supabase.rpc("dashboard_data", {
    p_shop: shopId, p_from: periode.du, p_to: periode.au,
    p_prev_from: avant.du, p_prev_to: avant.au,
  });
  const d = (paquet ?? {}) as {
    actuel?: Partial<Pnl>; precedent?: Partial<Pnl>;
    serie?: Serie[]; serie_avant?: Serie[]; sans_cout?: number;
    renouvellements?: Renouvellement[]; derniere_synchro?: string | null;
  };
  const actuel = d.actuel ? [d.actuel] : [];
  const precedent = d.precedent ? [d.precedent] : [];
  const serie = d.serie ?? [];
  const serieAvant = d.serie_avant ?? [];
  const renouv = d.renouvellements ?? [];
  const conn = { last_sync_at: d.derniere_synchro ?? null };

  const a = (actuel?.[0] ?? {}) as Partial<Pnl>;
  const b = (precedent?.[0] ?? {}) as Partial<Pnl>;
  const n = (v: unknown) => Number(v ?? 0);
  const jours = (serie ?? []) as Serie[];
  const joursAvant = (serieAvant ?? []) as Serie[];

  const nbSansCout = Number(d.sans_cout ?? 0);
  const m = (v: number) => formaterMontant(v, devise, true);
  const evo = (x: number, y: number) => (y ? ((x - y) / Math.abs(y)) * 100 : null);

  const ebitda = n(a.ebitda);
  const caHt = n(a.revenue_ht);
  const roas = n(a.ad_spend) ? n(a.gross_sales) / n(a.ad_spend) : null;
  const seuil = caHt > 0 && n(a.gross_margin) > 0 ? 1 / (n(a.gross_margin) / caHt) : null;
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
      <div className="mb-3">
        <h1 className="text-[19px] font-semibold tracking-[-0.02em] text-texte">Dashboard</h1>
        <p className="mt-0.5 text-[12.5px] text-faible">
          {boutique!.name} · {periode.libelle}
        </p>
      </div>
      <BarreRapport
        slug={slug} actif={periode.preset} du={periode.du} au={periode.au}
        derniereSynchro={(conn?.last_sync_at as string | null) ?? null}
      />

      <AlerteConnecteur renouvellements={(renouv ?? []) as Renouvellement[]} slug={slug} />

      {(nbSansCout > 0 || n(a.ad_spend) === 0) && (
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          {nbSansCout > 0 && (
            <Carte ton="alerte" className="px-4 py-2.5">
              <p className="text-[12.5px] text-alerte">
                {nbSansCout} produit{nbSansCout > 1 ? "s" : ""} actif{nbSansCout > 1 ? "s" : ""} sans coût —{" "}
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
      <Carte className="relative overflow-hidden px-6 py-6">
        <div className="relative grid gap-7 lg:grid-cols-[minmax(0,320px)_1fr] lg:items-center">
          <div>
            <p className="surtitre">Profit net · EBITDA</p>
            <p className={`heros mt-3 text-[44px] font-semibold ${ebitda < 0 ? "text-negatif" : "text-texte"}`}>
              {m(ebitda)}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Delta valeur={evo(ebitda, n(b.ebitda))} taille="md" />
              <span className="text-[11.5px] text-faible">
                contre {m(n(b.ebitda))} la période précédente
              </span>
            </div>
            {/* La marge nette est le 2e chiffre regarde apres le profit : elle
                a sa propre taille et sa propre couleur, pas une ligne de bas de carte. */}
            <div className="mt-5 grid grid-cols-2 gap-4 border-t border-bord pt-4">
              <div>
                <p className="surtitre">Marge nette</p>
                <p className={`heros mt-1.5 text-[26px] font-semibold ${
                  caHt <= 0 ? "text-faible" : ebitda < 0 ? "text-negatif" : "text-accent"
                }`}>
                  {caHt > 0 ? formaterPourcent((ebitda / caHt) * 100) : "—"}
                </p>
                <p className="mt-1 text-[11px] text-faible">
                  {n(b.revenue_ht) > 0
                    ? `${formaterPourcent((n(b.ebitda) / n(b.revenue_ht)) * 100)} période précédente`
                    : "du CA hors taxes"}
                </p>
              </div>
              <div>
                <p className="surtitre">Marge brute</p>
                <p className="chiffres mt-1.5 text-[18px] font-medium text-doux">
                  {caHt > 0 ? formaterPourcent((n(a.gross_margin) / caHt) * 100) : "—"}
                </p>
                <p className="mt-1 text-[11px] text-faible">avant publicité</p>
              </div>
            </div>
          </div>

          <div className="grid gap-5 border-t border-bord pt-5 sm:grid-cols-3 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
            <Groupe titre="Ventes">
              <MetriqueLigne icone="commandes" teinte="bleu" label="Commandes" valeur={formaterNombre(n(a.orders_count))} delta={evo(n(a.orders_count), n(b.orders_count))} />
              <MetriqueLigne icone="argent" teinte="vert" label="Chiffre d'affaires" valeur={m(n(a.gross_sales))} delta={evo(n(a.gross_sales), n(b.gross_sales))} />
              <MetriqueLigne icone="panier" teinte="jaune" label="Panier moyen" valeur={n(a.orders_count) ? m(n(a.gross_sales) / n(a.orders_count)) : "—"}
                delta={n(a.orders_count) && n(b.orders_count) ? evo(n(a.gross_sales) / n(a.orders_count), n(b.gross_sales) / n(b.orders_count)) : null} />
            </Groupe>
            <Groupe titre="Coûts">
              <MetriqueLigne icone="cout" teinte="orange" label="COGS" valeur={m(n(a.cogs))} delta={evo(n(a.cogs), n(b.cogs))} inverse />
              <MetriqueLigne icone="pub" teinte="rose" label="Dépense pub" valeur={m(n(a.ad_spend))} delta={evo(n(a.ad_spend), n(b.ad_spend))} inverse />
              <MetriqueLigne icone="frais" teinte="neutre" label="Frais + charges" valeur={m(n(a.transaction_fees) + n(a.opex) + n(a.owner_salary))} />
            </Groupe>
            <Groupe titre="Résultat">
              <MetriqueLigne icone="marge" teinte="accent" label="Marge brute" valeur={m(n(a.gross_margin))} delta={evo(n(a.gross_margin), n(b.gross_margin))} />
              <MetriqueLigne icone="profit" teinte="accent" label="Contribution" valeur={m(n(a.contribution))} delta={evo(n(a.contribution), n(b.contribution))} />
              <MetriqueLigne icone="cible" teinte={roas !== null && seuil !== null ? (roas >= seuil ? "accent" : "rose") : "neutre"}
                label="ROAS blended" valeur={roas !== null ? roas.toFixed(2) : "—"} />
            </Groupe>
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
      <Section titre="Profit net par jour" className="mt-3"
        action={<span className="text-[11px] text-faible">après COGS, frais, pub et charges</span>}>
        <div className="px-5 py-5">
          <Colonnes
            points={jours.map((j) => ({ x: j.bucket, y: Number(j.ebitda) }))}
            unite="monnaie" devise={devise} hauteur={190}
          />
        </div>
      </Section>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Section titre="Chiffre d'affaires par jour">
          <div className="px-5 py-5">
            <Courbe
              points={jours.map((j) => ({ x: j.bucket, y: Number(j.gross_sales) }))}
              comparaison={joursAvant.map((j) => ({ x: j.bucket, y: Number(j.gross_sales) }))}
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
          <Metrique icone="cible"
            teinte={roas !== null && seuil !== null ? (roas >= seuil ? "accent" : "rose") : "neutre"}
            label="ROAS blended"
            valeur={roas !== null ? roas.toFixed(2) : "—"}
            note={roas !== null && seuil !== null
              ? (roas >= seuil ? "au-dessus du seuil" : "sous le seuil : tu perds")
              : undefined} />
          <Metrique icone="frais" teinte="neutre" label="ROAS seuil de rentabilité"
            valeur={seuil !== null ? seuil.toFixed(2) : "—"}
            note="le minimum pour ne pas perdre" />
        </div>
      </div>
    </div>
  );
}
