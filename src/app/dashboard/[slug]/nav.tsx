"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";

const T = {
  fill: "none", stroke: "currentColor", strokeWidth: 1.7,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
};

/** Une icone par onglet : la navigation se lit d'un coup d'oeil. */
const ICONES: Record<string, React.ReactNode> = {
  dashboard: <><rect x="2.5" y="2.5" width="5.5" height="5.5" rx="1.5" {...T} /><rect x="10" y="2.5" width="5.5" height="5.5" rx="1.5" {...T} /><rect x="2.5" y="10" width="5.5" height="5.5" rx="1.5" {...T} /><rect x="10" y="10" width="5.5" height="5.5" rx="1.5" {...T} /></>,
  pnl: <><path d="M3 15V3M3 15h12" {...T} /><path d="M5.5 11.5 8.5 8l2.5 2.2L15 5.5" {...T} /></>,
  orders: <><path d="M4 3.5h10l-.9 8.2a1.5 1.5 0 0 1-1.5 1.3H6.4a1.5 1.5 0 0 1-1.5-1.3z" {...T} /><path d="M6.5 6.2V5a2.5 2.5 0 0 1 5 0v1.2" {...T} /></>,
  forecast: <><path d="M2.5 13.5 6.5 9l3 2.5 5.5-6" {...T} /><path d="M11.5 5.5H15V9" {...T} /><path d="M2.5 15.5h13" {...T} strokeDasharray="1.5 2" /></>,
  planning: <><rect x="2.5" y="3.5" width="13" height="12" rx="2" {...T} /><path d="M2.5 7.5h13M6 2v3M12 2v3" {...T} /><path d="M6 11h2.5M10.5 11H13" {...T} /></>,
  cogs: <><path d="M9 2 2.5 5.5v7L9 16l6.5-3.5v-7z" {...T} /><path d="M2.5 5.5 9 9l6.5-3.5M9 9v7" {...T} /></>,
  shipping: <><path d="M2.5 5.5h8v7h-8zM10.5 8h3l2 2.5v2h-5z" {...T} /><circle cx="5.5" cy="13.5" r="1.4" {...T} /><circle cx="13" cy="13.5" r="1.4" {...T} /></>,
  costs: <><circle cx="9" cy="9" r="6.5" {...T} /><path d="M9 5.5v7M11 7.2c-.4-.6-1.1-1-2-1-1.2 0-2 .6-2 1.4 0 1.9 4 1 4 3 0 .9-.9 1.5-2 1.5-1 0-1.8-.4-2.1-1.1" {...T} /></>,
  taxes: <><path d="M4 2.5h7l3 3v10H4z" {...T} /><path d="M11 2.5v3h3M6.5 9l5 0M6.5 12h3" {...T} /></>,
  integrations: <><path d="M7 4.5 4.5 7a2.8 2.8 0 0 0 4 4L11 8.5" {...T} /><path d="M11 13.5 13.5 11a2.8 2.8 0 0 0-4-4L7 9.5" {...T} /></>,
  users: <><circle cx="7" cy="6.5" r="2.6" {...T} /><path d="M2.5 15c0-2.5 2-4.2 4.5-4.2s4.5 1.7 4.5 4.2" {...T} /><path d="M12.5 5.2a2.4 2.4 0 0 1 0 4.6M13 10.9c1.7.4 2.9 1.8 2.9 3.6" {...T} /></>,
  overview: <><rect x="2.5" y="3" width="13" height="12" rx="2" {...T} /><path d="M2.5 8h13M8 8v7" {...T} /></>,
  switch: <><path d="M4 6.5h9.5L11 4M14 11.5H4.5L7 14" {...T} /></>,
  logout: <><path d="M7 3H4.5A1.5 1.5 0 0 0 3 4.5v9A1.5 1.5 0 0 0 4.5 15H7" {...T} /><path d="M11 12.5 14.5 9 11 5.5M14.5 9H7" {...T} /></>,
};

const SECTIONS: {
  titre: string;
  liens: { href: string; label: string; icone: string; admin?: boolean }[];
}[] = [
  {
    titre: "Reports",
    liens: [
      { href: "", label: "Dashboard", icone: "dashboard" },
      { href: "/pnl", label: "P&L Report", icone: "pnl" },
      { href: "/orders", label: "Orders Report", icone: "orders" },
      { href: "/forecast", label: "Forecast", icone: "forecast" },
      { href: "/planning", label: "Planning", icone: "planning" },
    ],
  },
  {
    titre: "Configuration",
    liens: [
      { href: "/cost-of-goods", label: "Cost of Goods", icone: "cogs" },
      { href: "/shipping-costs", label: "Shipping Costs", icone: "shipping" },
      { href: "/custom-costs", label: "Custom Costs", icone: "costs" },
      { href: "/taxes", label: "Taxes", icone: "taxes" },
      { href: "/integrations", label: "Integrations", icone: "integrations" },
    ],
  },
  {
    titre: "Compte",
    liens: [
      { href: "/users", label: "Utilisateurs", icone: "users", admin: true },
    ],
  },
];

