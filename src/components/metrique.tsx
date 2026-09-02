import type React from "react";
import { Delta } from "@/components/ui";

/** Jeu d'icônes maison, trait 1.6, 16 px. Aucune dépendance. */
const TRAITS = {
  fill: "none", stroke: "currentColor", strokeWidth: 1.6,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
};

export const ICONES: Record<string, React.ReactNode> = {
  commandes: <><path d="M2.5 3h2l1.6 8.4a1.3 1.3 0 0 0 1.3 1.1h6.2a1.3 1.3 0 0 0 1.3-1.05L16 6H5" {...TRAITS} /><circle cx="7" cy="15" r="1.1" {...TRAITS} /><circle cx="14" cy="15" r="1.1" {...TRAITS} /></>,
  argent: <><rect x="2" y="4" width="14" height="10" rx="2" {...TRAITS} /><circle cx="9" cy="9" r="2.2" {...TRAITS} /></>,
  cout: <><path d="M9 2 2.5 5.5v7L9 16l6.5-3.5v-7z" {...TRAITS} /><path d="M2.5 5.5 9 9l6.5-3.5M9 9v7" {...TRAITS} /></>,
  frais: <><rect x="2" y="4" width="14" height="10" rx="2" {...TRAITS} /><path d="M2 7.5h14" {...TRAITS} /></>,
  pub: <><path d="M3 7v4h2.5L11 14V4L5.5 7z" {...TRAITS} /><path d="M13.5 7.2a3 3 0 0 1 0 3.6" {...TRAITS} /></>,
  cible: <><circle cx="9" cy="9" r="6.5" {...TRAITS} /><circle cx="9" cy="9" r="3" {...TRAITS} /><circle cx="9" cy="9" r="0.6" fill="currentColor" stroke="none" /></>,
  clients: <><circle cx="7" cy="6.5" r="2.6" {...TRAITS} /><path d="M2.5 15c0-2.5 2-4.2 4.5-4.2s4.5 1.7 4.5 4.2" {...TRAITS} /><path d="M12.5 5.2a2.4 2.4 0 0 1 0 4.6M13 10.9c1.7.4 2.9 1.8 2.9 3.6" {...TRAITS} /></>,
  marge: <><path d="M3 13 8 8l3 3 4-5" {...TRAITS} /><path d="M15 6h-3.2M15 6v3.2" {...TRAITS} /></>,
  trafic: <><path d="M1.5 9s2.8-4.8 7.5-4.8S16.5 9 16.5 9s-2.8 4.8-7.5 4.8S1.5 9 1.5 9z" {...TRAITS} /><circle cx="9" cy="9" r="2.1" {...TRAITS} /></>,
  panier: <><path d="M4 6h10l-1 6H5z" {...TRAITS} /><path d="M9 3v3M7.4 4.4 9 3l1.6 1.4" {...TRAITS} /></>,
  articles: <><rect x="2.5" y="6" width="13" height="9" rx="1.6" {...TRAITS} /><path d="M6 6V4.2A1.2 1.2 0 0 1 7.2 3h3.6A1.2 1.2 0 0 1 12 4.2V6" {...TRAITS} /></>,
  profit: <><path d="M9 2.5v13M11.8 5.2c-.5-.9-1.6-1.4-2.8-1.4-1.7 0-2.9.9-2.9 2.2 0 3 5.8 1.6 5.8 4.8 0 1.4-1.3 2.4-3 2.4-1.4 0-2.6-.6-3.1-1.6" {...TRAITS} /></>,
};

const TEINTES = {
  bleu: "text-s1 bg-s1/10",
  orange: "text-s2 bg-s2/10",
  vert: "text-s3 bg-s3/10",
  jaune: "text-s4 bg-s4/10",
  rose: "text-s5 bg-s5/10",
  accent: "text-accent bg-accent/10",
  neutre: "text-doux bg-carte-haut",
} as const;

export type Teinte = keyof typeof TEINTES;

/** Carte de métrique : puce colorée, libellé discret, valeur qui domine. */
export function Metrique({
  icone, teinte = "neutre", label, valeur, delta, note,
}: {
  icone?: keyof typeof ICONES; teinte?: Teinte;
  label: string; valeur: string; delta?: number | null; note?: string;
}) {
  return (
    <div className="rounded-[9px] border border-bord bg-carte px-4 py-3.5">
      <div className="flex items-center gap-2">
        {icone && (
          <span className={`flex size-[26px] shrink-0 items-center justify-center rounded-[7px] ${TEINTES[teinte]}`}>
            <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden>{ICONES[icone]}</svg>
          </span>
        )}
        <span className="truncate text-[12px] text-faible">{label}</span>
      </div>
      <p className="chiffres mt-2.5 text-[20px] font-semibold leading-none text-texte">
        {valeur}
      </p>
      <div className="mt-2 flex items-center gap-2">
        {delta !== undefined && <Delta valeur={delta ?? null} />}
        {note && <span className="truncate text-[11px] text-faible">{note}</span>}
      </div>
    </div>
  );
}

/** Variante compacte, sans carte : pour les grilles internes. */
export function MetriqueLigne({
  icone, teinte = "neutre", label, valeur,
}: {
  icone?: keyof typeof ICONES; teinte?: Teinte; label: string; valeur: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      {icone && (
        <span className={`flex size-[26px] shrink-0 items-center justify-center rounded-[7px] ${TEINTES[teinte]}`}>
          <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden>{ICONES[icone]}</svg>
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-[11.5px] text-faible">{label}</p>
        <p className="chiffres text-[15px] font-medium leading-tight text-texte">{valeur}</p>
      </div>
    </div>
  );
}
