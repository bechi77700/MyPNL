import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function VueEnsemble({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: boutique } = await supabase
    .from("shops")
    .select("id, name, currency, timezone")
    .eq("slug", slug)
    .maybeSingle();

  const { data: couverture } = await supabase.rpc("cogs_coverage", {
    p_shop: boutique!.id,
  });
  const c = couverture?.[0];

  return (
    <div className="px-8 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
        {boutique!.name}
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        {boutique!.currency} · {boutique!.timezone}
      </p>

      {c && c.avec_cout_produit === 0 && (
        <div className="mt-8 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4">
          <p className="font-medium text-amber-900">
            Ton COGS est encore à zéro.
          </p>
          <p className="mt-1 text-sm text-amber-800">
            {c.total} commandes sont importées, mais aucune n&apos;a de coût
            produit. Renseigne tes coûts dans l&apos;onglet <b>Coûts</b> pour que
            les marges deviennent réelles.
          </p>
        </div>
      )}

      <div className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-12 text-center">
        <p className="text-neutral-700">Le P&amp;L arrive.</p>
        <p className="mt-2 text-sm text-neutral-500">
          Prochaine étape après les coûts : les cartes, la cascade CA → EBITDA et
          les courbes.
        </p>
      </div>
    </div>
  );
}
