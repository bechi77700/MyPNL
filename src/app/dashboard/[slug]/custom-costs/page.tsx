import { createClient } from "@/lib/supabase/server";
import { ajouterCharge, supprimerCharge } from "@/lib/actions/couts";
import { Bouton, Carte, Champ, EnTetePage, Message } from "@/components/ui";

export const dynamic = "force-dynamic";

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

export default async function ChargesPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string; label?: string; category?: string; kind?: string; amount?: string }>;
}) {
  const { slug } = await params;
  const { ok, erreur, label: preLabel, category: preCat, kind: preKind, amount: preMontant } = await searchParams;
  const EXEMPLES: [string, string, string, string][] = [
    ["Shopify Advanced", "shopify", "monthly", "399"],
    ["Klaviyo", "fixed", "monthly", "150"],
    ["Comptable", "partner", "monthly", "200"],
    ["Ma rémunération", "owner_salary", "monthly", "3000"],
    ["Freelance créa", "partner", "one_off", "500"],
    ["Emballage", "logistics", "per_order", "0.35"],
  ];
  const lienExemple = (e: [string, string, string, string]) =>
    `/dashboard/${slug}/custom-costs?${new URLSearchParams({ label: e[0], category: e[1], kind: e[2], amount: e[3] })}#ajouter`;

  const supabase = await createClient();
  const { data: boutique } = await supabase
    .from("shops").select("id, currency").eq("slug", slug).maybeSingle();
  const devise = boutique!.currency as string;

  const { data: charges } = await supabase
    .from("costs").select("*").eq("shop_id", boutique!.id)
    .order("created_at", { ascending: false });

  const mensuel = (charges ?? [])
    .filter((c) => c.kind === "monthly")
    .reduce((a, c) => a + Number(c.amount), 0);

  const cls = "rounded-[10px] bg-carte-haut px-3 py-2 text-texte outline-none transition focus:border-accent/60";

  return (
    <div className="px-7 py-8">
      <EnTetePage
        titre="Custom Costs"
        sous={
          <>
            Salaires, outils, rémunération. Réparties au prorata de la période affichée.
            {mensuel > 0 && (
              <>
                <br />
                <span className="chiffres text-texte">
                  {mensuel.toLocaleString("fr-FR")} {devise}
                </span>{" "}
                de charges mensuelles récurrentes
              </>
            )}
          </>
        }
      />
      <Message ok={ok} erreur={erreur} />

      {charges && charges.length > 0 ? (
        <Carte className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-carte-haut text-left surtitre">
                <tr>
                  <th className="px-5 py-3 font-medium">Libellé</th>
                  <th className="px-3 py-3 font-medium">Catégorie</th>
                  <th className="px-3 py-[9px] text-right font-medium">Montant</th>
                  <th className="px-3 py-3 font-medium">Type</th>
                  <th className="px-3 py-3 font-medium">Depuis</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {charges.map((c) => (
                  <tr key={c.id} className="border-t border-bord transition-colors hover:bg-carte-haut/50">
                    <td className="px-4 py-[9px] text-texte">{c.label}</td>
                    <td className="px-3 py-[9px] text-doux">
                      {CATEGORIES.find((x) => x[0] === c.category)?.[1] ?? c.category}
                    </td>
                    <td className="chiffres px-3 py-[9px] text-right text-texte">
                      {Number(c.amount).toLocaleString("fr-FR")} {devise}
                    </td>
                    <td className="px-3 py-[9px] text-doux">
                      {TYPES.find((x) => x[0] === c.kind)?.[1] ?? c.kind}
                    </td>
                    <td className="chiffres px-3 py-[9px] text-faible">{c.effective_from}</td>
                    <td className="px-4 py-[9px] text-right">
                      <form action={supprimerCharge.bind(null, slug, c.id)}>
                        <button className="text-[11.5px] text-faible transition-colors hover:text-negatif">
                          Supprimer
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Carte>
      ) : (
        <Carte className="relative overflow-hidden px-6 py-10 text-center">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(420px_140px_at_50%_0%,rgb(45_202_2/0.12),transparent_70%)]" />
          <p className="text-[14px] font-medium text-texte">Aucune charge enregistrée</p>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] text-faible">
            Tant que tes charges ne sont pas saisies, le profit net est surévalué.
            Commence par un exemple, tu ajusteras le montant.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {EXEMPLES.map((e) => (
              <a key={e[0]} href={lienExemple(e)}
                className="btn-discret inline-flex items-center gap-1.5 rounded-[8px] border border-bord px-3 py-[7px] text-[12.5px] text-doux hover:text-texte">
                <span className="text-accent">+</span> {e[0]}
              </a>
            ))}
          </div>
        </Carte>
      )}

      <Carte className="mt-4 px-5 py-5" >
        <div id="ajouter" />
        <form action={ajouterCharge.bind(null, slug)} className="flex flex-wrap items-end gap-2.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] text-faible">Libellé</span>
            <Champ name="label" required placeholder="Klaviyo" className="w-44" defaultValue={preLabel ?? ""} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] text-faible">Catégorie</span>
            <select name="category" className={cls} defaultValue={preCat ?? "fixed"}>
              {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] text-faible">Montant ({devise})</span>
            <Champ name="amount" type="number" step="0.01" min="0" required className="chiffres w-28 text-right" defaultValue={preMontant ?? ""} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] text-faible">Type</span>
            <select name="kind" className={cls} defaultValue={preKind ?? "monthly"}>
              {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] text-faible">Depuis</span>
            <Champ name="effective_from" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="chiffres" />
          </label>
          <Bouton type="submit">Ajouter</Bouton>
        </form>
      </Carte>
    </div>
  );
}
