/**
 * Lecture d'un CSV de depenses publicitaires exporte depuis Ads Manager
 * (Meta, Google, TikTok…). Les intitules varient selon la langue et la
 * plateforme : on repere les colonnes par leur contenu autant que par leur nom.
 */

export type LigneDepense = { date: string; montant: number };

function decouper(ligne: string, sep: string): string[] {
  const out: string[] = [];
  let courant = "";
  let entreGuillemets = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (c === '"') {
      if (entreGuillemets && ligne[i + 1] === '"') { courant += '"'; i++; }
      else entreGuillemets = !entreGuillemets;
    } else if (c === sep && !entreGuillemets) {
      out.push(courant); courant = "";
    } else courant += c;
  }
  out.push(courant);
  return out.map((v) => v.trim().replace(/^"|"$/g, ""));
}

type Ordre = "iso" | "jour-mois" | "mois-jour";

function morceaux(v: string): [number, number, string] | null {
  const m = v.trim().match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  return m ? [Number(m[1]), Number(m[2]), m[3]] : null;
}

/**
 * L'ordre jour/mois se decide UNE FOIS pour tout le fichier, pas ligne par
 * ligne : 08/31 et 09/01 dans le meme export doivent etre lus pareil.
 * Une valeur > 12 en premiere position prouve jour/mois, en seconde mois/jour.
 */
function detecterOrdre(valeurs: string[]): Ordre {
  if (valeurs.some((v) => /^\d{4}-\d{2}-\d{2}/.test(v.trim()))) return "iso";
  let premierGrand = false, secondGrand = false;
  for (const v of valeurs) {
    const p = morceaux(v);
    if (!p) continue;
    if (p[0] > 12) premierGrand = true;
    if (p[1] > 12) secondGrand = true;
  }
  if (secondGrand && !premierGrand) return "mois-jour";
  return "jour-mois"; // defaut : format europeen
}

/** Detection de colonne : est-ce que ça a la FORME d'une date ?
 *  Volontairement permissif — l'ordre jour/mois est tranché ensuite. */
function ressembleADate(v: string): boolean {
  const s = v.trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) || morceaux(s) !== null;
}

function versDate(v: string, ordre: Ordre = "jour-mois"): string | null {
  const s = v.trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const p = morceaux(s);
  if (!p) return null;
  const [jour, mois] = ordre === "mois-jour" ? [p[1], p[0]] : [p[0], p[1]];
  if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return null;
  return `${p[2]}-${String(mois).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
}

/** "1 234,56", "1,234.56", "$1234.56" → 1234.56 */
function versNombre(v: string): number | null {
  let s = v.replace(/[^\d,.\-]/g, "").trim();
  if (!s) return null;
  const virgule = s.lastIndexOf(","), point = s.lastIndexOf(".");
  if (virgule > point) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const MOTS_MONTANT = [
  "amount spent", "montant depense", "montant dépensé", "spend", "depense",
  "dépense", "cost", "cout", "coût", "budget",
];

export function lireCsvDepenses(contenu: string): {
  lignes: LigneDepense[]; colonneDate: string; colonneMontant: string; format: string;
} {
  const brutes = contenu.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (brutes.length < 2) throw new Error("Fichier vide ou sans données.");

  const sep = [",", ";", "\t"]
    .map((s) => ({ s, n: brutes[0].split(s).length }))
    .sort((a, b) => b.n - a.n)[0].s;

  const entetes = decouper(brutes[0], sep);
  const corps = brutes.slice(1).map((l) => decouper(l, sep));

  // Colonne date : celle dont le plus de valeurs se lisent comme une date.
  let iDate = -1, meilleurDate = 0;
  // Colonne montant : d'abord par le nom, sinon la plus numerique.
  let iMontant = -1, meilleurMontant = 0;

  for (let c = 0; c < entetes.length; c++) {
    const nom = entetes[c].toLowerCase();
    const valeurs = corps.map((l) => l[c] ?? "").filter(Boolean);
    if (!valeurs.length) continue;

    const dates = valeurs.filter(ressembleADate).length / valeurs.length;
    if (dates > meilleurDate && dates > 0.7) { meilleurDate = dates; iDate = c; }

    const nombres = valeurs.filter((v) => versNombre(v) !== null).length / valeurs.length;
    const nomme = MOTS_MONTANT.some((m) => nom.includes(m));
    const score = nombres * (nomme ? 2 : 1);
    if (nombres > 0.7 && score > meilleurMontant) { meilleurMontant = score; iMontant = c; }
  }

  if (iDate < 0) throw new Error("Aucune colonne de date reconnue.");
  if (iMontant < 0) throw new Error("Aucune colonne de montant reconnue.");

  const ordre = detecterOrdre(corps.map((l) => l[iDate] ?? ""));

  // Un export "par campagne" a une date de debut ET une date de fin qui
  // couvrent toute la periode : l'importer mettrait tout le budget sur un
  // seul jour. On le refuse, avec la marche a suivre.
  const iFin = entetes.findIndex((e, i) => i !== iDate && /reporting ends|date de fin|fin/i.test(e)
    && corps.filter((l) => ressembleADate(l[i] ?? "")).length / Math.max(1, corps.length) > 0.7);
  if (iFin >= 0) {
    const etendues = corps.map((l) => {
      const a = versDate(l[iDate] ?? "", ordre), b = versDate(l[iFin] ?? "", ordre);
      return a && b ? (new Date(b).getTime() - new Date(a).getTime()) / 86400_000 : 0;
    });
    const plages = etendues.filter((e) => e >= 1).length;
    if (plages / Math.max(1, etendues.length) > 0.5)
      throw new Error(
        "Ce fichier est ventilé par campagne (une ligne couvre toute la période), pas par jour. " +
        "Dans Ads Manager, ajoute la ventilation « Par jour » avant d'exporter.",
      );
  }

  const parJour = new Map<string, number>();
  for (const l of corps) {
    const d = versDate(l[iDate] ?? "", ordre);
    const m = versNombre(l[iMontant] ?? "");
    if (!d || m === null) continue;
    parJour.set(d, (parJour.get(d) ?? 0) + m);
  }

  return {
    lignes: [...parJour].map(([date, montant]) => ({ date, montant })).sort((a, b) => a.date.localeCompare(b.date)),
    colonneDate: entetes[iDate],
    colonneMontant: entetes[iMontant],
    format: ordre === "iso" ? "AAAA-MM-JJ" : ordre === "mois-jour" ? "MM/JJ/AAAA" : "JJ/MM/AAAA",
  };
}
