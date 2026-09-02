"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type BoutiqueMenu = { slug: string; name: string; currency: string; timezone: string };

function ville(tz: string) {
  return tz.split("/")[1]?.replace(/_/g, " ") ?? tz;
}

/**
 * Selecteur de boutique de la barre laterale : un clic ouvre la liste, on
 * retombe sur la MEME page (P&L, Orders...) de la boutique choisie.
 */
export function SelecteurBoutique({
  courante, boutiques, estAdmin,
}: { courante: BoutiqueMenu; boutiques: BoutiqueMenu[]; estAdmin: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const chemin = usePathname();
  // /dashboard/<slug>/pnl?x -> /dashboard/<autre>/pnl
  const memePage = (slug: string) => chemin.replace(/^\/dashboard\/[^/]+/, `/dashboard/${slug}`);

  useEffect(() => {
    if (!ouvert) return;
    const clic = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOuvert(false); };
    const touche = (e: KeyboardEvent) => { if (e.key === "Escape") setOuvert(false); };
    document.addEventListener("mousedown", clic);
    document.addEventListener("keydown", touche);
    return () => { document.removeEventListener("mousedown", clic); document.removeEventListener("keydown", touche); };
  }, [ouvert]);

  return (
    <div ref={ref} className="relative mt-5">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={ouvert}
        className="carte carte-survol flex w-full items-center gap-2.5 rounded-[12px] bg-carte px-3.5 py-3 text-left transition-colors"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-[8px] bg-accent/15 text-[12px] font-semibold text-accent">
          {courante.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-texte">{courante.name}</span>
          <span className="mt-0.5 block text-[11px] text-faible">{courante.currency} · {ville(courante.timezone)}</span>
        </span>
        <svg
          viewBox="0 0 16 16" className={`size-3.5 shrink-0 text-faible transition-transform ${ouvert ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {ouvert && (
        <div
          role="listbox"
          className="verre apparait absolute left-0 right-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-[12px] p-1.5 shadow-[0_16px_40px_rgb(0_0_0/0.5)]"
        >
          <p className="surtitre px-2.5 pb-1.5 pt-1 text-[10.5px]">Boutiques</p>
          {boutiques.map((b) => {
            const active = b.slug === courante.slug;
            return (
              <Link
                key={b.slug}
                href={memePage(b.slug)}
                onClick={() => setOuvert(false)}
                role="option"
                aria-selected={active}
                className={`flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 transition-colors ${active ? "bg-accent/12 text-texte" : "text-doux hover:bg-carte-haut hover:text-texte"}`}
              >
                <span className={`grid size-6 shrink-0 place-items-center rounded-[7px] text-[11px] font-semibold ${active ? "bg-accent text-white" : "bg-carte-haut text-doux"}`}>
                  {b.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium">{b.name}</span>
                  <span className="block text-[10.5px] text-faible">{b.currency} · {ville(b.timezone)}</span>
                </span>
                {active && (
                  <svg viewBox="0 0 16 16" className="size-3.5 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5l3 3 7-7" /></svg>
                )}
              </Link>
            );
          })}
          <div className="mx-1.5 my-1.5 h-px bg-bord" />
          <Link href="/overview" onClick={() => setOuvert(false)} className="flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[12.5px] text-doux transition-colors hover:bg-carte-haut hover:text-texte">
            <svg viewBox="0 0 16 16" className="size-4 text-faible" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="5" height="5" rx="1.2" /><rect x="9" y="2" width="5" height="5" rx="1.2" /><rect x="2" y="9" width="5" height="5" rx="1.2" /><rect x="9" y="9" width="5" height="5" rx="1.2" /></svg>
            Toutes les boutiques
          </Link>
          {estAdmin && (
            <Link href="/select" onClick={() => setOuvert(false)} className="flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[12.5px] text-doux transition-colors hover:bg-carte-haut hover:text-texte">
              <svg viewBox="0 0 16 16" className="size-4 text-faible" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 3v10M3 8h10" /></svg>
              Ajouter une boutique
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
