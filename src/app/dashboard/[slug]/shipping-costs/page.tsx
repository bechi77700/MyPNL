import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { chargerSkus, nomSku } from "@/lib/skus";
import { enregistrerShipping } from "@/lib/actions/couts";
import { Carte, EnTetePage, Message } from "@/components/ui";
import FormulaireSuivi from "@/components/formulaire-suivi";

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

  // Une ligne par PRODUIT : les variantes (couleurs, fiches en doublon) partagent
  // le meme tarif, comme dans les grilles des agents. La cle ignore la ponctuation
  // pour fusionner "Marque - Produit" et "Marque Produit".
  const cleProduit = (s: (typeof expediables)[number]) =>
    (s.product_title ?? s.title ?? s.sku).toLowerCase().replace(/[^a-z0-9äöüß]+/g, "");
  const groupes = new Map<string, (typeof expediables)>();
  for (const s of expediables) {
    const k = cleProduit(s);
    groupes.set(k, [...(groupes.get(k) ?? []), s]);
  }
  const lignesProduits = [...groupes.values()].map((variantes, i) => {
    const tarifs = variantes.map((v) => parSku.get(v.sku));
    const std = new Set(tarifs.map((t) => (t ? Number(t.standard).toFixed(2) : "")));
    const ups = new Set(tarifs.map((t) => (t ? Number(t.upsell).toFixed(2) : "")));
    return {
      i, tete: variantes[0], variantes,
      commandes: variantes.reduce((a, v) => a + Number(v.orders_count), 0),
      standard: std.size === 1 ? [...std][0] : null,
      upsell: ups.size === 1 ? [...ups][0] : null,
      mixte: std.size > 1 || ups.size > 1,
    };
  });

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
                ? "bg-accent font-medium text-white"
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
        {remplis} / {expediables.length} variantes renseignées pour {paysActif}, regroupées en {lignesProduits.length} produits
      </p>

      <FormulaireSuivi
        action={enregistrerShipping.bind(null, slug)}
        libelleBouton={`Enregistrer la grille ${paysActif}`}
        champsCaches={<input type="hidden" name="pays" value={paysActif} />}
      >
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
                {lignesProduits.map((l) => {
                  const s = l.tete;
                  const cls = "chiffres w-24 rounded-[10px] bg-carte-haut px-2.5 py-1.5 text-right text-texte outline-none transition placeholder:text-faible focus:border-accent/60";
                  return (
                    <tr key={l.i} className="border-t border-bord transition-colors hover:bg-carte-haut/50">
                      <td className="px-4 py-[9px]">
                        <div className="flex items-center gap-3">
                          {s.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={s.image_url} alt="" className="size-9 shrink-0 rounded-[7px] border border-bord object-cover" />
                          ) : (
                            <div className="size-9 shrink-0 rounded-full bg-carte-haut-haut" />
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-texte">{s.product_title ?? nomSku(s)}</p>
                            <p className="text-[11.5px] text-faible">
                              {l.variantes.length > 1
                                ? `${l.variantes.length} variantes, même tarif`
                                : s.variant_title ?? "1 variante"}
                              {l.mixte && <span className="ml-1.5 text-alerte">tarifs différents entre variantes, ressaisis pour unifier</span>}
                            </p>
                          </div>
                        </div>
                        <input type="hidden" name={`skus__grp__${l.i}`} value={l.variantes.map((v) => v.sku).join(",")} />
                      </td>
                      <td className="chiffres px-3 py-[9px] text-right text-doux">{l.commandes}</td>
                      <td className="px-3 py-[9px] text-right">
                        <input type="number" step="0.01" min="0" name={`std__grp__${l.i}`} defaultValue={l.standard ?? ""} placeholder={l.mixte ? "variable" : "0,00"} lang="fr" className={cls} />
                      </td>
                      <td className="px-4 py-[9px] text-right">
                        <input type="number" step="0.01" min="0" name={`ups__grp__${l.i}`} defaultValue={l.upsell ?? ""} placeholder={l.mixte ? "variable" : "0,00"} lang="fr" className={cls} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Carte>
      </FormulaireSuivi>
    </div>
  );
}
