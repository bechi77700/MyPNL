import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import { SHOPIFY_API_VERSION } from "@/lib/shopify";
import {
  moyenDepuisDetail, moyenDepuisIcone, moyenDepuisRecu, type DetailTransaction,
} from "@/lib/paiements";

type Admin = ReturnType<typeof createAdminClient>;
type Creds = { token: string; domaine: string };

export type ResultatSync = {
  /** true = cette passe a relu les 3 derniers jours (filet quotidien), false = seulement le delta. */
  rebalayage?: boolean;
  commandes: number;
  moyens_paiement: number;
  remboursements: number;
  produits: number;
  jours_frais: number;
  payouts: number;
  litiges: number;
  jours_sessions: number;
  jours_recalcules: number;
  erreurs: string[];
};

const PAUSE_MS = 300; // l'API REST de Shopify accepte 2 appels/seconde
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function chargerCreds(admin: Admin, shopId: string): Promise<Creds> {
  const { data, error } = await admin
    .from("connectors")
    .select("creds_encrypted")
    .eq("shop_id", shopId)
    .eq("platform", "shopify")
    .single();
  if (error || !data?.creds_encrypted)
    throw new Error("Aucun connecteur Shopify pour cette boutique.");
  return JSON.parse(decrypt(data.creds_encrypted)) as Creds;
}

/** Appel REST avec relance automatique sur limitation de debit. */
async function rest(creds: Creds, cheminOuUrl: string): Promise<Response> {
  const url = cheminOuUrl.startsWith("http")
    ? cheminOuUrl
    : `https://${creds.domaine}/admin/api/${SHOPIFY_API_VERSION}/${cheminOuUrl}`;
  for (let essai = 0; essai < 5; essai++) {
    const r = await fetch(url, {
      headers: { "X-Shopify-Access-Token": creds.token },
    });
    if (r.status !== 429) return r;
    await dormir(2000 * (essai + 1));
  }
  throw new Error(`Shopify limite les appels : ${url}`);
}

/** Parcourt toutes les pages d'une ressource REST (pagination par curseur). */
async function* pages<T>(creds: Creds, chemin: string, cle: string) {
  let url: string | null = chemin;
  while (url) {
    const r: Response = await rest(creds, url);
    if (!r.ok) throw new Error(`${chemin} -> ${r.status} ${await r.text()}`);
    const data = (await r.json()) as Record<string, T[]>;
    yield data[cle] ?? [];
    const suivant = r.headers
      .get("link")
      ?.split(",")
      .find((p) => p.includes('rel="next"'))
      ?.match(/<([^>]+)>/)?.[1];
    url = suivant ?? null;
    if (url) await dormir(PAUSE_MS);
  }
}

const nombre = (v: unknown) => (v == null ? 0 : Number(v) || 0);

// ─────────────────────────── Commandes ───────────────────────────

const CHAMPS_COMMANDE = [
  "id", "name", "created_at", "updated_at", "cancelled_at", "currency",
  "financial_status", "total_price_set", "current_total_price_set",
  "current_total_tax_set", "total_tax_set", "total_shipping_price_set",
  "line_items", "shipping_address", "billing_address", "customer", "payment_gateway_names",
].join(",");

type LigneCommande = {
  sku: string | null;
  quantity: number;
  title?: string;
  variant_title?: string | null;
  product_id?: number | null;
  variant_id?: number | null;
};

type CommandeShopify = {
  payment_gateway_names?: string[];
  id: number;
  name: string;
  created_at: string;
  cancelled_at: string | null;
  currency: string;
  financial_status: string | null;
  total_price_set?: { shop_money?: { amount?: string } };
  current_total_price_set?: { shop_money?: { amount?: string } };
  current_total_tax_set?: { shop_money?: { amount?: string } };
  total_tax_set?: { shop_money?: { amount?: string } };
  total_shipping_price_set?: { shop_money?: { amount?: string } };
  line_items?: LigneCommande[];
  shipping_address?: { country_code?: string; zip?: string } | null;
  billing_address?: { country_code?: string; zip?: string } | null;
  customer?: { id?: number } | null;
};


