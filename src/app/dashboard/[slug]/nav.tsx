"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS: {
  titre: string;
  liens: { href: string; label: string; bientot?: boolean }[];
}[] = [
  {
    titre: "Reports",
    liens: [
      { href: "", label: "Dashboard" },
      { href: "/pnl", label: "P&L Report" },
      { href: "/orders", label: "Orders Report", bientot: true },
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

export default function Nav({ slug }: { slug: string }) {
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
                  <span
                    key={l.label}
                    title="Bientôt"
                    className="flex cursor-not-allowed items-center justify-between rounded-xl px-3 py-2 text-sm text-faible/60"
                  >
                    {l.label}
                    <span className="text-[10px] uppercase tracking-wide">soon</span>
                  </span>
                );
              return (
                <Link
                  key={l.label}
                  href={href}
                  className={`block rounded-xl px-3 py-2 text-sm transition ${
                    actif
                      ? "bg-carte-haut font-medium text-texte"
                      : "text-doux hover:bg-carte hover:text-texte"
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
