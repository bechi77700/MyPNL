import { formaterMontant } from "@/lib/periode";
import { Bouton, Carte, Champ, Selecteur } from "@/components/ui";

export type Palier = { cle: string; effective_from: string; valeurs: string; nombre?: number };
export type Choix = { cle: string; libelle: string };

const fr = (iso: string) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/**
 * L'endroit unique pour les changements de prix dans le temps :
 *   - la liste de tous les paliers, par date, avec "avant -> apres" et suppression ;
 *   - un formulaire "a partir du <date>, <produit> coute <x>".
 * Le tableau au-dessus ne sert qu'au tarif en vigueur aujourd'hui.
 */
export function ChangementsDePrix({
  titre, intro, paliers, titres, auj, choix, champProduit = "sku", formulaire, supprimer,
}: {
  titre: string;
  /** nom du champ envoye a l'action : "sku" (un SKU) ou "skus" (liste de variantes) */
  champProduit?: "sku" | "skus";
  intro: string;
  /** tous les paliers, y compris l'origine (2000-01-01), pour calculer "avant" */
  paliers: Palier[];
  titres: Map<string, string>;
  auj: string;
  choix: Choix[];
  /** champs specifiques (cout, ou standard + upsell) rendus dans le formulaire */
  formulaire: { action: (form: FormData) => void | Promise<void>; champs: React.ReactNode; caches?: React.ReactNode };
  supprimer: (cle: string, date: string) => (form: FormData) => void | Promise<void>;
}) {
  const parCle = new Map<string, Palier[]>();
  for (const p of paliers) parCle.set(p.cle, [...(parCle.get(p.cle) ?? []), p].sort((a, b) => a.effective_from.localeCompare(b.effective_from)));
  const changements = [...parCle.values()].flatMap((l) =>
    l.slice(1).map((p, i) => ({ ...p, avant: l[i].valeurs })));
  changements.sort((a, b) => b.effective_from.localeCompare(a.effective_from) || (titres.get(a.cle) ?? "").localeCompare(titres.get(b.cle) ?? ""));
  const parDate = new Map<string, typeof changements>();
  for (const c of changements) parDate.set(c.effective_from, [...(parDate.get(c.effective_from) ?? []), c]);

  return (
    <Carte className="mt-6 overflow-hidden">
      <div className="px-5 pt-5">
        <h2 className="text-[14px] font-medium text-texte">{titre}</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-doux">{intro}</p>
      </div>

      <form action={formulaire.action} className="mx-5 mt-4 flex flex-wrap items-end gap-2.5 rounded-[12px] bg-carte-haut px-4 py-3.5">
        {formulaire.caches}
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-faible">À partir du</span>
          <Champ type="date" name="date" required defaultValue={auj} className="chiffres" />
        </label>
        <label className="flex min-w-[220px] flex-1 flex-col gap-1">
          <span className="text-[11px] text-faible">Produit</span>
          <Selecteur name={champProduit} required defaultValue="">
            <option value="" disabled>Choisir…</option>
            {choix.map((c) => <option key={c.cle} value={c.cle}>{c.libelle}</option>)}
          </Selecteur>
        </label>
        {formulaire.champs}
        <Bouton type="submit">Programmer le changement</Bouton>
      </form>

      <div className="px-5 pb-5 pt-4">
        {changements.length === 0 ? (
          <p className="text-[12.5px] text-faible">Aucun changement programmé. Les tarifs du tableau valent depuis l&apos;origine.</p>
        ) : (
          [...parDate.entries()].map(([date, liste]) => (
            <div key={date} className="border-t border-bord py-3 first:border-0 first:pt-0">
              <p className="mb-1.5 flex items-center gap-2 text-[12.5px] font-medium text-texte">
                {fr(date)}
                {date > auj && <span className="rounded-full bg-accent/12 px-2 py-0.5 text-[10.5px] font-medium text-accent">à venir</span>}
                {date <= auj && <span className="rounded-full bg-positif/12 px-2 py-0.5 text-[10.5px] font-medium text-positif">en vigueur</span>}
              </p>
              {liste.map((c) => (
                <div key={c.cle + c.effective_from} className="flex items-center gap-3 py-1 text-[13px]">
                  <span className="min-w-0 flex-1 truncate text-doux">{titres.get(c.cle) ?? c.cle}</span>
                  <span className="chiffres shrink-0 text-faible">{c.avant}</span>
                  <span className="shrink-0 text-faible">→</span>
                  <span className="chiffres shrink-0 text-texte">{c.valeurs}</span>
                  <form action={supprimer(c.cle, c.effective_from)}>
                    <button className="text-[11.5px] text-faible transition-colors hover:text-negatif">Supprimer</button>
                  </form>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </Carte>
  );
}

export const montant = (v: number, devise: string) => formaterMontant(v, devise);