/** Appel GraphQL sur la boutique. */
async function gql<T>(creds: Creds, query: string): Promise<T> {
  const r = await fetch(
    `https://${creds.domaine}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": creds.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    },
  );
  const j = (await r.json()) as { data?: T; errors?: { message: string }[] };
  if (j.errors?.length) throw new Error(`GraphQL : ${j.errors[0].message}`);
  return j.data as T;
}

type Remboursement = { id: string; le: string; montant: number };
type Remboursements = Map<string, { total: number; detail: Remboursement[] }>;

/**
 * Montant rembourse, en devise de la boutique, et chaque remboursement date.
 * L'API REST ne l'expose pas de facon fiable : current_total_price_set ne bouge
 * pas apres un remboursement, et les montants des transactions sont dans la
 * devise d'achat du client. Seul totalRefundedSet.shopMoney est juste.
 */
async function recupererRemboursements(creds: Creds, ids: string[]): Promise<Remboursements> {
  const out: Remboursements = new Map();
  type Montant = { shopMoney?: { amount?: string } };
  for (let i = 0; i < ids.length; i += 50) {
    const lot = ids.slice(i, i + 50);
    const gids = lot.map((id) => `"gid://shopify/Order/${id}"`).join(",");
    const data = await gql<{ nodes: ({
      id: string; totalRefundedSet?: Montant;
      refunds?: { id: string; createdAt: string; totalRefundedSet?: Montant }[];
    } | null)[] }>(
      creds,
      `{ nodes(ids: [${gids}]) { ... on Order { id totalRefundedSet { shopMoney { amount } }
          refunds(first: 20) { id createdAt totalRefundedSet { shopMoney { amount } } } } } }`,
    );
    for (const n of data.nodes ?? []) {
      if (!n?.id) continue;
      out.set(n.id.split("/").pop()!, {
        total: nombre(n.totalRefundedSet?.shopMoney?.amount),
        detail: (n.refunds ?? [])
          .map((r) => ({ id: r.id.split("/").pop()!, le: r.createdAt, montant: nombre(r.totalRefundedSet?.shopMoney?.amount) }))
          .filter((r) => r.montant > 0),
      });
    }
    await dormir(PAUSE_MS);
  }
  return out;
}

/**
 * Enregistre les remboursements dates et marque les commandes comme detaillees.
 * Renvoie la plus ancienne date touchee (ISO), pour elargir le recalcul.
 */
async function ecrireRemboursements(admin: Admin, shopId: string, remb: Remboursements) {
  if (!remb.size) return undefined;
  const lignes = [...remb].flatMap(([commande, r]) => r.detail.map((d) => ({
    shop_id: shopId, refund_id: d.id, order_external_id: commande, refunded_at: d.le, amount: d.montant,
  })));
  for (let i = 0; i < lignes.length; i += 500) {
    const { error } = await admin.from("order_refunds")
      .upsert(lignes.slice(i, i + 500), { onConflict: "shop_id,refund_id" });
    // Migration 039 pas encore passee : on garde l'ancienne regle sans rien casser.
    if (error?.code === "PGRST205" || error?.code === "42P01") return undefined;
    if (error) throw new Error(`upsert remboursements : ${error.message}`);
  }
  // Detail incomplet (ecart avec le total) : la commande garde l'ancienne regle,
  // sinon une partie du rembourse disparaitrait du P&L.
  const ids = [...remb].filter(([, r]) =>
    Math.abs(r.detail.reduce((t, d) => t + d.montant, 0) - r.total) < 0.01).map(([id]) => id);
  const { error } = await admin.rpc("set_refunds_synced", { p_shop: shopId, p_ids: ids });
  if (error) throw new Error(`remboursements detailles : ${error.message}`);
  return lignes.reduce<string | undefined>((min, l) => {
    const d = new Date(l.refunded_at).toISOString();
    return !min || d < min ? d : min;
  }, undefined);
}

export async function syncCommandes(
  admin: Admin, creds: Creds, shopId: string, depuis?: string,
  /** Rempli avec la date de la plus ancienne commande relue (ISO UTC). */
  suivi?: { plusAncienne?: string },
) {
  let total = 0;
  const skus = new Map<string, { title?: string; variant_title?: string | null; product_id?: string | null }>();

  const filtres = new URLSearchParams({
    status: "any", limit: "250", fields: CHAMPS_COMMANDE, order: "created_at asc",
  });
  if (depuis) filtres.set("updated_at_min", depuis);

  for await (const lot of pages<CommandeShopify>(creds, `orders.json?${filtres}`, "orders")) {
    if (!lot.length) continue;
    const lignes = lot.map((o) => {
      // Un meme SKU peut apparaitre sur plusieurs lignes : on cumule les quantites.
      const items: Record<string, number> = {};
      for (const li of o.line_items ?? []) {
        // Cle de l'article : SKU, sinon id de variante (boutiques sans SKU,
        // ex. EverHaar). Meme regle que syncProduits.
        const sku = (li.sku || "").trim() || (li.variant_id ? String(li.variant_id) : "");
        if (!sku) continue;
        items[sku] = (items[sku] ?? 0) + (li.quantity ?? 0);
        if (!skus.has(sku))
          skus.set(sku, {
            title: li.title,
            variant_title: li.variant_title ?? null,
            product_id: li.product_id ? String(li.product_id) : null,
          });
      }
      // Les montants shop_money sont deja convertis par Shopify dans la devise
      // de la boutique : aucun taux de change a gerer de notre cote.
      const brut = nombre(o.total_price_set?.shop_money?.amount);

      return {
        shop_id: shopId,
        external_id: String(o.id),
        order_number: o.name,
        order_date: o.created_at,
        country: o.shipping_address?.country_code ?? o.billing_address?.country_code ?? null,
        postal_code: o.shipping_address?.zip ?? o.billing_address?.zip ?? null,
        gateway: o.payment_gateway_names?.[0] ?? null,
        items,
        revenue: brut,
        refunded: 0,
        taxes: nombre(o.current_total_tax_set?.shop_money?.amount ?? o.total_tax_set?.shop_money?.amount),
        shipping_charged: nombre(o.total_shipping_price_set?.shop_money?.amount),
        currency: o.currency,
        customer_external_id: o.customer?.id ? String(o.customer.id) : null,
        financial_status: o.financial_status,
        cancelled_at: o.cancelled_at,
      };
    });

    if (suivi) {
      for (const l of lignes) {
        const d = new Date(l.order_date).toISOString();
        if (!suivi.plusAncienne || d < suivi.plusAncienne) suivi.plusAncienne = d;
      }
    }

    // Seules les commandes marquees remboursees necessitent l'appel GraphQL.
    const aVerifier = lignes
      .filter((l) => l.financial_status && l.financial_status !== "paid" && l.financial_status !== "pending")
      .map((l) => l.external_id);
    const remb = aVerifier.length ? await recupererRemboursements(creds, aVerifier) : new Map() as Remboursements;
    for (const l of lignes) {
      const v = remb.get(l.external_id);
      if (v != null) l.refunded = v.total;
    }

    for (let i = 0; i < lignes.length; i += 500) {
      const { error } = await admin
        .from("orders")
        .upsert(lignes.slice(i, i + 500), { onConflict: "shop_id,external_id" });
      if (error) throw new Error(`upsert commandes : ${error.message}`);
    }
    // Apres l'upsert : une commande nouvelle doit exister avant d'etre marquee detaillee.
    const plusAncienRemb = await ecrireRemboursements(admin, shopId, remb);
    if (suivi && plusAncienRemb && (!suivi.plusAncienne || plusAncienRemb < suivi.plusAncienne))
      suivi.plusAncienne = plusAncienRemb;
    total += lignes.length;
  }

  if (skus.size) {
    await admin.from("shop_skus").upsert(
      // ignoreDuplicates : le catalogue (syncProduits) fait autorite sur les libelles.
      [...skus].map(([sku, v]) => ({ shop_id: shopId, sku, ...v, last_seen_at: new Date().toISOString() })),
      { onConflict: "shop_id,sku" },
    );
  }
  return total;
}


// ──────────────── Remboursements dates (rattrapage) ────────────────

/**
 * Commandes remboursees dont on n'a pas encore la date de chaque remboursement
 * (historique d'avant la migration 039), les plus recentes d'abord, `max` par
 * passe. Tant qu'une commande n'est pas detaillee, son remboursement reste au
 * jour de la commande : rien ne se perd pendant le rattrapage.
 */
export async function syncRemboursementsHistorique(
  admin: Admin, creds: Creds, shopId: string,
  suivi: { plusAncienne?: string }, max = 250,
) {
  const { data, error } = await admin
    .from("orders").select("external_id, order_date")
    .eq("shop_id", shopId).gt("refunded", 0).eq("refunds_synced", false)
    .order("order_date", { ascending: false }).limit(max);
  if (error?.code === "42703") return 0; // migration 039 pas encore passee
  if (error) throw new Error(`lecture remboursements : ${error.message}`);
  if (!data?.length) return 0;

  const remb = await recupererRemboursements(creds, data.map((o) => o.external_id as string));
  const plusAncienRemb = await ecrireRemboursements(admin, shopId, remb);
  // Le remboursement quitte le jour de commande pour le jour du remboursement : les deux bougent.
  for (const d of [plusAncienRemb, ...data.map((o) => new Date(o.order_date as string).toISOString())])
    if (d && (!suivi.plusAncienne || d < suivi.plusAncienne)) suivi.plusAncienne = d;
  return remb.size;
}

// ──────────────── Moyens de paiement (Shopify Payments) ────────────────

type TransactionGql = {
  kind?: string; status?: string; paymentDetails?: DetailTransaction | null;
  paymentIcon?: { altText?: string | null } | null; receiptJson?: string | null;
};

// Du plus riche au plus sobre : si un champ est refuse (scope, donnees protegees,
// version d'API), la passe suivante le retire au lieu de tout faire echouer.
const CHAMPS_TRANSACTION = [
  `paymentDetails { __typename
     ... on CardPaymentDetails { wallet }
     ... on LocalPaymentMethodsPaymentDetails { paymentMethodName } }
   paymentIcon { altText } receiptJson`,
  `paymentIcon { altText } receiptJson`,
  `paymentIcon { altText }`,
];

/** Le moyen le plus precis parmi les trois sources ; "card" seulement si rien de mieux. */
function moyenDeTransactions(tx: TransactionGql[]) {
  const reussies = tx.filter((t) => t.status === "SUCCESS" && ["SALE", "AUTHORIZATION", "CAPTURE"].includes(t.kind ?? ""));
  const candidats = [...reussies, ...tx].flatMap((t) => [
    moyenDepuisDetail(t.paymentDetails), moyenDepuisRecu(t.receiptJson), moyenDepuisIcone(t.paymentIcon?.altText),
  ]).filter((m): m is string => !!m);
  return candidats.find((m) => m !== "card") ?? candidats[0] ?? null;
}

/** Trace compacte de ce que Shopify a renvoye, pour comprendre un echec sans exposer le recu. */
function trace(tx: TransactionGql[]) {
  return tx.slice(0, 3).map((t) => {
    let cles: string[] = [];
    try { cles = t.receiptJson ? Object.keys(JSON.parse(t.receiptJson)).slice(0, 15) : []; } catch { /* recu illisible */ }
    return {
      kind: t.kind, status: t.status, details: t.paymentDetails ?? null,
      icone: t.paymentIcon?.altText ?? null, recu_cles: cles,
    };
  });
}

/**
 * Shopify Payments regroupe carte, Apple Pay, Shop Pay et Klarna sous une seule
 * passerelle : le detail n'existe que sur la transaction. On le lit pour les
 * commandes pas encore detaillees, les plus recentes d'abord, `max` par passe :
 * les nouvelles commandes sont servies tout de suite et l'historique se
 * rattrape de lui-meme au fil des synchros.
 */
export async function syncMoyensPaiement(admin: Admin, creds: Creds, shopId: string, max = 250) {
  const { data, error } = await admin
    .from("orders").select("external_id")
    .eq("shop_id", shopId).eq("gateway", "shopify_payments").is("payment_method", null)
    .order("order_date", { ascending: false }).limit(max);
  // Migration 037 pas encore passee : on saute l'etape sans mettre le connecteur en erreur.
  if (error?.code === "42703") return 0;
  if (error) throw new Error(`lecture moyens de paiement : ${error.message}`);
  const ids = (data ?? []).map((o) => o.external_id as string);

  let total = 0;
  let variante = 0;
  for (let i = 0; i < ids.length; i += 25) {
    const lot = ids.slice(i, i + 25);
    const gids = lot.map((id) => `"gid://shopify/Order/${id}"`).join(",");
    let res: { nodes: ({ id: string; transactions?: TransactionGql[] } | null)[] } | null = null;
    while (!res) {
      try {
        res = await gql(creds, `{ nodes(ids: [${gids}]) { ... on Order { id
          transactions(first: 5) { kind status ${CHAMPS_TRANSACTION[variante]} } } } }`);
      } catch (e) {
        if (++variante >= CHAMPS_TRANSACTION.length) throw e;
      }
    }
    const trouves = new Map<string, string>();
    const traces = new Map<string, unknown>();
    for (const n of res.nodes ?? []) {
      if (!n?.id) continue;
      const id = n.id.split("/").pop()!;
      const m = moyenDeTransactions(n.transactions ?? []);
      if (m) trouves.set(id, m);
      else traces.set(id, { variante, transactions: trace(n.transactions ?? []) });
    }
    // Sans detail lisible, on garde "shopify_payments" : la commande n'est plus redemandee.
    const { error: e } = await admin.rpc("set_order_payment_methods", {
      p_shop: shopId, p_ids: lot, p_methods: lot.map((id) => trouves.get(id) ?? "shopify_payments"),
    });
    if (e) throw new Error(`moyens de paiement : ${e.message}`);
    if (traces.size)
      await admin.rpc("set_order_payment_raw", {
        p_shop: shopId, p_ids: [...traces.keys()], p_raws: [...traces.values()],
      });
    total += lot.length;
    await dormir(PAUSE_MS);
  }
  return total;
}

// ─────────────────────── Catalogue produits ───────────────────────

type VarianteShopify = {
  id: number; sku: string | null; title: string | null;
  price: string | null; image_id: number | null;
};
type ProduitShopify = {
  id: number; title: string; status: string;
  image?: { src?: string } | null;
  images?: { id: number; src: string }[];
  variants?: VarianteShopify[];
};

/**
 * Recupere le catalogue pour connaitre le STATUT de chaque SKU
 * (active / draft / archived) ainsi que son prix et son visuel.
 * Sans ca, impossible de masquer les brouillons dans l'interface.
 */
export async function syncProduits(admin: Admin, creds: Creds, shopId: string) {
  const lignes: Record<string, unknown>[] = [];

  for (const statut of ["active", "draft", "archived"]) {
    const f = new URLSearchParams({
      limit: "250", status: statut,
      fields: "id,title,status,image,images,variants",
    });
    for await (const lot of pages<ProduitShopify>(creds, `products.json?${f}`, "products")) {
      for (const p of lot) {
        const parId = new Map((p.images ?? []).map((i) => [i.id, i.src]));
        for (const v of p.variants ?? []) {
          // Meme cle que les articles des commandes : SKU, sinon id de variante.
          const sku = (v.sku || "").trim() || String(v.id);
          lignes.push({
            shop_id: shopId,
            sku,
            title: p.title,
            product_title: p.title,
            variant_title: v.title && v.title !== "Default Title" ? v.title : null,
            product_id: String(p.id),
            status: p.status,
            price: v.price ? Number(v.price) : null,
            image_url: (v.image_id && parId.get(v.image_id)) || p.image?.src || null,
            last_seen_at: new Date().toISOString(),
          });
        }
      }
    }
  }

  // Un meme SKU peut etre porte par plusieurs variantes (doublons dans le
  // catalogue). Postgres refuse deux upserts sur la meme cle dans un seul lot :
  // on garde la derniere occurrence, en privilegiant les produits actifs.
  const uniques = new Map<string, Record<string, unknown>>();
  for (const l of lignes) {
    const cle = String(l.sku);
    const existant = uniques.get(cle);
    if (!existant || existant.status !== "active") uniques.set(cle, l);
  }
  const finales = [...uniques.values()];

  for (let i = 0; i < finales.length; i += 500) {
    const { error } = await admin
      .from("shop_skus")
      .upsert(finales.slice(i, i + 500), { onConflict: "shop_id,sku" });
    if (error) throw new Error(`upsert produits : ${error.message}`);
  }
  return finales.length;
}

// ───────────────── Frais de transaction REELS ─────────────────

type TransactionSolde = {
  fee: string; amount: string; net: string; processed_at: string; type: string;
  source_order_id: number | null;
};

/**
 * Les frais viennent des transactions de solde Shopify Payments, rattachees a
 * leur date de traitement. C'est plus juste que de les rattacher au versement,
 * qui arrive plusieurs jours plus tard.
 */
export async function syncFrais(
  admin: Admin, creds: Creds, shopId: string, timezone: string, depuis?: string,
) {
  // Shopify ignore processed_at_min sur cet endpoint : sans curseur, il renvoie
  // TOUT l'historique a chaque passage. On memorise le dernier id vu.
  const { data: conn } = await admin
    .from("connectors").select("sync_cursor")
    .eq("shop_id", shopId).eq("platform", "shopify").maybeSingle();
  const curseur = (conn?.sync_cursor ?? {}) as { fees_since_id?: number };
  const incremental = !!depuis && !!curseur.fees_since_id;

  const parJour = new Map<string, number>();
  const parCommande = new Map<string, number>();
  let dernierId = curseur.fees_since_id ?? 0;

  const filtres = new URLSearchParams({ limit: "250" });
  if (incremental) filtres.set("since_id", String(curseur.fees_since_id));

  for await (const lot of pages<TransactionSolde & { id: number }>(
    creds, `shopify_payments/balance/transactions.json?${filtres}`, "transactions",
  )) {
    for (const t of lot) {
      if (t.id > dernierId) dernierId = t.id;
      const frais = Math.abs(nombre(t.fee));
      const jour = jourLocal(t.processed_at, timezone);
      parJour.set(jour, (parJour.get(jour) ?? 0) + frais);
      if (t.source_order_id) {
        const id = String(t.source_order_id);
        parCommande.set(id, (parCommande.get(id) ?? 0) + frais);
      }
    }
  }

  // En incremental, les jours touches doivent etre CUMULES avec l'existant :
  // on ne voit que les nouvelles transactions, pas la journee entiere.
  if (incremental && parJour.size) {
    const jours = [...parJour.keys()];
    const { data: existants } = await admin
      .from("shop_fees_daily").select("date, fees")
      .eq("shop_id", shopId).in("date", jours);
    for (const e of existants ?? [])
      parJour.set(e.date as string, (parJour.get(e.date as string) ?? 0) + Number(e.fees));
  }

  const lignes = [...parJour].map(([date, fees]) => ({
    shop_id: shopId, date, fees, is_real: true, updated_at: new Date().toISOString(),
  }));
  for (let i = 0; i < lignes.length; i += 500) {
    const { error } = await admin
      .from("shop_fees_daily")
      .upsert(lignes.slice(i, i + 500), { onConflict: "shop_id,date" });
    if (error) throw new Error(`upsert frais : ${error.message}`);
  }

  // Frais par commande : une seule requete groupee au lieu d'un UPDATE par ligne.
  if (parCommande.size) {
    const ids = [...parCommande.keys()];
    for (let i = 0; i < ids.length; i += 1000) {
      const tranche = ids.slice(i, i + 1000);
      const { error } = await admin.rpc("apply_order_fees", {
        p_shop: shopId, p_ids: tranche,
        p_fees: tranche.map((id) => parCommande.get(id)),
        p_cumuler: incremental, // une nouvelle transaction s'ajoute aux frais connus
      });
      if (error) throw new Error(`frais par commande : ${error.message}`);
    }
  }

  if (dernierId > (curseur.fees_since_id ?? 0)) {
    await admin.from("connectors")
      .update({ sync_cursor: { ...curseur, fees_since_id: dernierId } })
      .eq("shop_id", shopId).eq("platform", "shopify");
  }
  return lignes.length;
}

// ─────────────────────────── Versements ───────────────────────────

type Payout = {
  id: number; date: string; currency: string; amount: string; status: string;
  summary?: Record<string, string>;
};

export async function syncPayouts(admin: Admin, creds: Creds, shopId: string) {
  let total = 0;
  for await (const lot of pages<Payout>(creds, "shopify_payments/payouts.json?limit=250", "payouts")) {
    if (!lot.length) continue;
    const lignes = lot.map((p) => {
      const s = p.summary ?? {};
      const somme = (suffixe: string) =>
        Object.entries(s)
          .filter(([k]) => k.endsWith(suffixe))
          .reduce((a, [, v]) => a + nombre(v), 0);
      return {
        shop_id: shopId, external_id: String(p.id), date: p.date,
        gross: somme("_gross_amount"), fees: somme("_fee_amount"),
        adjustments: nombre(s.adjustments_gross_amount),
        net: nombre(p.amount), currency: p.currency, status: p.status,
      };
    });
    const { error } = await admin
      .from("shop_payouts")
      .upsert(lignes, { onConflict: "shop_id,external_id" });
    if (error) throw new Error(`upsert payouts : ${error.message}`);
    total += lignes.length;
  }
  return total;
}

// ───────────────────────────── Litiges ─────────────────────────────

type Dispute = {
  id: number; order_id: number | null; initiated_at: string; amount: string;
  reason: string; status: string; currency: string; type?: string;
  evidence_due_by?: string | null; finalized_on?: string | null;
};

export async function syncLitiges(
  admin: Admin, creds: Creds, shopId: string, timezone: string,
  /** Rempli avec le plus ancien jour d'un litige nouveau ou dont le statut a change. */
  suivi?: { plusAncien?: string },
) {
  let total = 0;
  const { data: connus } = await admin
    .from("shop_disputes").select("external_id, status").eq("shop_id", shopId);
  const statuts = new Map((connus ?? []).map((d) => [d.external_id as string, d.status as string]));

  for await (const lot of pages<Dispute>(creds, "shopify_payments/disputes.json?limit=250", "disputes")) {
    if (!lot.length) continue;
    const lignes = lot.map((d) => ({
      shop_id: shopId, external_id: String(d.id),
      order_external_id: d.order_id ? String(d.order_id) : null,
      date: jourLocal(d.initiated_at, timezone),
      amount: nombre(d.amount), reason: d.reason, status: d.status, currency: d.currency,
      type: d.type ?? null,
      evidence_due_by: d.evidence_due_by ?? null,
      finalized_on: d.finalized_on ? jourLocal(d.finalized_on, timezone) : null,
    }));
    // Un litige perdu des semaines apres son ouverture change une journee hors de
    // la fenetre de recalcul : sans ca, la perte n'arrivait jamais dans le P&L.
    if (suivi)
      for (const l of lignes)
        if (statuts.get(l.external_id) !== l.status && (!suivi.plusAncien || l.date < suivi.plusAncien))
          suivi.plusAncien = l.date;
    const { error } = await admin
      .from("shop_disputes")
      .upsert(lignes, { onConflict: "shop_id,external_id" });
    if (error) throw new Error(`upsert litiges : ${error.message}`);
    total += lignes.length;
  }
  return total;
}

// ──────────────────────── Sessions (ShopifyQL) ────────────────────────

/** Shopify n'expose pas les visiteurs uniques : on remonte les sessions. */
export async function syncSessions(
  admin: Admin, creds: Creds, shopId: string, jours = 60,
) {
  const requete = `FROM sessions SHOW sessions, sessions_with_cart_additions GROUP BY day SINCE -${jours}d UNTIL today`;
  const r = await fetch(
    `https://${creds.domaine}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": creds.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `{ shopifyqlQuery(query: ${JSON.stringify(requete)}) {
          parseErrors tableData { rows } } }`,
      }),
    },
  );
  const json = (await r.json()) as {
    data?: { shopifyqlQuery?: { parseErrors?: string[]; tableData?: { rows?: Record<string, string>[] } } };
  };
  const q = json.data?.shopifyqlQuery;
  if (q?.parseErrors?.length) throw new Error(`ShopifyQL : ${q.parseErrors.join(" ; ")}`);

  const lignes = (q?.tableData?.rows ?? []).map((row) => ({
    shop_id: shopId,
    date: String(row.day).slice(0, 10),
    sessions: nombre(row.sessions),
    visitors: 0,
    add_to_carts: nombre(row.sessions_with_cart_additions),
  }));
  if (lignes.length) {
    const { error } = await admin
      .from("shop_sessions")
      .upsert(lignes, { onConflict: "shop_id,date" });
    if (error) throw new Error(`upsert sessions : ${error.message}`);
  }
  return lignes.length;
}

// ─────────────────────────── Orchestration ───────────────────────────

function jourLocal(iso: string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(iso));
}

export async function syncBoutique(
  shopId: string,
  opts: { complet?: boolean } = {},
): Promise<ResultatSync> {
  const admin = createAdminClient();
  const { data: shop, error } = await admin
    .from("shops")
    .select("id, timezone, name")
    .eq("id", shopId)
    .single();
  if (error || !shop) throw new Error("Boutique introuvable.");

  const creds = await chargerCreds(admin, shopId);
  const tz = shop.timezone || "UTC";
  const res: ResultatSync = {
    commandes: 0, moyens_paiement: 0, remboursements: 0, produits: 0, jours_frais: 0, payouts: 0, litiges: 0,
    jours_sessions: 0, jours_recalcules: 0, erreurs: [],
  };

  // `depuis` sert de drapeau "incremental" aux autres etapes (frais...).
  const depuis = opts.complet
    ? undefined
    : new Date(Date.now() - 3 * 86400_000).toISOString();

  // Commandes : on ne relit que ce qui a change depuis la derniere synchro REUSSIE
  // (curseur - 10 min de recouvrement pour les ecarts d'horloge), et on refait le
  // rebalayage de 3 jours une fois par 24 h comme filet de securite. Avant, chaque
  // passe relisait les 3 jours : ~1 130 commandes pour EverHaar toutes les 15 min.
  const debutSync = new Date();
  const { data: connCmd } = await admin
    .from("connectors").select("sync_cursor")
    .eq("shop_id", shopId).eq("platform", "shopify").maybeSingle();
  const cur = (connCmd?.sync_cursor ?? {}) as { orders_updated_min?: string; orders_rescan_at?: string };
  const rebalayage = !opts.complet && (
    !cur.orders_updated_min || !cur.orders_rescan_at ||
    debutSync.getTime() - Date.parse(cur.orders_rescan_at) > 24 * 3600_000
  );
  const depuisCommandes = opts.complet ? undefined
    : rebalayage ? depuis
    : new Date(Math.max(Date.parse(cur.orders_updated_min!) - 10 * 60_000, Date.parse(depuis!))).toISOString();
  res.rebalayage = rebalayage;
  let commandesOk = false;
  const relues: { plusAncienne?: string } = {};
  const litiges: { plusAncien?: string } = {};
  const historique: { plusAncienne?: string } = {};

  const etapes: [keyof ResultatSync, () => Promise<number>][] = [
    ["commandes", async () => {
      const n = await syncCommandes(admin, creds, shopId, depuisCommandes, relues);
      commandesOk = true;
      return n;
    }],
    ["moyens_paiement", () => syncMoyensPaiement(admin, creds, shopId)],
    ["remboursements", () => syncRemboursementsHistorique(admin, creds, shopId, historique)],
    ["produits", () => syncProduits(admin, creds, shopId)],
    ["jours_frais", () => syncFrais(admin, creds, shopId, tz, depuis)],
    ["payouts", () => syncPayouts(admin, creds, shopId)],
    ["litiges", () => syncLitiges(admin, creds, shopId, tz, litiges)],
    ["jours_sessions", () => syncSessions(admin, creds, shopId, opts.complet ? 365 : 30)],
  ];

  for (const [cle, fn] of etapes) {
    try {
      (res[cle] as number) = await fn();
    } catch (e) {
      res.erreurs.push(`${cle} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Le curseur n'avance que si la lecture des commandes est allee au bout : sinon la
  // passe suivante repart du meme point. On prend l'heure de DEBUT de cette synchro,
  // pour relire au prochain passage ce qui a change pendant qu'elle tournait.
  if (commandesOk) {
    const { error: eCur } = await admin.rpc("set_sync_cursor_keys", {
      p_shop: shopId, p_platform: "shopify",
      p_keys: {
        orders_updated_min: debutSync.toISOString(),
        ...(rebalayage || opts.complet ? { orders_rescan_at: debutSync.toISOString() } : {}),
      },
    });
    if (eCur) res.erreurs.push(`curseur commandes : ${eCur.message}`);
  }

  try {
    await admin.rpc("recompute_new_customers", { p_shop: shopId });
    // Le passe est fige : on ne rafraichit que la fenetre utile.
    const jours = opts.complet ? 3650 : 21;
    let debut = new Date(Date.now() - jours * 86400_000).toISOString().slice(0, 10);
    // Un remboursement sur une commande plus ancienne que la fenetre met a jour
    // la commande, mais sa journee n'etait jamais recalculee : le remboursement
    // n'apparaissait nulle part. On elargit jusqu'a la plus ancienne relue
    // (-1 j pour le fuseau), plafonne a 400 jours.
    const plancher = new Date(Date.now() - 400 * 86400_000).toISOString().slice(0, 10);
    const elargir = (jour: string) => {
      const cible = jour < plancher ? plancher : jour;
      if (cible < debut) debut = cible;
    };
    if (relues.plusAncienne)
      elargir(new Date(Date.parse(relues.plusAncienne) - 86400_000).toISOString().slice(0, 10));
    if (litiges.plusAncien) elargir(litiges.plusAncien);
    // Rattrapage des remboursements : des jours anciens changent, sans plafond de 400 j.
    if (historique.plusAncienne) {
      const jour = new Date(Date.parse(historique.plusAncienne) - 86400_000).toISOString().slice(0, 10);
      if (jour < debut) debut = jour;
    }
    const fin = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
    const { data } = await admin.rpc("refresh_daily_facts", {
      p_shop: shopId, p_from: debut, p_to: fin,
    });
    res.jours_recalcules = Number(data ?? 0);
  } catch (e) {
    res.erreurs.push(`cache : ${e instanceof Error ? e.message : String(e)}`);
  }

  await admin
    .from("connectors")
    .update({
      last_sync_at: new Date().toISOString(),
      status: res.erreurs.length ? "error" : "connected",
      last_error: res.erreurs.length ? res.erreurs.join(" | ").slice(0, 500) : null,
    })
    .eq("shop_id", shopId)
    .eq("platform", "shopify");

  return res;
}
