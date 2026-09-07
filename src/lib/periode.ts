/** Gestion des periodes, toujours dans le fuseau de la boutique. */

export type Preset =
  | "aujourdhui" | "hier" | "7j" | "30j" | "mois" | "mois-1" | "90j"
  | "trimestre" | "annee" | "tout" | "perso";

export const PRESETS: [Preset, string][] = [
  ["aujourdhui", "Aujourd'hui"],
  ["hier", "Hier"],
  ["7j", "7 jours"],
  ["30j", "30 jours"],
  ["mois", "Ce mois-ci"],
  ["mois-1", "Mois dernier"],
  ["90j", "90 jours"],
  ["annee", "Cette année"],
  ["tout", "Tout"],
];

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const dernierJourDuMois = (annee: number, mois1a12: number) =>
  new Date(Date.UTC(annee, mois1a12, 0)).toISOString().slice(0, 10);

/** Bornes d'un trimestre "2026-Q3" -> 1er juillet / 30 septembre. */
export function bornesTrimestre(cle: string) {
  const m = cle.match(/^(\d{4})-Q([1-4])$/);
  if (!m) return null;
  const annee = Number(m[1]), q = Number(m[2]);
  const debut = `${annee}-${String((q - 1) * 3 + 1).padStart(2, "0")}-01`;
  return { du: debut, au: dernierJourDuMois(annee, q * 3), libelle: `T${q} ${annee}` };
}

/** Les 8 derniers trimestres (le courant en premier), pour le menu. */
export function trimestresRecents(auj: string, n = 8) {
  let annee = Number(auj.slice(0, 4));
  let q = Math.floor((Number(auj.slice(5, 7)) - 1) / 3) + 1;
  const liste: { cle: string; libelle: string }[] = [];
  for (let i = 0; i < n; i++) {
    liste.push({ cle: `${annee}-Q${q}`, libelle: `T${q} ${annee}` });
    q--; if (q === 0) { q = 4; annee--; }
  }
  return liste;
}

/** Date du jour dans le fuseau de la boutique, au format AAAA-MM-JJ. */
export function aujourdhui(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

const jour = 86400_000;
const decale = (iso: string, n: number) =>
  new Date(new Date(iso + "T12:00:00Z").getTime() + n * jour).toISOString().slice(0, 10);

export function resoudrePeriode(
  timezone: string,
  params: { p?: string; du?: string; au?: string; t?: string },
): { preset: Preset; du: string; au: string; libelle: string } {
  const auj = aujourdhui(timezone);

  if (params.du && params.au) {
    return { preset: "perso", du: params.du, au: params.au, libelle: `${params.du} → ${params.au}` };
  }

  const p = (params.p as Preset) ?? "aujourdhui";
  switch (p) {
    case "aujourdhui":
      return { preset: p, du: auj, au: auj, libelle: "Aujourd'hui" };
    case "hier": {
      const h = decale(auj, -1);
      return { preset: p, du: h, au: h, libelle: "Hier" };
    }
    case "7j":
      return { preset: p, du: decale(auj, -6), au: auj, libelle: "7 derniers jours" };
    case "mois": {
      const [a, m] = [Number(auj.slice(0, 4)), Number(auj.slice(5, 7))];
      return { preset: p, du: `${auj.slice(0, 7)}-01`, au: auj, libelle: `${MOIS[m - 1].charAt(0).toUpperCase() + MOIS[m - 1].slice(1)} ${a}, en cours` };
    }
    case "mois-1": {
      let a = Number(auj.slice(0, 4)), m = Number(auj.slice(5, 7)) - 1;
      if (m === 0) { m = 12; a--; }
      return { preset: p, du: `${a}-${String(m).padStart(2, "0")}-01`, au: dernierJourDuMois(a, m), libelle: `${MOIS[m - 1].charAt(0).toUpperCase() + MOIS[m - 1].slice(1)} ${a}` };
    }
    case "trimestre": {
      const b = bornesTrimestre(params.t ?? "") ?? bornesTrimestre(trimestresRecents(auj, 1)[0].cle)!;
      // Trimestre en cours : on s'arrete a aujourd'hui, pas au 30 du mois.
      return { preset: p, du: b.du, au: b.au > auj ? auj : b.au, libelle: b.libelle };
    }
    case "90j":
      return { preset: p, du: decale(auj, -89), au: auj, libelle: "90 derniers jours" };
    case "annee":
      return { preset: p, du: `${auj.slice(0, 4)}-01-01`, au: auj, libelle: "Depuis le 1er janvier" };
    case "tout":
      return { preset: p, du: "2000-01-01", au: auj, libelle: "Tout l'historique" };
    default:
      return { preset: "30j", du: decale(auj, -29), au: auj, libelle: "30 derniers jours" };
  }
}

/** Periode precedente de meme longueur, pour les comparaisons. */
export function periodePrecedente(du: string, au: string) {
  const n = Math.round(
    (new Date(au + "T12:00:00Z").getTime() - new Date(du + "T12:00:00Z").getTime()) / jour,
  ) + 1;
  return { du: decale(du, -n), au: decale(du, -1) };
}

export function formaterMontant(v: number, devise: string, compact = false) {
  // "46 837 $" plutot que "46 837 $US" : le suffixe de zone alourdit chaque chiffre.
  return new Intl.NumberFormat("fr-FR", {
    style: "currency", currency: devise, currencyDisplay: "narrowSymbol",
    maximumFractionDigits: compact && Math.abs(v) >= 1000 ? 0 : 2,
    minimumFractionDigits: compact && Math.abs(v) >= 1000 ? 0 : 2,
    notation: compact && Math.abs(v) >= 100000 ? "compact" : "standard",
  }).format(v);
}

export function formaterNombre(v: number) {
  return new Intl.NumberFormat("fr-FR").format(v);
}

export function formaterPourcent(v: number, decimales = 1) {
  return `${v.toFixed(decimales).replace(".", ",")} %`;
}
