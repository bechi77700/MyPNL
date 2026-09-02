"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { PRESETS, type Preset } from "@/lib/periode";
import { actualiser } from "@/lib/actions/actualiser";

/**
 * Barre commune aux rapports : presets, plage de dates libre, actualisation.
 * L'etat de la periode vit dans l'URL : un lien partage montre la meme chose.
 */
export default function BarreRapport({
  slug, actif, du, au, derniereSynchro, sansActualisation,
}: {
  slug: string; actif: Preset; du: string; au: string;
  derniereSynchro: string | null; sansActualisation?: boolean;
}) {
  const chemin = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const [ouvert, setOuvert] = useState(actif === "perso");
  const [debut, setDebut] = useState(du);
  const [fin, setFin] = useState(au);
  const [enCours, demarrer] = useTransition();
  const [navigue, demarrerNav] = useTransition();
  const [cible, setCible] = useState<string | null>(null);
  const [retour, setRetour] = useState<{ ok: boolean; message: string } | null>(null);

  // Des le clic : la pastille visee s'allume et une barre de progression
  // apparait. Sans ca, le recalcul serveur (0,5 a 1 s) semble ne rien faire.
  const aller = (url: string, id: string) => {
    setCible(id);
    demarrerNav(() => router.push(url));
  };
  useEffect(() => { if (!navigue) setCible(null); }, [navigue]);
  useEffect(() => {
    document.querySelector("main")?.classList.toggle("en-attente", navigue);
    return () => document.querySelector("main")?.classList.remove("en-attente");
  }, [navigue]);

  useEffect(() => { setDebut(du); setFin(au); }, [du, au]);
  useEffect(() => {
    if (!retour) return;
    const t = setTimeout(() => setRetour(null), 6000);
    return () => clearTimeout(t);
  }, [retour]);

  const conserver = () => {
    const q = new URLSearchParams(params.toString());
    q.delete("page");
    return q;
  };
  const lienPreset = (p: Preset) => {
    const q = conserver(); q.set("p", p); q.delete("du"); q.delete("au");
    return `${chemin}?${q}`;
  };
  const appliquer = () => {
    if (!debut || !fin) return;
    const [a, b] = debut <= fin ? [debut, fin] : [fin, debut];
    const q = conserver(); q.delete("p"); q.set("du", a); q.set("au", b);
    aller(`${chemin}?${q}`, "perso");
  };
  const lancer = () => {
    setRetour(null);
    demarrer(async () => {
      const r = await actualiser(slug);
      setRetour(r);
      router.refresh();
    });
  };

  const bouton = "inline-flex items-center gap-1.5 rounded-full px-3 py-[6px] text-[12.5px]";
  const inactif = `${bouton} btn-discret text-doux hover:text-texte`;
  const selection = `${bouton} btn-principal font-semibold`;

  return (
    <div className="verre sticky top-0 z-20 -mx-6 mb-6 flex flex-col gap-2 px-6 py-3 lg:top-0">
      {navigue && <div className="progression" aria-hidden />}
      <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map(([p, label]) => {
          const vise = cible === p;
          const estActif = vise || (cible === null && p === actif);
          return (
            <button
              key={p} type="button"
              onClick={() => aller(lienPreset(p), p)}
              disabled={navigue}
              className={`${estActif ? selection : inactif} disabled:cursor-progress`}
            >
              {vise && (
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animate-spin">
                  <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
                </svg>
              )}
              {label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setOuvert((o) => !o)}
          className={(cible === "perso" || (cible === null && actif === "perso")) ? selection : inactif}
        >
          <svg width="13" height="13" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2.5" y="3.5" width="13" height="12" rx="2" /><path d="M2.5 7.5h13M6 2v3M12 2v3" />
          </svg>
          Dates
        </button>

      </div>

      {!sansActualisation && (
        <div className="ml-auto flex items-center gap-2.5 pl-2">
          <span className="max-w-[140px] text-right text-[11px] leading-tight text-faible sm:max-w-none">
            {retour ? (
              <span className={retour.ok ? "text-positif" : "text-negatif"}>{retour.message}</span>
            ) : enCours ? (
              "Shopify + pub, puis recalcul"
            ) : derniereSynchro ? (
              <>Dernière synchro<br className="sm:hidden" /> {formaterDelai(derniereSynchro)}</>
            ) : (
              "Jamais synchronisé"
            )}
          </span>
          <button
            type="button"
            onClick={lancer}
            disabled={enCours}
            className="btn-actualiser inline-flex items-center gap-2 px-4 py-2 text-[13px] font-semibold disabled:cursor-wait"
            title="Rapatrie les ventes Shopify et la dépense pub, puis recalcule"
            aria-live="polite"
          >
            <span className={`relative grid size-4 place-items-center ${enCours ? "" : ""}`}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className={enCours ? "animate-spin" : ""}>
                <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" /><path d="M13.5 2.5v3.2h-3.2" />
              </svg>
            </span>
            {enCours ? "Actualisation…" : "Actualiser"}
          </button>
        </div>
      )}
      </div>

      {ouvert && (
        <div className="carte apparait flex flex-wrap items-end gap-2 rounded-[12px] bg-carte px-4 py-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10.5px] text-faible">Du</span>
            <input type="date" value={debut} max={fin || undefined}
              onChange={(e) => setDebut(e.target.value)}
              className="chiffres rounded-[10px] border border-transparent bg-carte-haut px-3 py-[6px] text-[12.5px] text-texte outline-none focus:border-accent/50" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10.5px] text-faible">Au</span>
            <input type="date" value={fin} min={debut || undefined}
              onChange={(e) => setFin(e.target.value)}
              className="chiffres rounded-[10px] border border-transparent bg-carte-haut px-3 py-[6px] text-[12.5px] text-texte outline-none focus:border-accent/50" />
          </label>
          <button type="button" onClick={appliquer} className={selection}>Appliquer</button>
          <button type="button" onClick={() => setOuvert(false)} className={`${bouton} text-faible hover:text-doux`}>
            Fermer
          </button>
        </div>
      )}
    </div>
  );
}

function formaterDelai(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `le ${new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`;
}
