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
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const { slug } = await params;
  const { ok, erreur } = await searchParams;

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

  const cls = "rounded-[7px] border border-bord bg-fond px-3 py-2 text-texte outline-none transition focus:border-accent/60";

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
        <Carte className="px-6 py-12 text-center">
          <p className="text-doux">Aucune charge enregistrée.</p>
          <p className="mt-1.5 text-[13px] text-faible">
            Ajoute tes abonnements, salaires et frais récurrents ci-dessous.
          </p>
        </Carte>
      )}

      <Carte className="mt-4 px-5 py-5">
        <form action={ajouterCharge.bind(null, slug)} className="flex flex-wrap items-end gap-2.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] text-faible">Libellé</span>
            <Champ name="label" required placeholder="Klaviyo" className="w-44" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] text-faible">Catégorie</span>
            <select name="category" className={cls}>
              {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] text-faible">Montant ({devise})</span>
            <Champ name="amount" type="number" step="0.01" min="0" required className="chiffres w-28 text-right" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] text-faible">Type</span>
            <select name="kind" className={cls}>
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
