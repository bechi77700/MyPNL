import { createClient } from "@/lib/supabase/server";
import {
  formaterMontant, formaterNombre, formaterPourcent,
  periodePrecedente, resoudrePeriode,
} from "@/lib/periode";
import BarreRapport from "@/components/barre-rapport";
import { BarreRepartition } from "@/components/charts";
import { Carte, Pastille, Section, Tableau, Td, Th, Tr } from "@/components/ui";
import { Metrique } from "@/components/metrique";
import { libellePaiement } from "@/lib/paiements";
import {
  SEUIL_TAUX, STATUTS, libelleRaison, tauxLitiges, teinteTaux, type SyntheseLitiges,
} from "@/lib/chargebacks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Litige = {
  external_id: string; date: string; type: string; status: string; reason: string | null;
  amount: number; currency: string | null; evidence_due_by: string | null; finalized_on: string | null;
  order_external_id: string | null; order_number: string | null; payment_method: string | null;
};

const dateCourte = (iso: string) =>
  new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso)
    .toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" });

export default async function ChargebacksPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ p?: string; du?: string; au?: string; t?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  const supabase = await createClient();
  const { data: boutique } = await supabase
    .from("shops").select("id, name, currency, timezone, domain").eq("slug", slug).maybeSingle();
  const shopId = boutique!.id as string;
  const devise = boutique!.currency as string;
  const periode = resoudrePeriode(boutique!.timezone, sp);
  const avant = periodePrecedente(periode.du, periode.au);

  const [{ data: synthese }, { data: synthAvant }, { data: lignes }, { data: conn }] = await Promise.all([
    supabase.rpc("chargeback_summary", { p_shop: shopId, p_from: periode.du, p_to: periode.au }),
    supabase.rpc("chargeback_summary", { p_shop: shopId, p_from: avant.du, p_to: avant.au }),
    supabase.rpc("disputes_report", { p_shop: shopId, p_from: periode.du, p_to: periode.au }),
    supabase.from("connectors").select("last_sync_at").eq("shop_id", shopId).eq("platform", "shopify").maybeSingle(),
  ]);

  const s = (synthese ?? {}) as Partial<SyntheseLitiges>;
  const b = (synthAvant ?? {}) as Partial<SyntheseLitiges>;
  const n = (v: unknown) => Number(v ?? 0);
  const m = (v: number) => formaterMontant(v, devise, true);
  const evo = (x: number, y: number) => (y ? ((x - y) / Math.abs(y)) * 100 : null);
  const litiges = (lignes ?? []) as Litige[];
  const taux = tauxLitiges(s);
  const tauxAvant = tauxLitiges(b);
  const tranches = n(s.gagnes) + n(s.perdus);
  const lienCommande = (id: string) => `https://${boutique!.domain}/admin/orders/${id}`;

  const parRaison = new Map<string, number>();
  for (const l of litiges.filter((x) => x.type === "chargeback"))
    parRaison.set(libelleRaison(l.reason), (parRaison.get(libelleRaison(l.reason)) ?? 0) + 1);
  const raisons = [...parRaison].sort((a, c) => c[1] - a[1]).map(([label, valeur]) => ({ label, valeur }));

  return (
    <div className="px-6 py-6">
      <div className="mb-3">
        <h1 className="text-[19px] font-semibold tracking-[-0.02em] text-texte">Chargebacks</h1>
        <p className="mt-0.5 text-[12.5px] text-faible">
          {boutique!.name} · {periode.libelle} · litiges Shopify Payments, datés à l&apos;ouverture
        </p>
      </div>
      <BarreRapport
        slug={slug} actif={periode.preset} du={periode.du} au={periode.au}
        derniereSynchro={(conn?.last_sync_at as string | null) ?? null}
      />

      {!s.shopify_payments && (
        <Carte ton="alerte" className="mb-3 px-4 py-2.5">
          <p className="text-[12.5px] text-alerte">
            Aucune commande Shopify Payments sur cette boutique : Shopify ne remonte pas les litiges
            PayPal, Klarna ou Airwallex. Ils restent à suivre dans chaque plateforme.
          </p>
        </Carte>
      )}

      {n(s.a_repondre) > 0 && (
        <Carte ton="danger" className="mb-3 px-4 py-2.5">
          <p className="text-[12.5px] text-negatif">
            {n(s.a_repondre)} chargeback{n(s.a_repondre) > 1 ? "s" : ""} à contester
            {s.prochaine_echeance ? ` — prochaine échéance le ${dateCourte(s.prochaine_echeance)}` : ""}.
            Sans réponse avant l&apos;échéance, le litige est perdu d&apos;office.
          </p>
        </Carte>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metrique icone="cible" teinte={teinteTaux(taux)} label="Taux de chargeback"
          valeur={taux !== null ? formaterPourcent(taux, 2) : "—"}
          note={`repère : sous ${formaterPourcent(SEUIL_TAUX, 2)}${tauxAvant !== null ? ` · avant ${formaterPourcent(tauxAvant, 2)}` : ""}`} />
        <Metrique icone="remboursement" teinte="rose" label="Chargebacks ouverts"
          valeur={formaterNombre(n(s.ouverts))} delta={evo(n(s.ouverts), n(b.ouverts))}
          note={`${m(n(s.montant_ouverts))} contestés${n(s.demandes) ? ` · ${n(s.demandes)} demande${n(s.demandes) > 1 ? "s" : ""} d'info` : ""}`} />
        <Metrique icone="cout" teinte="orange" label="Perdus (dans le P&L)"
          valeur={m(n(s.montant_perdus))} note={`${formaterNombre(n(s.perdus))} litige${n(s.perdus) > 1 ? "s" : ""}`} />
        <Metrique icone="marge" teinte="vert" label="Taux de victoire"
          valeur={tranches ? formaterPourcent((n(s.gagnes) / tranches) * 100, 0) : "—"}
          note={`${n(s.gagnes)} gagné${n(s.gagnes) > 1 ? "s" : ""} · ${n(s.en_cours)} en cours (${m(n(s.montant_en_cours))} retenus)`} />
      </div>

      {raisons.length > 0 && (
        <Section titre="Motifs" className="mt-3">
          <div className="px-5 py-5">
            <BarreRepartition parts={raisons} total={raisons.reduce((a, r) => a + r.valeur, 0)} unite="nombre" />
          </div>
        </Section>
      )}

      <Section titre="Litiges de la période" className="mt-3"
        action={<span className="chiffres text-[13px] text-doux">{formaterNombre(litiges.length)}</span>}>
        {litiges.length === 0 ? (
          <p className="px-6 pb-5 pt-2 text-[13px] text-faible">Aucun litige sur la période.</p>
        ) : (
          <div className="pb-2 pt-2">
            <Tableau>
              <thead>
                <tr className="border-b border-bord">
                  <Th>Ouvert le</Th>
                  <Th>Commande</Th>
                  <Th>Motif</Th>
                  <Th>Paiement</Th>
                  <Th>Statut</Th>
                  <Th align="right">Montant</Th>
                  <Th align="right">Échéance / clôture</Th>
                </tr>
              </thead>
              <tbody>
                {litiges.map((l) => {
                  const st = STATUTS[l.status] ?? { label: l.status, ton: "neutre" as const };
                  return (
                    <Tr key={l.external_id}>
                      <Td chiffres className="text-doux">{dateCourte(l.date)}</Td>
                      <Td>
                        {l.order_external_id ? (
                          <a href={lienCommande(l.order_external_id)} target="_blank" rel="noreferrer"
                            className="text-texte underline-offset-2 hover:underline">
                            {l.order_number ?? `#${l.order_external_id}`}
                          </a>
                        ) : <span className="text-faible">—</span>}
                        {l.type === "inquiry" && <span className="ml-2"><Pastille>demande d&apos;info</Pastille></span>}
                      </Td>
                      <Td className="text-doux">{libelleRaison(l.reason)}</Td>
                      <Td className="text-doux">{l.payment_method ? libellePaiement(l.payment_method) : "—"}</Td>
                      <Td><Pastille ton={st.ton}>{st.label}</Pastille></Td>
                      <Td align="right" chiffres className="text-texte">
                        {formaterMontant(Number(l.amount), l.currency || devise, true)}
                      </Td>
                      <Td align="right" chiffres className={l.status === "needs_response" ? "text-alerte" : "text-faible"}>
                        {l.status === "needs_response" && l.evidence_due_by
                          ? `avant le ${dateCourte(l.evidence_due_by)}`
                          : l.finalized_on ? dateCourte(l.finalized_on) : "—"}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Tableau>
          </div>
        )}
      </Section>
    </div>
  );
}
