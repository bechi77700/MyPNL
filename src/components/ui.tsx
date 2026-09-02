import type React from "react";

export function Carte({
  children, className = "",
}: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-bord bg-carte ${className}`}>
      {children}
    </div>
  );
}

export function EnTetePage({
  titre, sous, action,
}: { titre: string; sous?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-texte">{titre}</h1>
        {sous && <p className="mt-1.5 text-sm text-doux">{sous}</p>}
      </div>
      {action}
    </div>
  );
}

export function Bouton({
  children, variante = "principal", ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: "principal" | "discret" | "danger";
}) {
  const styles = {
    principal:
      "bg-accent text-[#04120c] hover:bg-[#4ade80] font-medium",
    discret:
      "border border-bord text-doux hover:border-bord-fort hover:text-texte",
    danger: "text-faible hover:text-negatif",
  }[variante];
  return (
    <button
      {...props}
      className={`rounded-xl px-4 py-2.5 text-sm transition ${styles} ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function Champ(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`rounded-xl border border-bord bg-fond px-3 py-2 text-texte outline-none transition placeholder:text-faible focus:border-accent/60 ${props.className ?? ""}`}
    />
  );
}

export function Message({ ok, erreur }: { ok?: string; erreur?: string }) {
  if (!ok && !erreur) return null;
  return (
    <p
      className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
        erreur
          ? "border-negatif/40 bg-negatif/10 text-negatif"
          : "border-accent/40 bg-accent/10 text-accent"
      }`}
    >
      {erreur ?? ok}
    </p>
  );
}

export function Pastille({
  children, ton = "neutre",
}: { children: React.ReactNode; ton?: "neutre" | "vert" | "ambre" }) {
  const styles = {
    neutre: "border-bord text-faible",
    vert: "border-accent/40 text-accent",
    ambre: "border-alerte/40 text-alerte",
  }[ton];
  return (
    <span className={`rounded-md border px-1.5 py-0.5 text-[11px] ${styles}`}>
      {children}
    </span>
  );
}
