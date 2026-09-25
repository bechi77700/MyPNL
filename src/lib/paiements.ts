/** Moyens de paiement : cles stables, libelles et couleurs d'affichage. */

export type LignePaiement = { method: string; orders_count: number; revenue: number; refunds: number };

const LIBELLES: Record<string, string> = {
  card: "Carte bancaire",
  apple_pay: "Apple Pay",
  google_pay: "Google Pay",
  shop_pay: "Shop Pay",
  shop_pay_installments: "Shop Pay en plusieurs fois",
  paypal: "PayPal",
  klarna: "Klarna",
  afterpay: "Afterpay / Clearpay",
  shopify_payments: "Shopify Payments (non détaillé)",
  airwallex: "Airwallex",
  manual: "Manuel",
  gift_card: "Carte cadeau",
  inconnu: "Inconnu",
};

// PayPal, Klarna et la carte gardent toujours la meme couleur d'une periode a l'autre.
const COULEURS: Record<string, string> = {
  paypal: "#3987e5", klarna: "#d55181", card: "#199e70",
  apple_pay: "#c98500", shop_pay: "#d95926",
};
const RESTE = ["#8b7cf6", "#2bb3c0", "#9aa0a6", "#b5835a", "#6b8f3a"];

export function libellePaiement(cle: string) {
  if (LIBELLES[cle]) return LIBELLES[cle];
  return cle.replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** Couleur par cle ; les cles inconnues prennent la suivante de RESTE dans l'ordre fourni. */
export function couleursPaiement(cles: string[]) {
  const out = new Map<string, string>();
  let i = 0;
  for (const c of cles) out.set(c, COULEURS[c] ?? RESTE[i++ % RESTE.length]);
  return out;
}

/** Nom de passerelle Shopify -> cle. Meme regle que public.normalize_gateway (037). */
export function moyenDepuisPasserelle(p: string | null | undefined): string | null {
  const g = (p ?? "").trim().toLowerCase();
  if (!g) return null;
  if (g.includes("paypal")) return "paypal";
  if (g.includes("klarna")) return "klarna";
  if (g.includes("afterpay") || g.includes("clearpay")) return "afterpay";
  if (g.includes("installments")) return "shop_pay_installments";
  return g;
}

export type DetailTransaction = {
  __typename?: string;
  wallet?: string | null;
  paymentMethodName?: string | null;
};

/** Detail d'une transaction Shopify Payments -> cle. null si rien d'exploitable. */
export function moyenDepuisDetail(d: DetailTransaction | null | undefined): string | null {
  if (!d?.__typename) return null;
  if (d.__typename === "ShopPayInstallmentsPaymentDetails") return "shop_pay_installments";
  if (d.__typename === "CardPaymentDetails") {
    const w = (d.wallet ?? "").toUpperCase();
    if (w === "APPLE_PAY") return "apple_pay";
    if (w === "GOOGLE_PAY" || w === "ANDROID_PAY") return "google_pay";
    if (w === "SHOPIFY_PAY") return "shop_pay";
    return "card";
  }
  if (d.__typename === "LocalPaymentMethodsPaymentDetails")
    return moyenDepuisPasserelle(d.paymentMethodName) ?? null;
  return null;
}
