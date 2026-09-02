import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import { SHOPIFY_API_VERSION } from "@/lib/shopify";

type Admin = ReturnType<typeof createAdminClient>;
type Creds = { token: string; domaine: string };

export type ResultatSync = {
  commandes: number;
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
  "line_items", "shipping_address", "billing_address", "customer",
].join(",");

type LigneCommande = {
  sku: string | null;
  quantity: number;
  title?: string;
  variant_title?: string | null;
  product_id?: number | null;
};

type CommandeShopify = {
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

/**
 * Montant rembourse, en devise de la boutique.
 * L'API REST ne l'expose pas de facon fiable : current_total_price_set ne bouge
 * pas apres un remboursement, et les montants des transactions sont dans la
 * devise d'achat du client. Seul totalRefundedSet.shopMoney est juste.
 */
async function recupererRemboursements(
  creds: Creds, ids: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 50) {
    const lot = ids.slice(i, i + 50);
    const gids = lot.map((id) => `"gid://shopify/Order/${id}"`).join(",");
    const data = await gql<{ nodes: ({ id: string; totalRefundedSet?: { shopMoney?: { amount?: string } } } | null)[] }>(
      creds,
      `{ nodes(ids: [${gids}]) { ... on Order { id totalRefundedSet { shopMoney { amount } } } } }`,
    );
    for (const n of data.nodes ?? []) {
      if (!n?.id) continue;
      out.set(n.id.split("/").pop()!, nombre(n.totalRefundedSet?.shopMoney?.amount));
    }
    await dormir(PAUSE_MS);
  }
  return out;
}

export async function syncCommandes(
  admin: Admin, creds: Creds, shopId: string, depuis?: string,
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
        const sku = (li.sku || "").trim();
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

    // Seules les commandes marquees remboursees necessitent l'appel GraphQL.
    const aVerifier = lignes
      .filter((l) => l.financial_status && l.financial_status !== "paid" && l.financial_status !== "pending")
      .map((l) => l.external_id);
    if (aVerifier.length) {
      const remb = await recupererRemboursements(creds, aVerifier);
      for (const l of lignes) {
        const v = remb.get(l.external_id);
        if (v != null) l.refunded = v;
      }
    }

    for (let i = 0; i < lignes.length; i += 500) {
      const { error } = await admin
        .from("orders")
        .upsert(lignes.slice(i, i + 500), { onConflict: "shop_id,external_id" });
      if (error) throw new Error(`upsert commandes : ${error.message}`);
    }
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
          const sku = (v.sku || "").trim();
          if (!sku) continue;
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
  reason: string; status: string; currency: string;
};

export async function syncLitiges(admin: Admin, creds: Creds, shopId: string, timezone: string) {
  let total = 0;
  for await (const lot of pages<Dispute>(creds, "shopify_payments/disputes.json?limit=250", "disputes")) {
    if (!lot.length) continue;
    const lignes = lot.map((d) => ({
      shop_id: shopId, external_id: String(d.id),
      order_external_id: d.order_id ? String(d.order_id) : null,
      date: jourLocal(d.initiated_at, timezone),
      amount: nombre(d.amount), reason: d.reason, status: d.status, currency: d.currency,
    }));
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
    commandes: 0, produits: 0, jours_frais: 0, payouts: 0, litiges: 0,
    jours_sessions: 0, jours_recalcules: 0, erreurs: [],
  };

  // En incremental on rebalaie 3 jours en arriere pour rattraper les trous.
  const depuis = opts.complet
    ? undefined
    : new Date(Date.now() - 3 * 86400_000).toISOString();

  const etapes: [keyof ResultatSync, () => Promise<number>][] = [
    ["commandes", () => syncCommandes(admin, creds, shopId, depuis)],
    ["produits", () => syncProduits(admin, creds, shopId)],
    ["jours_frais", () => syncFrais(admin, creds, shopId, tz, depuis)],
    ["payouts", () => syncPayouts(admin, creds, shopId)],
    ["litiges", () => syncLitiges(admin, creds, shopId, tz)],
    ["jours_sessions", () => syncSessions(admin, creds, shopId, opts.complet ? 365 : 30)],
  ];

  for (const [cle, fn] of etapes) {
    try {
      (res[cle] as number) = await fn();
    } catch (e) {
      res.erreurs.push(`${cle} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  try {
    await admin.rpc("recompute_new_customers", { p_shop: shopId });
    // Le passe est fige : on ne rafraichit que la fenetre utile.
    const jours = opts.complet ? 3650 : 21;
    const debut = new Date(Date.now() - jours * 86400_000).toISOString().slice(0, 10);
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
