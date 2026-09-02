"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Entoure un formulaire de reglages : des qu'un champ change, une barre
 * flottante apparait avec le bouton d'enregistrement. On ne cherche plus
 * le bouton en bas de page, et on ne quitte plus sans avoir sauvegarde.
 */
export default function FormulaireSuivi({
  action, libelleBouton = "Enregistrer", children, champsCaches,
}: {
  action: (form: FormData) => void | Promise<void>;
  libelleBouton?: string;
  children: React.ReactNode;
  champsCaches?: React.ReactNode;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [modifie, setModifie] = useState(false);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    const f = ref.current;
    if (!f) return;
    const marquer = () => setModifie(true);
    f.addEventListener("input", marquer);
    f.addEventListener("change", marquer);
    const garde = (e: BeforeUnloadEvent) => { if (modifie && !enCours) { e.preventDefault(); } };
    window.addEventListener("beforeunload", garde);
    return () => {
      f.removeEventListener("input", marquer);
      f.removeEventListener("change", marquer);
      window.removeEventListener("beforeunload", garde);
    };
  }, [modifie, enCours]);

  return (
    <form ref={ref} action={action} onSubmit={() => setEnCours(true)}>
      {champsCaches}
      {children}
      {modifie && (
        <div className="flottant fixed bottom-5 left-1/2 z-30 flex items-center gap-3 rounded-[12px] border border-bord-fort bg-elev/95 px-4 py-2.5 shadow-[0_12px_40px_-8px_rgb(0_0_0/0.8)] backdrop-blur">
          <span className="flex items-center gap-2 text-[12.5px] text-doux">
            <span className="size-2 rounded-full bg-alerte shadow-[0_0_8px_rgb(255_178_36/0.8)]" />
            Modifications non enregistrées
          </span>
          <button
            type="button"
            onClick={() => { ref.current?.reset(); setModifie(false); }}
            className="rounded-[7px] px-2.5 py-[6px] text-[12.5px] text-faible hover:text-texte"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={enCours}
            className="btn-principal rounded-[8px] px-3.5 py-[7px] text-[13px] font-semibold disabled:opacity-60"
          >
            {enCours ? "Enregistrement…" : libelleBouton}
          </button>
        </div>
      )}
    </form>
  );
}