function Icone({ nom, taille = 16 }: { nom: string; taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 18 18" aria-hidden className="shrink-0">
      {ICONES[nom]}
    </svg>
  );
}

function Liens({ slug, estAdmin, onClic }: { slug: string; estAdmin: boolean; onClic?: () => void }) {
  const chemin = usePathname();
  const base = `/dashboard/${slug}`;
  return (
    <nav className="mt-5 space-y-5">
      {SECTIONS.map((s) => {
        const visibles = s.liens.filter((l) => !l.admin || estAdmin);
        if (!visibles.length) return null;
        return (
          <div key={s.titre}>
            <p className="surtitre px-2.5 pb-1.5">{s.titre}</p>
            <div className="space-y-px">
              {visibles.map((l) => {
                const href = base + l.href;
                const actif = l.href === "" ? chemin === base : chemin.startsWith(href);
                return (
                  <Link
                    key={l.label} href={href} onClick={onClic}
                    className={`group relative flex items-center gap-2.5 rounded-full px-3 py-[8px] text-[12.5px] transition-all duration-150 ${
                      actif
                        ? "bg-carte-haut font-medium text-texte"
                        : "text-doux hover:bg-carte hover:text-texte"
                    }`}
                  >
                    <span className={`transition-colors ${actif ? "text-accent" : "text-faible group-hover:text-doux"}`}>
                      <Icone nom={l.icone} />
                    </span>
                    {l.label}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function LiensBas({ compact }: { compact?: boolean }) {
  const cls = "flex items-center gap-2.5 rounded-full px-3 py-[8px] text-[12.5px] text-doux transition-colors hover:bg-carte hover:text-texte";
  return (
    <div className={`space-y-px ${compact ? "" : "mt-auto pt-6"}`}>
      <Link href="/overview" className={cls}><Icone nom="overview" /> Vue consolidée</Link>
      <Link href="/select?tout=1" className={cls}><Icone nom="switch" /> Changer de boutique</Link>
      <form action="/auth/signout" method="post">
        <button className={`${cls} w-full`}><Icone nom="logout" /> Se déconnecter</button>
      </form>
    </div>
  );
}

export default function Nav({ slug, estAdmin = false }: { slug: string; estAdmin?: boolean }) {
  return (
    <>
      <Liens slug={slug} estAdmin={estAdmin} />
      <LiensBas />
    </>
  );
}

/** Barre et tiroir de navigation, uniquement sur petit écran. */
export function NavMobile({
  slug, boutique, estAdmin = false,
}: { slug: string; boutique: string; estAdmin?: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const chemin = usePathname();

  useEffect(() => setOuvert(false), [chemin]);
  useEffect(() => {
    document.body.style.overflow = ouvert ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [ouvert]);

  return (
    <>
      <header className="verre sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-2.5 lg:hidden">
        <Logo />
        <button
          onClick={() => setOuvert(true)}
          aria-label="Ouvrir le menu"
          className="btn-discret inline-flex items-center gap-1.5 rounded-full px-3.5 py-[7px] text-[12.5px] text-doux"
        >
          <svg width="15" height="15" viewBox="0 0 18 18" aria-hidden><path d="M3 5h12M3 9h12M3 13h12" {...T} /></svg>
          Menu
        </button>
      </header>

      {ouvert && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button aria-label="Fermer le menu" onClick={() => setOuvert(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" />
          <div className="apparait verre absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col overflow-y-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <Logo />
              <button onClick={() => setOuvert(false)} aria-label="Fermer"
                className="rounded-[7px] px-2 py-1 text-xl leading-none text-faible hover:text-texte">×</button>
            </div>
            <div className="carte mt-4 rounded-[12px] bg-carte px-3.5 py-3">
              <p className="truncate text-[13px] font-medium text-texte">{boutique}</p>
            </div>
            <Liens slug={slug} estAdmin={estAdmin} onClic={() => setOuvert(false)} />
            <div className="mt-auto pt-6"><LiensBas compact /></div>
          </div>
        </div>
      )}
    </>
  );
}
