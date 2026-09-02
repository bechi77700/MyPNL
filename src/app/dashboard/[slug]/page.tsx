import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { chargerSkus } from "@/lib/skus";
import { Carte, EnTetePage } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function VueEnsemble({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: boutique } = await supabase
    .from("shops").select("id, name, currency").eq("slug", slug).maybeSingle();
  const shopId = boutique!.id as string;

  const [{ data: couv }, skus] = await Promise.all([
    supabase.rpc("cogs_coverage", { p_shop: shopId }),
    chargerSkus(shopId, false),
  ]);
  const c = couv?.[0] as
    | { total: number; avec_cout_produit: number; avec_shipping: number; sans_sku: number }
    | undefined;
  const sansCout = skus.actifs.filter((s) => s.cost === 0).length;

  return (
    <div className="px-7 py-8">
      <EnTetePage titre={boutique!.name} sous={`${c?.total ?? 0} commandes importées`} />

      {sansCout > 0 && (
        <Carte className="border-alerte/30 bg-alerte/5 px-5 py-4">
          <p className="font-medium text-alerte">
            {sansCout} produit{sansCout > 1 ? "s" : ""} actif
            {sansCout > 1 ? "s" : ""} sans coût
          </p>
          <p className="mt-1 text-sm text-doux">
            Tant que les coûts ne sont pas saisis, tes marges sont fausses.{" "}
            <Link
              href={`/dashboard/${slug}/produits`}
              className="text-accent underline-offset-4 hover:underline"
            >
              Renseigner les prix produit
            </Link>
          </p>
        </Carte>
      )}

      <Carte className="mt-4 border-dashed px-6 py-14 text-center">
        <p className="text-doux">Le P&amp;L arrive.</p>
        <p className="mt-1.5 text-sm text-faible">
          Cartes, cascade CA → EBITDA, courbes et acquisition.
        </p>
      </Carte>
    </div>
  );
}
