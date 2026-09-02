import type React from "react";

/* ── Surfaces ────────────────────────────────────────────────── */

export function Carte({
  children, className = "", ton,
}: {
  children: React.ReactNode; className?: string;
  ton?: "alerte" | "danger" | "accent";
}) {
  const tons = {
    alerte: "border-alerte/25 bg-alerte/[0.06]",
    danger: "border-negatif/30 bg-negatif/[0.06]",
    accent: "border-accent/25 bg-accent/[0.06]",
  };
  return (
    <div
      className={`rounded-[9px] border border-bord bg-carte ${ton ? tons[ton] : ""} ${className}`}
    >
      {children}
    </div>
  );
}

export function Section({
  titre, action, children, className = "",
}: {
  titre?: string; action?: React.ReactNode;
  children: React.ReactNode; className?: string;
}) {
  return (
    <Carte className={className}>
      {(titre || action) && (
        <div className="flex items-center justify-between gap-4 border-b border-bord px-5 py-3">
          {titre && <h2 className="text-[13px] font-medium text-texte">{titre}</h2>}
          {action}
        </div>
      )}
      {children}
    </Carte>
  );
}

/* ── En-tête de page ─────────────────────────────────────────── */

export function EnTetePage({
  titre, sous, action,
}: { titre: string; sous?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-[19px] font-semibold tracking-[-0.02em] text-texte">{titre}</h1>
        {sous && <p className="mt-1 text-[13px] leading-relaxed text-doux">{sous}</p>}
      </div>
      {action}
    </div>
  );
}

/* ── Contrôles ───────────────────────────────────────────────── */

export function Bouton({
  children, variante = "principal", ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: "principal" | "discret" | "fantome" | "danger";
}) {
  const styles = {
    principal: "bg-accent text-[#08210b] font-medium hover:bg-accent-vif",
    discret: "border border-bord bg-carte text-doux hover:border-bord-fort hover:text-texte",
    fantome: "text-doux hover:bg-carte-haut hover:text-texte",
    danger: "text-faible hover:text-negatif",
  }[variante];
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-1.5 rounded-[7px] px-3 py-[7px] text-[13px] transition-colors ${styles} ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function Champ(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`rounded-[7px] border border-bord bg-fond px-2.5 py-[7px] text-[13px] text-texte outline-none transition-colors placeholder:text-faible focus:border-accent/50 ${props.className ?? ""}`}
    />
  );
}

export function Selecteur(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`rounded-[7px] border border-bord bg-fond px-2.5 py-[7px] text-[13px] text-texte outline-none transition-colors focus:border-accent/50 ${props.className ?? ""}`}
    />
  );
}

/* ── Signalétique ────────────────────────────────────────────── */

export function Pastille({
  children, ton = "neutre",
}: {
  children: React.ReactNode;
  ton?: "neutre" | "vert" | "ambre" | "rouge" | "bleu";
}) {
  const styles = {
    neutre: "border-bord bg-carte-haut text-faible",
    vert: "border-accent/30 bg-accent/10 text-accent",
    ambre: "border-alerte/30 bg-alerte/10 text-alerte",
    rouge: "border-negatif/30 bg-negatif/10 text-negatif",
    bleu: "border-s1/30 bg-s1/10 text-s1",
  }[ton];
  return (
    <span className={`inline-flex items-center rounded-[5px] border px-1.5 py-px text-[10.5px] font-medium leading-[1.5] ${styles}`}>
      {children}
    </span>
  );
}

export function Delta({ valeur, taille = "sm" }: { valeur: number | null; taille?: "sm" | "md" }) {
  if (valeur === null || !Number.isFinite(valeur)) return null;
  const positif = valeur >= 0;
  return (
    <span
      className={`chiffres inline-flex items-center gap-0.5 rounded-[5px] px-1.5 py-px font-medium ${
        taille === "md" ? "text-[12px]" : "text-[10.5px]"
      } ${positif ? "bg-accent/10 text-accent" : "bg-negatif/10 text-negatif"}`}
    >
      <span className="text-[0.85em]">{positif ? "▲" : "▼"}</span>
      {Math.abs(valeur).toFixed(1).replace(".", ",")} %
    </span>
  );
}

export function Message({ ok, erreur }: { ok?: string; erreur?: string }) {
  if (!ok && !erreur) return null;
  return (
    <div
      className={`mb-4 rounded-[9px] border px-4 py-2.5 text-[13px] ${
        erreur
          ? "border-negatif/30 bg-negatif/[0.07] text-negatif"
          : "border-accent/30 bg-accent/[0.07] text-accent"
      }`}
    >
      {erreur ?? ok}
    </div>
  );
}

export function Vide({
  titre, detail, action,
}: { titre: string; detail?: string; action?: React.ReactNode }) {
  return (
    <Carte className="px-6 py-14 text-center">
      <p className="text-[14px] text-doux">{titre}</p>
      {detail && <p className="mx-auto mt-1.5 max-w-md text-[13px] text-faible">{detail}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </Carte>
  );
}

/* ── Tableau dense ───────────────────────────────────────────── */

export function Tableau({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-[13px]">{children}</table>
    </div>
  );
}

export function Th({
  children, align = "left", className = "",
}: { children?: React.ReactNode; align?: "left" | "right" | "center"; className?: string }) {
  return (
    <th
      className={`surtitre whitespace-nowrap border-b border-bord bg-carte-haut px-4 py-2.5 text-${align} ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children, align = "left", className = "", chiffres,
}: {
  children?: React.ReactNode; align?: "left" | "right" | "center";
  className?: string; chiffres?: boolean;
}) {
  return (
    <td
      className={`whitespace-nowrap px-4 py-[9px] text-${align} ${chiffres ? "chiffres" : ""} ${className}`}
    >
      {children}
    </td>
  );
}

export function Tr({
  children, className = "",
}: { children: React.ReactNode; className?: string }) {
  return (
    <tr className={`border-b border-bord/60 transition-colors last:border-0 hover:bg-carte-haut/60 ${className}`}>
      {children}
    </tr>
  );
}
