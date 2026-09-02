import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  ajouterCharge,
  enregistrerProduits,
  enregistrerShipping,
  supprimerCharge,
} from "./actions";

export const dynamic = "force-dynamic";

type Sku = {
  sku: string; title: string | null; variant_title: string | null;
  exclude_from_shipping: boolean; cost: number;
  orders_count: number; units: number;
};

const CATEGORIES: [string, string][] = [
  ["wages", "Salaires"], ["partner", "Partenaires"], ["fixed", "Outils / abonnements"],
  ["shopify", "Shopify"], ["owner_salary", "Rémunération dirigeant"],
  ["exceptional", "Exceptionnel"], ["logistics", "Logistique"],
  ["payment", "Frais de paiement"], ["taxes", "Impôts et taxes"],
];
const TYPES: [string, string][] = [
  ["monthly", "par mois"], ["one_off", "ponctuel"], ["per_order", "par commande"],
  ["per_unit", "par article"], ["percent_revenue", "% du CA"],
];

export default async function CoutsPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ pays?: string; ok?: string; erreur?: string }>;
}) {
  const { slug } = await params;
  const { pays: paysChoisi, ok, erreur } = await searchParams;

  const supabase = await createClient();
  const { data: boutique } = await supabase
    .from("shops").select("id, currency").eq("slug", slug).maybeSingle();
  const shopId = boutique!.id as string;
  const devise = boutique!.currency as string;

  const [{ data: skus }, { data: pays }, { data: charges }] = await Promise.all([
    supabase.rpc("sku_overview", { p_shop: shopId }),
    supabase.rpc("shop_countries", { p_shop: shopId }),
    supabase.from("costs").select("*").eq("shop_id", shopId).order("created_at", { ascending: false }),
  ]);

  const listeSkus = (skus ?? []) as Sku[];
  const listePays = (pays ?? []) as { country: string; orders_count: number }[];
  const paysActif = paysChoisi ?? listePays[0]?.country ?? "US";

  const { data: grille } = await supabase
    .from("shipping_costs")
    .select("sku, standard, upsell")
    .eq("shop_id", shopId)
    .eq("country", paysActif);
  const parSku = new Map(
    (grille ?? []).map((g) => [g.sku as string, g as { standard: number; upsell: number }]),
  );

  const expediables = listeSkus.filter((s) => !s.exclude_from_shipping);
  const renseignes = listeSkus.filter((s) => s.cost > 0).length;

  return (
    <div className="px-8 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Coûts</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {renseignes} / {listeSkus.length} SKU ont un coût produit · {listePays.length} pays livrés
      </p>

      {ok && (
        <p className="mt-6 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {ok}
        </p>
      )}
      {erreur && (
        <p className="mt-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {erreur}
        </p>
      )}

      {/* ───────────── Coût produit ───────────── */}
      <section className="mt-10">
        <h2 className="text-lg font-medium text-neutral-900">Coût produit</h2>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500">
          Ce que te coûte chaque article, hors livraison. Identique dans tous les
          pays. Coche <b>ne s&apos;expédie pas</b> pour les produits numériques :
          ils seront ignorés dans le calcul du shipping.
        </p>

        <form action={enregistrerProduits.bind(null, slug)} className="mt-4">
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Produit</th>
                  <th className="px-4 py-2.5 text-right font-medium">Cmd</th>
                  <th className="px-4 py-2.5 text-right font-medium">Articles</th>
                  <th className="px-4 py-2.5 text-right font-medium">Coût ({devise})</th>
                  <th className="px-4 py-2.5 text-center font-medium">Ne s&apos;expédie pas</th>
                </tr>
              </thead>
              <tbody>
                {listeSkus.map((s) => (
                  <tr key={s.sku} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-2">
                      <input type="hidden" name={`skus__${s.sku}`} value="1" />
                      <span className="text-neutral-900">{s.title ?? s.sku}</span>
                      {s.variant_title && (
                        <span className="ml-2 text-neutral-500">{s.variant_title}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-neutral-500">
                      {s.orders_count}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-neutral-500">
                      {s.units}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input
                        type="number" step="0.01" min="0"
                        name={`cout__${s.sku}`} defaultValue={s.cost || ""}
                        placeholder="0.00"
                        className="w-24 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-right tabular-nums outline-none focus:border-neutral-900"
                      />
                    </td>
                    <td className="px-4 py-2 text-center">
                      <input
                        type="checkbox" name={`nolivraison__${s.sku}`}
                        defaultChecked={s.exclude_from_shipping}
                        className="size-4 accent-neutral-900"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="mt-4 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800">
            Enregistrer les coûts produit
          </button>
        </form>
      </section>

      {/* ───────────── Shipping ───────────── */}
      <section className="mt-14">
        <h2 className="text-lg font-medium text-neutral-900">Coût de livraison</h2>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500">
          <b>Standard</b> = le premier article du colis. <b>Upsell</b> = chaque
          article supplémentaire. Sur une commande, on applique une seule fois le
          standard — celui du produit dont le standard est le plus cher — et tout
          le reste passe en upsell.
        </p>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {listePays.map((p) => (
            <Link
              key={p.country}
              href={`/dashboard/${slug}/couts?pays=${p.country}`}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                p.country === paysActif
                  ? "bg-neutral-900 text-white"
                  : "border border-neutral-300 text-neutral-600 hover:border-neutral-400"
              }`}
            >
              {p.country}
              <span className="ml-1.5 opacity-60">{p.orders_count}</span>
            </Link>
          ))}
        </div>

        <form action={enregistrerShipping.bind(null, slug)} className="mt-4">
          <input type="hidden" name="pays" value={paysActif} />
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Produit</th>
                  <th className="px-4 py-2.5 text-right font-medium">Standard ({devise})</th>
                  <th className="px-4 py-2.5 text-right font-medium">Upsell ({devise})</th>
                </tr>
              </thead>
              <tbody>
                {expediables.map((s) => {
                  const g = parSku.get(s.sku);
                  return (
                    <tr key={s.sku} className="border-b border-neutral-100 last:border-0">
                      <td className="px-4 py-2">
                        <span className="text-neutral-900">{s.title ?? s.sku}</span>
                        {s.variant_title && (
                          <span className="ml-2 text-neutral-500">{s.variant_title}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <input
                          type="number" step="0.01" min="0"
                          name={`std__${s.sku}`} defaultValue={g?.standard || ""}
                          placeholder="0.00"
                          className="w-24 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-right tabular-nums outline-none focus:border-neutral-900"
                        />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <input
                          type="number" step="0.01" min="0"
                          name={`ups__${s.sku}`} defaultValue={g?.upsell || ""}
                          placeholder="0.00"
                          className="w-24 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-right tabular-nums outline-none focus:border-neutral-900"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button className="mt-4 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800">
            Enregistrer la grille {paysActif}
          </button>
        </form>
      </section>

      {/* ───────────── Charges ───────────── */}
      <section className="mt-14 pb-16">
        <h2 className="text-lg font-medium text-neutral-900">Charges</h2>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500">
          Salaires, outils, rémunération… Réparties au prorata sur la période affichée.
        </p>

        {charges && charges.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Libellé</th>
                  <th className="px-4 py-2.5 font-medium">Catégorie</th>
                  <th className="px-4 py-2.5 text-right font-medium">Montant</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Depuis</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {charges.map((c) => (
                  <tr key={c.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-2 text-neutral-900">{c.label}</td>
                    <td className="px-4 py-2 text-neutral-500">
                      {CATEGORIES.find((x) => x[0] === c.category)?.[1] ?? c.category}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-neutral-900">
                      {Number(c.amount).toLocaleString("fr-FR")} {devise}
                    </td>
                    <td className="px-4 py-2 text-neutral-500">
                      {TYPES.find((x) => x[0] === c.kind)?.[1] ?? c.kind}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-neutral-500">
                      {c.effective_from}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <form action={supprimerCharge.bind(null, slug, c.id)}>
                        <button className="text-xs text-neutral-400 transition hover:text-red-600">
                          Supprimer
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form
          action={ajouterCharge.bind(null, slug)}
          className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-4"
        >
          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">Libellé</span>
            <input
              name="label" required placeholder="Klaviyo"
              className="w-44 rounded-lg border border-neutral-300 px-2.5 py-1.5 outline-none focus:border-neutral-900"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">Catégorie</span>
            <select name="category" className="rounded-lg border border-neutral-300 px-2.5 py-1.5 outline-none focus:border-neutral-900">
              {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">Montant ({devise})</span>
            <input
              name="amount" type="number" step="0.01" min="0" required
              className="w-28 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-right tabular-nums outline-none focus:border-neutral-900"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">Type</span>
            <select name="kind" className="rounded-lg border border-neutral-300 px-2.5 py-1.5 outline-none focus:border-neutral-900">
              {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">Depuis</span>
            <input
              name="effective_from" type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="rounded-lg border border-neutral-300 px-2.5 py-1.5 outline-none focus:border-neutral-900"
            />
          </label>
          <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800">
            Ajouter
          </button>
        </form>
      </section>
    </div>
  );
}
