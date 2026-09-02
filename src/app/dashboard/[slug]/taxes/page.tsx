import { createClient } from "@/lib/supabase/server";
import { enregistrerTaxes } from "@/lib/actions/couts";
import { Bouton, Carte, EnTetePage, Message } from "@/components/ui";

export const dynamic = "force-dynamic";

const MODES: [string, string, string][] = [
  ["none", "Aucune taxe", "Rien n'est déduit du chiffre d'affaires. C'est le réglage par défaut."],
  ["shopify", "Ce que Shopify a collecté", "On déduit exactement le montant de taxes que Shopify déclare avoir encaissé sur chaque commande."],
  ["manual", "Taux que je saisis", "On applique tes taux, pays par pays, sur des prix TTC : taxe = montant × taux / (1 + taux)."],
];

export default async function TaxesPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const { slug } = await params;
  const { ok, erreur } = await searchParams;

  const supabase = await createClient();
  const { data: boutique } = await supabase
    .from("shops").select("id, currency, tax_mode").eq("slug", slug).maybeSingle();
  const shopId = boutique!.id as string;
  const mode = (boutique!.tax_mode as string) ?? "none";

  const [{ data: pays }, { data: saisis }, { data: catalogue }] = await Promise.all([
    supabase.rpc("shop_countries", { p_shop: shopId }),
    supabase.from("shop_vat_rates").select("country, rate").eq("shop_id", shopId),
    supabase.from("vat_rates").select("country, rate"),
  ]);

  // Les zones tarifaires (AU1…) sont ramenees au pays pour la fiscalite.
  const listePays = [
    ...new Set(
      ((pays ?? []) as { country: string }[]).map((p) => p.country.replace(/[0-9]+$/, "")),
    ),
  ].sort();

  const actuels = new Map(
    ((saisis ?? []) as { country: string; rate: number }[]).map((r) => [r.country, Number(r.rate) * 100]),
  );
  const suggeres = new Map(
    ((catalogue ?? []) as { country: string; rate: number }[]).map((r) => [r.country, Number(r.rate) * 100]),
  );

  return (
    <div className="px-7 py-8">
      <EnTetePage
        titre="Taxes"
        sous="Rien n'est déduit tant que tu ne le demandes pas. Par défaut, la taxe est à zéro."
      />
      <Message ok={ok} erreur={erreur} />

      <form action={enregistrerTaxes.bind(null, slug)}>
        <Carte className="px-5 py-5">
          <p className="mb-3 text-[13px] font-medium text-texte">Comment traiter les taxes</p>
          <div className="space-y-2">
            {MODES.map(([v, titre, desc]) => (
              <label
                key={v}
                className="flex cursor-pointer gap-3 rounded-[10px] bg-carte-haut px-4 py-3 transition-colors hover:border-bord-fort"
              >
                <input
                  type="radio" name="mode" value={v} defaultChecked={mode === v}
                  className="mt-0.5 size-4 shrink-0 accent-[#3b7bff]"
                />
                <span className="min-w-0">
                  <span className="block text-[13px] text-texte">{titre}</span>
                  <span className="mt-0.5 block text-[11.5px] leading-relaxed text-faible">{desc}</span>
                </span>
              </label>
            ))}
          </div>
        </Carte>

        <Carte className="mt-3 px-5 py-5">
          <p className="text-[13px] font-medium text-texte">Taux par pays</p>
          <p className="mt-1 max-w-2xl text-[11.5px] leading-relaxed text-faible">
            Utilisés uniquement si tu choisis « Taux que je saisis ». Laisse vide pour
            ne rien déduire sur ce pays. Le taux indicatif est le taux usuel du pays —
            il n&apos;est jamais appliqué tout seul.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {listePays.map((p) => (
              <label key={p} className="flex items-center gap-3 rounded-[10px] bg-carte-haut px-3.5 py-2.5">
                <span className="w-8 shrink-0 text-[13px] text-texte">{p}</span>
                <input
                  type="number" step="0.1" min="0" max="100"
                  name={`taux__${p}`}
                  defaultValue={actuels.get(p) ?? ""}
                  placeholder="0"
                  className="chiffres w-20 rounded-full bg-carte-haut px-2.5 py-1.5 text-right text-texte outline-none transition placeholder:text-faible focus:border-accent/60"
                />
                <span className="text-[13px] text-faible">%</span>
                {suggeres.has(p) && (
                  <span className="ml-auto text-[11px] text-faible">
                    usuel {suggeres.get(p)!.toFixed(1).replace(".", ",")} %
                  </span>
                )}
              </label>
            ))}
          </div>
        </Carte>

        <Bouton type="submit" className="mt-4">Enregistrer</Bouton>
      </form>
    </div>
  );
}
