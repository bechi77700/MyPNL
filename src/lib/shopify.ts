import crypto from "node:crypto";

/** Lecture seule. Les deux derniers scopes donnent les frais de transaction REELS. */
export const SHOPIFY_SCOPES = [
  "read_orders",
  "read_all_orders",
  "read_products",
  "read_customers",
  "read_reports",
  "read_fulfillments",
  "read_shopify_payments_payouts",
  "read_shopify_payments_disputes",
].join(",");

export const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION ?? "2025-10";

/** Normalise une saisie utilisateur en domaine .myshopify.com, ou null si invalide. */
export function normaliserDomaine(saisie: string): string | null {
  const brut = saisie
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  const nom = brut.endsWith(".myshopify.com") ? brut : `${brut}.myshopify.com`;
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(nom) ? nom : null;
}

export function urlAutorisation(opts: {
  domaine: string;
  clientId: string;
  redirectUri: string;
  state: string;
}) {
  const p = new URLSearchParams({
    client_id: opts.clientId,
    scope: SHOPIFY_SCOPES,
    redirect_uri: opts.redirectUri,
    state: opts.state,
  });
  return `https://${opts.domaine}/admin/oauth/authorize?${p}`;
}

/** Verifie la signature HMAC du callback Shopify. Comparaison a temps constant. */
export function verifierHmac(params: URLSearchParams, secret: string): boolean {
  const recu = params.get("hmac");
  if (!recu) return false;
  const message = [...params.entries()]
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const calcule = crypto.createHmac("sha256", secret).update(message).digest("hex");
  const a = Buffer.from(calcule, "utf8");
  const b = Buffer.from(recu, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function echangerCodeContreToken(
  domaine: string,
  code: string,
): Promise<string> {
  const r = await fetch(`https://${domaine}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code,
    }),
  });
  if (!r.ok) throw new Error(`Shopify a refuse l'echange du code (${r.status})`);
  const data = (await r.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Shopify n'a pas renvoye de token");
  return data.access_token;
}

/** Appel a l'API Admin d'une boutique. */
export async function shopifyAdmin<T>(
  domaine: string,
  token: string,
  chemin: string,
): Promise<T> {
  const r = await fetch(
    `https://${domaine}/admin/api/${SHOPIFY_API_VERSION}/${chemin}`,
    { headers: { "X-Shopify-Access-Token": token } },
  );
  if (!r.ok) {
    throw new Error(`Shopify ${chemin} -> ${r.status} ${await r.text()}`);
  }
  return r.json() as Promise<T>;
}

export type InfosBoutique = {
  name: string;
  currency: string;
  iana_timezone: string;
  myshopify_domain: string;
};

/** Recupere nom, devise et fuseau : la source de verite pour shops. */
export async function infosBoutique(domaine: string, token: string) {
  const r = await shopifyAdmin<{ shop: InfosBoutique }>(
    domaine,
    token,
    "shop.json?fields=name,currency,iana_timezone,myshopify_domain",
  );
  return r.shop;
}

export function slugifier(nom: string) {
  return (
    nom
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "boutique"
  );
}
