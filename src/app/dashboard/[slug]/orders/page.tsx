import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formaterMontant, formaterNombre, formaterPourcent, resoudrePeriode } from "@/lib/periode";
import BarreRapport from "@/components/barre-rapport";
import { Carte, Champ, Pastille } from "@/components/ui";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Cmd = {
  external_id: string; order_number: string; order_day: string;
  country: string | null; shipping_zone: string | null; units: number;
  revenue: number; refunded: number; vat: number;
  product_cost: number; shipping_cost: number; cogs: number;
  transaction_fee: number; profit: number; marge_pct: number | null;
  shipping_estimated: boolean; cogs_manquant: boolean;
  is_new_customer: boolean | null; total_lignes: number;
};

const PAR_PAGE = 50;

export default async function OrdersPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ p?: string; du?: string; au?: string; page?: string; q?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const recherche = (sp.q ?? "").trim();

  const supabase = await createClient();
  const { data: boutique } = await supabase
    .from("shops").select("id, name, currency, timezone").eq("slug", slug).maybeSingle();
  const shopId = boutique!.id as string;
  const devise = boutique!.currency as string;
  const periode = resoudrePeriode(boutique!.timezone, sp);

  const [{ data: lignes }, { data: totaux }, { data: conn }] = await Promise.all([
    supabase.rpc("orders_report", {
      p_shop: shopId, p_from: periode.du, p_to: periode.au,
      p_limite: PAR_PAGE, p_decalage: (page - 1) * PAR_PAGE,
      p_recherche: recherche || null,
    }),
    supabase.rpc("orders_report_totaux", {
      p_shop: shopId, p_from: periode.du, p_to: periode.au,
    }),
    supabase.from("connectors").select("last_sync_at").eq("shop_id", shopId).eq("platform", "shopify").maybeSingle(),
  ]);

  const cmds = (lignes ?? []) as Cmd[];
  const t = (totaux?.[0] ?? {}) as Record<string, number>;
  const n = (v: unknown) => Number(v ?? 0);
  const m = (v: number) => formaterMontant(v, devise, true);
  const total = cmds[0]?.total_lignes ? Number(cmds[0].total_lignes) : 0;
  const pages = Math.max(1, Math.ceil(total / PAR_PAGE));

  const lien = (p: number) => {
    const q = new URLSearchParams();
    if (sp.p) q.set("p", sp.p);
    if (sp.du) q.set("du", sp.du);
    if (sp.au) q.set("au", sp.au);
    if (recherche) q.set("q", recherche);
    q.set("page", String(p));
    return `/dashboard/${slug}/orders?${q}`;
  };

  return (
    <div className="px-7 py-8">
      <div className="mb-6">
        <h1 className="text-[19px] font-semibold tracking-[-0.02em] text-texte">Orders Report</h1>
        <p className="mt-1.5 text-[13px] text-doux">
          {boutique!.name} · {periode.libelle} · profit réel de chaque commande
        </p>
      </div>

      <BarreRapport
        slug={slug} actif={periode.preset} du={periode.du} au={periode.au}
        derniereSynchro={(conn?.last_sync_at as string | null) ?? null}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form method="get" className="ml-auto flex gap-2">
          {sp.p && <input type="hidden" name="p" value={sp.p} />}
          <Champ name="q" defaultValue={recherche} placeholder="N° de commande…" className="w-44 text-[13px]" />
        </form>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Resume label="Commandes" valeur={formaterNombre(n(t.commandes))} />
        <Resume label="CA net" valeur={m(n(t.revenue))} />
        <Resume label="COGS" valeur={m(n(t.cogs))} />
        <Resume label="Frais réels" valeur={m(n(t.frais))} />
        <Resume label="Profit avant pub" valeur={m(n(t.profit))} accent />
      </div>

      {(n(t.perdantes) > 0 || n(t.sans_cogs) > 0 || n(t.shipping_estime) > 0) && (
        <Carte className="mb-4 border-alerte/30 bg-alerte/5 px-5 py-3.5">
          <p className="text-[13px] text-alerte">
            {[
              n(t.perdantes) > 0 && `${n(t.perdantes)} commande(s) à perte`,
              n(t.sans_cogs) > 0 && `${n(t.sans_cogs)} sans COGS`,
              n(t.shipping_estime) > 0 && `${n(t.shipping_estime)} au tarif de livraison estimé`,
            ].filter(Boolean).join(" · ")}
          </p>
        </Carte>
      )}

      {cmds.length === 0 ? (
        <Carte className="border-dashed px-6 py-14 text-center">
          <p className="text-doux">Aucune commande sur cette période.</p>
        </Carte>
      ) : (
        <Carte className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-[13px]">
              <thead className="bg-carte-haut surtitre">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Commande</th>
                  <th className="px-3 py-[9px] text-left font-medium">Date</th>
                  <th className="px-3 py-[9px] text-left font-medium">Marché</th>
                  <th className="px-3 py-[9px] text-right font-medium">Art.</th>
                  <th className="px-3 py-[9px] text-right font-medium">CA net</th>
                  <th className="px-3 py-[9px] text-right font-medium">Produit</th>
                  <th className="px-3 py-[9px] text-right font-medium">Livraison</th>
                  <th className="px-3 py-[9px] text-right font-medium">Frais</th>
                  <th className="px-3 py-[9px] text-right font-medium">Profit</th>
                  <th className="px-4 py-2.5 text-right font-medium">Marge</th>
                </tr>
              </thead>
              <tbody>
                {cmds.map((c) => {
                  const perte = Number(c.profit) < 0;
                  return (
                    <tr key={c.external_id} className="border-t border-bord transition-colors hover:bg-carte-haut/50">
                      <td className="px-4 py-[9px]">
                        <span className="text-texte">{c.order_number}</span>
                        {c.is_new_customer && (
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-faible">new</span>
                        )}
                      </td>
                      <td className="chiffres px-3 py-[9px] text-doux">
                        {new Date(c.order_day + "T12:00:00Z").toLocaleDateString("fr-FR", {
                          day: "2-digit", month: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-doux">{c.shipping_zone ?? c.country ?? "—"}</span>
                        {c.shipping_estimated && (
                          <span className="ml-1.5"><Pastille ton="ambre">estimé</Pastille></span>
                        )}
                        {c.cogs_manquant && (
                          <span className="ml-1.5"><Pastille ton="ambre">sans COGS</Pastille></span>
                        )}
                      </td>
                      <td className="chiffres px-3 py-[9px] text-right text-doux">{c.units}</td>
                      <td className="chiffres px-3 py-[9px] text-right text-texte">
                        {m(Number(c.revenue) - Number(c.refunded))}
                      </td>
                      <td className="chiffres px-3 py-[9px] text-right text-faible">{m(Number(c.product_cost))}</td>
                      <td className="chiffres px-3 py-[9px] text-right text-faible">{m(Number(c.shipping_cost))}</td>
                      <td className="chiffres px-3 py-[9px] text-right text-faible">{m(Number(c.transaction_fee))}</td>
                      <td className={`chiffres px-3 py-[9px] text-right font-medium ${perte ? "text-negatif" : "text-texte"}`}>
                        {m(Number(c.profit))}
                      </td>
                      <td className={`chiffres px-4 py-[9px] text-right ${perte ? "text-negatif" : "text-doux"}`}>
                        {c.marge_pct != null ? formaterPourcent(Number(c.marge_pct), 0) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Carte>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-[13px]">
          <span className="text-faible">
            {formaterNombre(total)} commandes · page {page} sur {pages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={lien(page - 1)} className="rounded-[7px] border border-bord px-3 py-1.5 text-doux transition-colors hover:border-bord-fort hover:text-texte">
                Précédent
              </Link>
            )}
            {page < pages && (
              <Link href={lien(page + 1)} className="rounded-[7px] border border-bord px-3 py-1.5 text-doux transition-colors hover:border-bord-fort hover:text-texte">
                Suivant
              </Link>
            )}
          </div>
        </div>
      )}

      <p className="mt-4 max-w-3xl text-[11.5px] leading-relaxed text-faible">
        Le profit affiché est <b className="text-doux">avant publicité</b> : la dépense
        pub n&apos;est pas attribuable à une commande précise. Les frais de transaction
        sont les frais réels prélevés par Shopify sur cette commande.
      </p>
    </div>
  );
}

function Resume({ label, valeur, accent }: { label: string; valeur: string; accent?: boolean }) {
  return (
    <Carte className="px-4 py-3.5">
      <p className="text-[11.5px] text-faible">{label}</p>
      <p className={`chiffres mt-1 text-lg ${accent ? "text-accent" : "text-texte"}`}>{valeur}</p>
    </Carte>
  );
}
