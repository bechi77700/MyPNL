"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ONGLETS = [
  { href: "", label: "Vue d'ensemble" },
  { href: "/calendrier", label: "Calendrier", bientot: true },
  { href: "/couts", label: "Coûts" },
  { href: "/fournisseurs", label: "Fournisseurs", bientot: true },
  { href: "/previsionnel", label: "Prévisionnel", bientot: true },
  { href: "/planification", label: "Planification", bientot: true },
  { href: "/sources", label: "Sources", bientot: true },
];

export default function Nav({ slug }: { slug: string }) {
  const chemin = usePathname();
  const base = `/dashboard/${slug}`;

  return (
    <nav className="mt-8 space-y-0.5 text-sm">
      {ONGLETS.map((o) => {
        const href = base + o.href;
        const actif = o.href === "" ? chemin === base : chemin.startsWith(href);
        if (o.bientot)
          return (
            <span
              key={o.label}
              className="block cursor-not-allowed rounded-lg px-3 py-2 text-neutral-600"
              title="Bientôt"
            >
              {o.label}
            </span>
          );
        return (
          <Link
            key={o.label}
            href={href}
            className={`block rounded-lg px-3 py-2 transition ${
              actif
                ? "bg-neutral-800 text-neutral-100"
                : "text-neutral-400 hover:text-neutral-100"
            }`}
          >
            {o.label}
          </Link>
        );
      })}
    </nav>
  );
}
