import { formaterMontant } from "@/lib/periode";

/** Champ de date d'effet, commun a Cost of Goods et Shipping Costs. */
export function ChampAPartirDu({ note }: { note?: string }) {
  return (
    <div className="carte mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[12px] bg-carte px-4 py-3">
      <label className="flex items-center gap-2.5 text-[12.5px] text-doux">
        <span>Appliquer à partir du</span>
        <input
          type="date" name="a_partir_du"
          className="chiffres rounded-[10px] border border-transparent bg-carte-haut px-3 py-[6px] text-[12.5px] text-texte outline-none focus:border-accent/50"
        />
      </label>
      <p className="text-[11.5px] leading-relaxed text-faible">
        Vide : tu corriges le tarif actuel. Rempli : nouveau palier à cette date, les commandes d&apos;avant gardent l&apos;ancien tarif.
        {note ? ` ${note}` : ""}
      </p>
    </div>
  );
}

export type Palier = { sku: string; effective_from: string; valeurs: string };

const fr = (iso: string) =>
  iso <= "2000-01-01" ? "l\u2019origine" : new Date(iso + "T12:00:00Z").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

/** Historique des paliers, regroupe par produit : "1,10 $ depuis l'origine → 0,95 $ depuis le 1 sept. 2026". */
export function HistoriquePaliers({
  paliers, titres, devise, titre = "Historique des paliers",
}: { paliers: Palier[]; titres: Map<string, string>; devise: string; titre?: string }) {
  const parSku = new Map<string, Palier[]>();
  for (const p of paliers) parSku.set(p.sku, [...(parSku.get(p.sku) ?? []), p]);
  const avecHistorique = [...parSku.entries()].filter(([, l]) => l.length > 1);
  if (!avecHistorique.length) return null;
  return (
    <details className="mt-5 group">
      <summary className="cursor-pointer text-[12.5px] text-doux transition-colors hover:text-texte">
        {titre} · {avecHistorique.length} produit{avecHistorique.length > 1 ? "s" : ""} avec plusieurs tarifs
      </summary>
      <div className="carte mt-2 rounded-[12px] bg-carte px-4 py-3">
        {avecHistorique.map(([sku, l]) => (
          <div key={sku} className="border-b border-bord py-2 last:border-0">
            <p className="text-[12.5px] text-texte">{titres.get(sku) ?? sku}</p>
            <p className="chiffres mt-0.5 text-[12px] text-doux">
              {[...l].sort((a, b) => a.effective_from.localeCompare(b.effective_from))
                .map((p) => `${p.valeurs} depuis ${fr(p.effective_from)}`).join("  →  ")}
            </p>
          </div>
        ))}
      </div>
    </details>
  );
}

export const montant = (v: number, devise: string) => formaterMontant(v, devise);
