"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";

const SECTIONS: {
  titre: string;
  liens: { href: string; label: string; bientot?: boolean }[];
}[] = [
  {
    titre: "Reports",
    liens: [
      { href: "", label: "Dashboard" },
      { href: "/pnl", label: "P&L Report" },
      { href: "/orders", label: "Orders Report" },
      { href: "/forecast", label: "Forecast" },
      { href: "/planning", label: "Planning" },
    ],
  },
  {
    titre: "Configuration",
    liens: [
      { href: "/cost-of-goods", label: "Cost of Goods" },
      { href: "/shipping-costs", label: "Shipping Costs" },
      { href: "/custom-costs", label: "Custom Costs" },
      { href: "/taxes", label: "Taxes" },
      { href: "/integrations", label: "Integrations" },
    ],
  },
];

function Liens({ slug, onClic }: { slug: string; onClic?: () => void }) {
  const chemin = usePathname();
  const base = `/dashboard/${slug}`;
  return (
    <nav className="mt-7 space-y-6">
      {SECTIONS.map((s) => (
        <div key={s.titre}>
          <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-faible">
            {s.titre}
          </p>
          <div className="space-y-0.5">
            {s.liens.map((l) => {
              const href = base + l.href;
              const actif = l.href === "" ? chemin === base : chemin.startsWith(href);
              if (l.bientot)
                return (
                  <span key={l.label} className="flex cursor-not-allowed items-center justify-between rounded-xl px-3 py-2 text-sm text-faible/60">
                    {l.label}
                    <span className="text-[10px] uppercase tracking-wide">soon</span>
                  </span>
                );
              return (
                <Link
                  key={l.label} href={href} onClick={onClic}
                  className={`block rounded-xl px-3 py-2 text-sm transition ${
                    actif ? "bg-carte-haut font-medium text-texte" : "text-doux hover:bg-carte hover:text-texte"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export default function Nav({ slug }: { slug: string }) {
  return <Liens slug={slug} />;
}

/** Barre et tiroir de navigation, uniquement sur petit écran. */
export function NavMobile({ slug, boutique }: { slug: string; boutique: string }) {
  const [ouvert, setOuvert] = useState(false);
  const chemin = usePathname();

  // Le tiroir se referme dès qu'on change de page.
  useEffect(() => setOuvert(false), [chemin]);
  useEffect(() => {
    document.body.style.overflow = ouvert ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [ouvert]);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-bord bg-fond px-4 py-3 lg:hidden">
        <Logo />
        <button
          onClick={() => setOuvert(true)}
          aria-label="Ouvrir le menu"
          className="rounded-xl border border-bord px-3 py-2 text-sm text-doux transition hover:text-texte"
        >
          Menu
        </button>
      </header>

      {ouvert && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Fermer le menu"
            onClick={() => setOuvert(false)}
            className="absolute inset-0 bg-black/70"
          />
          <div className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col overflow-y-auto bg-fond px-4 py-5">
            <div className="flex items-center justify-between">
              <Logo />
              <button
                onClick={() => setOuvert(false)}
                aria-label="Fermer"
                className="rounded-lg px-2 py-1 text-xl leading-none text-faible"
              >
                ×
              </button>
            </div>
            <div className="mt-4 rounded-xl border border-bord bg-carte px-3 py-2.5">
              <p className="truncate text-sm font-medium text-texte">{boutique}</p>
            </div>
            <Liens slug={slug} onClic={() => setOuvert(false)} />
            <div className="mt-auto space-y-0.5 pt-8">
              <Link href="/select" className="block rounded-xl px-3 py-2 text-xs text-faible">
                Changer de boutique
              </Link>
              <form action="/auth/signout" method="post">
                <button className="block rounded-xl px-3 py-2 text-xs text-faible">
                  Se déconnecter
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
