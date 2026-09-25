import { createClient } from "@/lib/supabase/server";
import {
  formaterMontant, formaterNombre, formaterPourcent,
  periodePrecedente, resoudrePeriode,
} from "@/lib/periode";
import BarreRapport from "@/components/barre-rapport";
import { BarreRepartition, Colonnes100 } from "@/components/charts";
import { Section, Tableau, Td, Th, Tr } from "@/components/ui";
import { couleursPaiement, libellePaiement, type LignePaiement } from "@/lib/paiements";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Jour = { day: string; method: string; orders_count: number };

// Au-dela, une colonne par jour devient illisible : on ne garde que la repartition globale.
const MAX_JOURS_GRAPHIQUE = 92;

const decale = (iso: string, n: number) =>
  new Date(new Date(iso + "T12:00:00Z").getTime() + n * 86400_000).toISOString().slice(0, 10);

/** Ecart de part en points : +2,4 pts. */
function Points({ valeur }: { valeur: number | null }) {
  if (valeur === null || !Number.isFinite(valeur) || Math.abs(valeur) < 0.05)
    return <span className="text-faible">—</span>;
  return (
    <span className={valeur > 0 ? "text-doux" : "text-faible"}>
      {valeur > 0 ? "+" : "−"}{Math.abs(valeur).toFixed(1).replace(".", ",")} pts
    </span>
  );
}

