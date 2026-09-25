/** Chargebacks (litiges Shopify Payments) : types et libelles d'affichage. */

export type SyntheseLitiges = {
  ouverts: number; montant_ouverts: number; demandes: number;
  en_cours: number; montant_en_cours: number;
  gagnes: number; montant_gagnes: number;
  perdus: number; montant_perdus: number;
  commandes_sp: number; a_repondre: number;
  prochaine_echeance: string | null; shopify_payments: boolean;
};

/** Repere courant des processeurs de paiement : au-dela, le compte est sous surveillance. */
export const SEUIL_TAUX = 0.75;

export function tauxLitiges(s: Partial<SyntheseLitiges> | undefined) {
  const cmd = Number(s?.commandes_sp ?? 0);
  return cmd > 0 ? (Number(s?.ouverts ?? 0) / cmd) * 100 : null;
}

export function teinteTaux(taux: number | null) {
  if (taux === null) return "neutre" as const;
  if (taux >= SEUIL_TAUX) return "rose" as const;
  if (taux >= SEUIL_TAUX * 2 / 3) return "orange" as const;
  return "positif" as const;
}

const RAISONS: Record<string, string> = {
  fraudulent: "Fraude",
  unrecognized: "Achat non reconnu",
  product_not_received: "Produit non reçu",
  product_unacceptable: "Produit non conforme",
  subscription_canceled: "Abonnement annulé",
  duplicate: "Double débit",
  credit_not_processed: "Remboursement non reçu",
  general: "Autre",
  customer_initiated: "Initié par le client",
  incorrect_account_details: "Coordonnées incorrectes",
  insufficient_funds: "Fonds insuffisants",
  bank_cannot_process: "Refus de la banque",
  debit_not_authorized: "Débit non autorisé",
  noncompliant: "Non conforme au réseau",
};

export const libelleRaison = (r: string | null) =>
  (r && RAISONS[r]) || (r ? r.replace(/_/g, " ") : "Non précisée");

export const STATUTS: Record<string, { label: string; ton: "neutre" | "vert" | "ambre" | "rouge" | "bleu" }> = {
  needs_response: { label: "À contester", ton: "ambre" },
  under_review: { label: "En examen", ton: "bleu" },
  won: { label: "Gagné", ton: "vert" },
  lost: { label: "Perdu", ton: "rouge" },
  accepted: { label: "Accepté (perdu)", ton: "rouge" },
  charge_refunded: { label: "Remboursé", ton: "neutre" },
};
