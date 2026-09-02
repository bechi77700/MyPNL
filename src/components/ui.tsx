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
      className={`carte rounded-[14px] border border-transparent bg-carte ${ton ? tons[ton] : ""} ${className}`}
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
        <div className="flex items-center justify-between gap-4 px-6 pb-1 pt-5">
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
    principal: "btn-principal font-semibold",
    discret: "btn-discret border border-bord text-doux hover:text-texte",
    fantome: "text-doux hover:bg-carte-haut hover:text-texte",
    danger: "text-faible hover:text-negatif",
  }[variante];
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-1.5 rounded-full px-4 py-[8px] text-[13px] ${styles} ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function Champ(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`rounded-[10px] border border-transparent bg-carte-haut px-3 py-[8px] text-[13px] text-texte outline-none transition-colors placeholder:text-faible focus:border-accent/50 ${props.className ?? ""}`}
    />
  );
}

export function Selecteur(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`rounded-[10px] border border-transparent bg-carte-haut px-3 py-[8px] text-[13px] text-texte outline-none transition-colors focus:border-accent/50 ${props.className ?? ""}`}
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
    vert: "border-positif/30 bg-positif/10 text-positif",
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

export function Delta({
  valeur, taille = "sm", inverse,
}: { valeur: number | null; taille?: "sm" | "md"; inverse?: boolean }) {
  if (valeur === null || !Number.isFinite(valeur)) return null;
  // Pour un cout, une hausse est une mauvaise nouvelle : on inverse la couleur.
  const positif = inverse ? valeur <= 0 : valeur >= 0;
  return (
    <span
      className={`chiffres inline-flex items-center gap-0.5 rounded-[5px] px-1.5 py-px font-medium ${
        taille === "md" ? "text-[12px]" : "text-[10.5px]"
      } ${positif ? "bg-positif/10 text-positif" : "bg-negatif/10 text-negatif"}`}
    >
      <span className="text-[0.85em]">{valeur >= 0 ? "▲" : "▼"}</span>
      {Math.abs(valeur).toFixed(1).replace(".", ",")} %
    </span>
  );
}

export function Message({ ok, erreur }: { ok?: string; erreur?: string }) {
  if (!ok && !erreur) return null;
  return (
    <div
      className={`mb-4 rounded-[12px] px-4 py-2.5 text-[13px] ${
        erreur ? "bg-negatif/[0.1] text-negatif" : "bg-positif/[0.1] text-positif"
      }`}
    >
      {erreur ?? ok}
    </div>
  );
}

export function Vide({
  titre, detail, action, icone,
}: { titre: string; detail?: string; action?: React.ReactNode; icone?: React.ReactNode }) {
  return (
    <Carte className="relative overflow-hidden px-6 py-14 text-center">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(400px_120px_at_50%_0%,rgb(45_202_2/0.12),transparent_70%)]" />
      {icone && (
        <div className="puce mx-auto mb-4 flex size-12 items-center justify-center rounded-[12px] bg-accent/10 text-accent">
          {icone}
        </div>
      )}
      <p className="text-[14px] font-medium text-texte">{titre}</p>
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
      className={`surtitre whitespace-nowrap px-4 py-2.5 text-${align} ${className}`}
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
    <tr className={`border-b border-bord transition-colors last:border-0 hover:bg-carte-haut/70 ${className}`}>
      {children}
    </tr>
  );
}
