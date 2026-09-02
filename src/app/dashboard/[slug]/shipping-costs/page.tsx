import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { chargerSkus, nomSku } from "@/lib/skus";
import { enregistrerShipping } from "@/lib/actions/couts";
import { Bouton, Carte, EnTetePage, Message } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ShippingPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ pays?: string; ok?: string; erreur?: string }>;
}) {
  const { slug } = await params;
  const { pays: choisi, ok, erreur } = await searchParams;

  const supabase = await createClient();
  const { data: boutique } = await supabase
    .from("shops").select("id, currency").eq("slug", slug).maybeSingle();
  const shopId = boutique!.id as string;
  const devise = boutique!.currency as string;

  const [{ data: pays }, skus, { data: replis }] = await Promise.all([
    supabase.rpc("shop_countries", { p_shop: shopId }),
    chargerSkus(shopId, false),
    supabase.rpc("shipping_fallback_usage", { p_shop: shopId }),
  ]);
  const surRepli = (replis ?? []) as { zone: string; estimees: number }[];

  const listePays = (pays ?? []) as { country: string; orders_count: number }[];
  const paysActif = choisi ?? listePays[0]?.country ?? "US";

  // Uniquement les produits actifs qui s'expedient : le reste ne sert a rien ici.
  const expediables = skus.actifs.filter((s) => !s.exclude_from_shipping);

  const { data: grille } = await supabase
    .from("shipping_costs")
    .select("sku, standard, upsell")
    .eq("shop_id", shopId)
    .eq("country", paysActif);
  const parSku = new Map(
    (grille ?? []).map((g) => [g.sku as string, g as { standard: number; upsell: number }]),
  );
  const remplis = expediables.filter((s) => parSku.has(s.sku)).length;

  return (
    <div className="px-7 py-8">
      <EnTetePage
        titre="Shipping Costs"
        sous={
          <>
            <b className="text-doux">Standard</b> = le premier article du colis.{" "}
            <b className="text-doux">Upsell</b> = chaque article supplémentaire.
            <br />
            Sur une commande, le standard le plus cher s&apos;applique une seule fois ;
            tout le reste passe en upsell.
          </>
        }
      />
      <Message ok={ok} erreur={erreur} />

      {surRepli.length > 0 && (
        <Carte className="mb-5 border-alerte/30 bg-alerte/5 px-5 py-4">
          <p className="text-[13px] font-medium text-alerte">
            Tarif de repli appliqué sur {surRepli.reduce((a, r) => a + Number(r.estimees), 0)} commandes
          </p>
          <p className="mt-1 text-[13px] text-doux">
            Quand un produit n&apos;a pas de tarif pour un marché, MyPNL applique
            automatiquement celui des <b className="text-texte">États-Unis</b> plutôt que
            de laisser le COGS à zéro. Concerné :{" "}
            {surRepli.map((r) => `${r.zone} (${r.estimees})`).join(", ")}. Renseigne
            les vrais tarifs ci-dessous pour supprimer l&apos;estimation.
          </p>
        </Carte>
      )}

      <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-faible">
        Marchés et zones tarifaires — le chiffre est le nombre de commandes reçues
      </p>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {listePays.map((p) => (
          <Link
            key={p.country}
            href={`/dashboard/${slug}/shipping-costs?pays=${p.country}`}
            className={`rounded-full px-3.5 py-1.5 text-[13px] transition ${
              p.country === paysActif
                ? "bg-accent font-medium text-[#08210b]"
                : "border border-bord text-doux hover:border-bord-fort hover:text-texte"
            }`}
          >
            {p.country}
            <span className="chiffres ml-1.5 opacity-60">
              {p.orders_count.toLocaleString("fr-FR")} cmd
            </span>
          </Link>
        ))}
      </div>

      <p className="mb-4 text-[13px] text-faible">
        {remplis} / {expediables.length} produits renseignés pour {paysActif}
      </p>

      <form action={enregistrerShipping.bind(null, slug)}>
        <input type="hidden" name="pays" value={paysActif} />
        <Carte className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-carte-haut text-left surtitre">
                <tr>
                  <th className="px-5 py-3 font-medium">Produit</th>
                  <th className="px-3 py-[9px] text-right font-medium">Cmd</th>
                  <th className="px-3 py-[9px] text-right font-medium">Standard ({devise})</th>
                  <th className="px-4 py-2.5 text-right font-medium">Upsell ({devise})</th>
                </tr>
              </thead>
              <tbody>
                {expediables.map((s) => {
                  const g = parSku.get(s.sku);
                  return (
                    <tr key={s.sku} className="border-t border-bord transition-colors hover:bg-carte-haut/50">
                      <td className="px-4 py-[9px]">
                        <div className="flex items-center gap-3">
                          {s.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={s.image_url} alt="" className="size-9 shrink-0 rounded-[7px] border border-bord object-cover" />
                          ) : (
                            <div className="size-9 shrink-0 rounded-[7px] border border-bord bg-carte-haut" />
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-texte">{nomSku(s)}</p>
                            {s.variant_title && (
                              <p className="text-[11.5px] text-faible">{s.variant_title}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="chiffres px-3 py-[9px] text-right text-doux">{s.orders_count}</td>
                      <td className="px-3 py-[9px] text-right">
                        <input
                          type="number" step="0.01" min="0"
                          name={`std__${s.sku}`} defaultValue={g?.standard || ""}
                          placeholder="0.00"
                          className="chiffres w-24 rounded-[7px] border border-bord bg-fond px-2.5 py-1.5 text-right text-texte outline-none transition placeholder:text-faible focus:border-accent/60"
                        />
                      </td>
                      <td className="px-4 py-[9px] text-right">
                        <input
                          type="number" step="0.01" min="0"
                          name={`ups__${s.sku}`} defaultValue={g?.upsell || ""}
                          placeholder="0.00"
                          className="chiffres w-24 rounded-[7px] border border-bord bg-fond px-2.5 py-1.5 text-right text-texte outline-none transition placeholder:text-faible focus:border-accent/60"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Carte>
        <Bouton type="submit" className="mt-4">
          Enregistrer la grille {paysActif}
        </Bouton>
      </form>
    </div>
  );
}