export default async function PaymentsPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ p?: string; du?: string; au?: string; t?: string }>;
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
  const nbJours = Math.round(
    (Date.parse(periode.au + "T12:00:00Z") - Date.parse(periode.du + "T12:00:00Z")) / 86400_000,
  ) + 1;
  const avecGraphique = nbJours > 1 && nbJours <= MAX_JOURS_GRAPHIQUE;

  const [{ data: actuel }, { data: precedent }, { data: parJour }, { data: conn }, { count: aDetailler }] =
    await Promise.all([
      supabase.rpc("payment_breakdown", { p_shop: shopId, p_from: periode.du, p_to: periode.au }),
      supabase.rpc("payment_breakdown", { p_shop: shopId, p_from: avant.du, p_to: avant.au }),
      avecGraphique
        ? supabase.rpc("payment_breakdown_daily", { p_shop: shopId, p_from: periode.du, p_to: periode.au })
        : Promise.resolve({ data: [] }),
      supabase.from("connectors").select("last_sync_at").eq("shop_id", shopId).eq("platform", "shopify").maybeSingle(),
      supabase.from("orders").select("id", { count: "exact", head: true })
        .eq("shop_id", shopId).eq("gateway", "shopify_payments").is("payment_method", null)
        .gte("order_day", periode.du).lte("order_day", periode.au).is("cancelled_at", null),
    ]);

  const n = (v: unknown) => Number(v ?? 0);
  const m = (v: number) => formaterMontant(v, devise, true);
  const lignes = ((actuel ?? []) as LignePaiement[]).map((l) => ({
    method: l.method, orders_count: n(l.orders_count), revenue: n(l.revenue), refunds: n(l.refunds),
  }));
  const avantParCle = new Map(((precedent ?? []) as LignePaiement[]).map((l) => [l.method, n(l.orders_count)]));
  const totalCmd = lignes.reduce((a, l) => a + l.orders_count, 0);
  const totalCa = lignes.reduce((a, l) => a + l.revenue, 0);
  const totalRemb = lignes.reduce((a, l) => a + l.refunds, 0);
  const totalAvant = [...avantParCle.values()].reduce((a, v) => a + v, 0);
  const couleurs = couleursPaiement(lignes.map((l) => l.method));

  // Jours complets (y compris sans commande) pour un axe de temps honnete.
  const valeursParJour = new Map<string, Record<string, number>>();
  for (const j of (parJour ?? []) as Jour[]) {
    const v = valeursParJour.get(j.day) ?? {};
    v[j.method] = n(j.orders_count);
    valeursParJour.set(j.day, v);
  }
  const jours: { x: string; valeurs: Record<string, number> }[] = [];
  if (avecGraphique)
    for (let d = periode.du; d <= periode.au; d = decale(d, 1))
      jours.push({ x: d, valeurs: valeursParJour.get(d) ?? {} });

  return (
    <div className="px-6 py-6">
      <div className="mb-3">
        <h1 className="text-[19px] font-semibold tracking-[-0.02em] text-texte">Moyens de paiement</h1>
        <p className="mt-0.5 text-[12.5px] text-faible">
          {boutique!.name} · {periode.libelle} · part des commandes par moyen de paiement
        </p>
      </div>
      <BarreRapport
        slug={slug} actif={periode.preset} du={periode.du} au={periode.au}
        derniereSynchro={(conn?.last_sync_at as string | null) ?? null}
      />

      <Section
        titre="Répartition des commandes"
        action={<span className="chiffres text-[13px] text-doux">{formaterNombre(totalCmd)} commandes</span>}
      >
        <div className="px-5 py-5">
          <BarreRepartition
            unite="nombre" total={totalCmd} vide="Aucune commande sur la période."
            parts={lignes.map((l) => ({
              label: libellePaiement(l.method), valeur: l.orders_count, couleur: couleurs.get(l.method),
            }))}
          />
          {n(aDetailler) > 0 && (
            <p className="mt-4 text-[11.5px] text-faible">
              {formaterNombre(n(aDetailler))} commande{n(aDetailler) > 1 ? "s" : ""} Shopify Payments pas encore
              détaillée{n(aDetailler) > 1 ? "s" : ""} (carte, Apple Pay, Klarna…) : l&apos;historique se complète
              à chaque synchro.
            </p>
          )}
        </div>
      </Section>

      {lignes.length > 0 && (
        <Section titre="Détail" className="mt-3"
          action={<span className="text-[11px] text-faible">écart : contre la période précédente</span>}>
          <div className="pb-2 pt-2">
            <Tableau>
              <thead>
                <tr className="border-b border-bord">
                  <Th>Moyen</Th>
                  <Th align="right">Commandes</Th>
                  <Th align="right">% commandes</Th>
                  <Th align="right">Écart</Th>
                  <Th align="right">CA</Th>
                  <Th align="right">% CA</Th>
                  <Th align="right">Panier moyen</Th>
                  <Th align="right">Remboursé</Th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => {
                  const part = totalCmd ? (l.orders_count / totalCmd) * 100 : 0;
                  const avantN = avantParCle.get(l.method) ?? 0;
                  const partAvant = totalAvant ? (avantN / totalAvant) * 100 : null;
                  return (
                    <Tr key={l.method}>
                      <Td>
                        <span className="flex items-center gap-2.5">
                          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: couleurs.get(l.method) }} />
                          <span className="text-texte">{libellePaiement(l.method)}</span>
                        </span>
                      </Td>
                      <Td align="right" chiffres>{formaterNombre(l.orders_count)}</Td>
                      <Td align="right" chiffres className="font-medium text-texte">{formaterPourcent(part)}</Td>
                      <Td align="right" chiffres className="text-[12px]">
                        <Points valeur={partAvant === null ? null : part - partAvant} />
                      </Td>
                      <Td align="right" chiffres>{m(l.revenue)}</Td>
                      <Td align="right" chiffres className="text-doux">
                        {totalCa ? formaterPourcent((l.revenue / totalCa) * 100) : "—"}
                      </Td>
                      <Td align="right" chiffres className="text-doux">
                        {l.orders_count ? m(l.revenue / l.orders_count) : "—"}
                      </Td>
                      <Td align="right" chiffres className="text-doux">
                        {l.refunds > 0 ? `${m(l.refunds)} · ${formaterPourcent((l.refunds / (l.revenue || 1)) * 100)}` : "—"}
                      </Td>
                    </Tr>
                  );
                })}
                <tr className="border-t border-bord-fort">
                  <Td className="font-medium text-texte">Total</Td>
                  <Td align="right" chiffres className="font-medium text-texte">{formaterNombre(totalCmd)}</Td>
                  <Td align="right" chiffres className="text-faible">100 %</Td>
                  <Td />
                  <Td align="right" chiffres className="font-medium text-texte">{m(totalCa)}</Td>
                  <Td align="right" chiffres className="text-faible">100 %</Td>
                  <Td align="right" chiffres className="text-doux">{totalCmd ? m(totalCa / totalCmd) : "—"}</Td>
                  <Td align="right" chiffres className="text-doux">
                    {totalRemb > 0 ? `${m(totalRemb)} · ${formaterPourcent((totalRemb / (totalCa || 1)) * 100)}` : "—"}
                  </Td>
                </tr>
              </tbody>
            </Tableau>
          </div>
        </Section>
      )}

      {avecGraphique && totalCmd > 0 && (
        <Section titre="Part de chaque moyen, jour par jour" className="mt-3"
          action={<span className="text-[11px] text-faible">en % des commandes du jour</span>}>
          <div className="px-5 py-5">
            <Colonnes100
              jours={jours}
              series={lignes.map((l) => ({
                cle: l.method, label: libellePaiement(l.method), couleur: couleurs.get(l.method)!,
              }))}
            />
          </div>
        </Section>
      )}
    </div>
  );
}
