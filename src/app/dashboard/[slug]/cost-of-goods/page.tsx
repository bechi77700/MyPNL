import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { chargerSkus, nomSku, type Sku } from "@/lib/skus";
import { enregistrerProduits } from "@/lib/actions/couts";
import { Bouton, Carte, EnTetePage, Message, Pastille } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ProduitsPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string; voir?: string }>;
}) {
  const { slug } = await params;
  const { ok, erreur, voir } = await searchParams;
  const tout = voir === "tout";

  const supabase = await createClient();
  const { data: boutique } = await supabase
    .from("shops").select("id, currency").eq("slug", slug).maybeSingle();
  const { visibles, actifs, inactifsVendus } = await chargerSkus(boutique!.id, tout);
  const devise = boutique!.currency as string;
  const manquants = visibles.filter((s) => s.cost === 0).length;

  return (
    <div className="px-7 py-8">
      <EnTetePage
        titre="Cost of Goods"
        sous={
          <>
            Ce que te coûte chaque article, hors livraison. Identique dans tous les pays.
            <br />
            {actifs.length} produits actifs · {manquants > 0
              ? <span className="text-alerte">{manquants} sans coût</span>
              : <span className="text-accent">tous renseignés</span>}
          </>
        }
      />
      <Message ok={ok} erreur={erreur} />

      <form action={enregistrerProduits.bind(null, slug)}>
        <input type="hidden" name="voir" value={voir ?? ""} />
        <Carte className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-carte-haut text-left surtitre">
                <tr>
                  <th className="px-5 py-3 font-medium">Produit</th>
                  <th className="px-3 py-[9px] text-right font-medium">Cmd</th>
                  <th className="px-3 py-[9px] text-right font-medium">Articles</th>
                  <th className="px-3 py-[9px] text-right font-medium">Prix</th>
                  <th className="px-3 py-[9px] text-right font-medium">Coût ({devise})</th>
                  <th className="px-5 py-3 text-center font-medium">Ne s&apos;expédie pas</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((s: Sku) => (
                  <tr key={s.sku} className="border-t border-bord transition-colors hover:bg-carte-haut/50">
                    <td className="px-4 py-[9px]">
                      <input type="hidden" name={`skus__${s.sku}`} value="1" />
                      <div className="flex items-center gap-3">
                        {s.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.image_url} alt="" className="size-9 shrink-0 rounded-[7px] border border-bord object-cover" />
                        ) : (
                          <div className="size-9 shrink-0 rounded-[7px] border border-bord bg-carte-haut" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-texte">{nomSku(s)}</p>
                          <p className="flex items-center gap-2 text-[11.5px] text-faible">
                            {s.variant_title && <span>{s.variant_title}</span>}
                            {s.status && s.status !== "active" && (
                              <Pastille ton="ambre">
                                {s.status === "draft" ? "brouillon" : "archivé"}
                              </Pastille>
                            )}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="chiffres px-3 py-[9px] text-right text-doux">{s.orders_count}</td>
                    <td className="chiffres px-3 py-[9px] text-right text-doux">{s.units}</td>
                    <td className="chiffres px-3 py-[9px] text-right text-faible">
                      {s.price != null ? Number(s.price).toFixed(2) : "—"}
                    </td>
                    <td className="px-3 py-[9px] text-right">
                      <input
                        type="number" step="0.01" min="0"
                        name={`cout__${s.sku}`} defaultValue={s.cost || ""}
                        placeholder="0.00"
                        className="chiffres w-24 rounded-[7px] border border-bord bg-fond px-2.5 py-1.5 text-right text-texte outline-none transition placeholder:text-faible focus:border-accent/60"
                      />
                    </td>
                    <td className="px-4 py-[9px] text-center">
                      <input
                        type="checkbox" name={`nolivraison__${s.sku}`}
                        defaultChecked={s.exclude_from_shipping}
                        className="size-4 accent-[#34d399]"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Carte>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Bouton type="submit">Enregistrer</Bouton>
          {inactifsVendus.length > 0 && (
            <Link
              href={`/dashboard/${slug}/produits${tout ? "" : "?voir=tout"}`}
              className="text-[13px] text-doux underline-offset-4 transition-colors hover:text-texte hover:underline"
            >
              {tout
                ? "Masquer les brouillons"
                : `Afficher aussi ${inactifsVendus.length} brouillons qui ont vendu`}
            </Link>
          )}
        </div>
      </form>

      <p className="mt-6 max-w-2xl text-[11.5px] leading-relaxed text-faible">
        Coche <b className="text-doux">ne s&apos;expédie pas</b> pour les produits
        numériques (guides, ebooks). Sans ça, chaque exemplaire vendu ajouterait un
        tarif de livraison qui n&apos;existe pas.
      </p>
    </div>
  );
}
