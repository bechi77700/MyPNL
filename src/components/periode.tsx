"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { PRESETS, type Preset } from "@/lib/periode";

export default function SelecteurPeriode({
  actif, libelle,
}: { actif: Preset; libelle: string }) {
  const chemin = usePathname();
  const params = useSearchParams();

  const lien = (p: Preset) => {
    const q = new URLSearchParams(params.toString());
    q.set("p", p);
    q.delete("du"); q.delete("au");
    return `${chemin}?${q}`;
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PRESETS.map(([p, label]) => (
        <Link
          key={p}
          href={lien(p)}
          className={`rounded-full px-3 py-1.5 text-[13px] transition ${
            p === actif
              ? "bg-accent font-medium text-[#04120c]"
              : "border border-bord text-doux hover:border-bord-fort hover:text-texte"
          }`}
        >
          {label}
        </Link>
      ))}
      {actif === "perso" && (
        <span className="rounded-full bg-carte-haut px-3 py-1.5 text-[13px] text-texte">
          {libelle}
        </span>
      )}
    </div>
  );
}
