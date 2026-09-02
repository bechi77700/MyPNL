import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt, encrypt } from "@/lib/crypto";

type Admin = ReturnType<typeof createAdminClient>;

export const META_API_VERSION = process.env.META_API_VERSION ?? "v26.0";


// ─────────────────────────── OAuth Meta ───────────────────────────

/** Le seul scope necessaire : lire les performances. Aucune ecriture. */
export const META_SCOPES = "ads_read";

export function urlAutorisationMeta(opts: {
  clientId: string; redirectUri: string; state: string;
}) {
  const p = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    state: opts.state,
    response_type: "code",
  });
  // "Facebook Login for Business" porte les permissions dans une configuration
  // cote Meta : on passe son identifiant plutot qu'une liste de scopes.
  const config = process.env.META_LOGIN_CONFIG_ID;
  if (config) p.set("config_id", config);
  else p.set("scope", META_SCOPES);
  return `https://www.facebook.com/${META_API_VERSION}/dialog/oauth?${p}`;
}

/**
 * Echange le code contre un jeton longue duree (60 jours).
 * Meta ne delivre pas de jeton perpetuel par ce chemin : on stocke la date
 * d'expiration pour prevenir l'utilisateur avant la coupure.
 */
export async function echangerCodeMeta(opts: {
  code: string; redirectUri: string;
}): Promise<{ token: string; expire_le: string | null }> {
  const clientId = process.env.META_APP_ID!;
  const secret = process.env.META_APP_SECRET!;

  const court = await graph<{ access_token?: string }>("oauth/access_token", "", {
    client_id: clientId,
    client_secret: secret,
    redirect_uri: opts.redirectUri,
    code: opts.code,
  });
  if (!court.access_token) throw new Error("Meta n'a pas renvoyé de jeton.");

  const long = await graph<{ access_token?: string; expires_in?: number }>(
    "oauth/access_token", "",
    {
      grant_type: "fb_exchange_token",
      client_id: clientId,
      client_secret: secret,
      fb_exchange_token: court.access_token,
    },
  );
  const token = long.access_token ?? court.access_token;
  const expire_le = long.expires_in
    ? new Date(Date.now() + long.expires_in * 1000).toISOString()
    : null;
  return { token, expire_le };
}

export type CompteMeta = {
  id: string; name: string; currency: string; status: number;
};

async function graph<T>(chemin: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`https://graph.facebook.com/${META_API_VERSION}/${chemin}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (token) url.searchParams.set("access_token", token);
  const r = await fetch(url);
  const j = (await r.json()) as { error?: { message: string } } & T;
  if (j.error) throw new Error(`Meta : ${j.error.message}`);
  return j;
}

/** Liste les comptes publicitaires accessibles avec ce token. */
export async function listerComptes(token: string): Promise<CompteMeta[]> {
  const j = await graph<{ data?: { id: string; name: string; currency: string; account_status: number }[] }>(
    "me/adaccounts", token,
    { fields: "id,name,currency,account_status", limit: "200" },
  );
  return (j.data ?? []).map((c) => ({
    id: c.id.replace(/^act_/, ""),
    name: c.name,
    currency: c.currency,
    status: c.account_status,
  }));
}

export async function chargerToken(admin: Admin, shopId: string): Promise<string> {
  const { data } = await admin
    .from("connectors").select("creds_encrypted")
    .eq("shop_id", shopId).eq("platform", "meta").maybeSingle();
  if (!data?.creds_encrypted) throw new Error("Meta n'est pas connecté.");
  return (JSON.parse(decrypt(data.creds_encrypted)) as { token: string }).token;
}

export async function enregistrerToken(
  admin: Admin, shopId: string, token: string, expire_le?: string | null,
) {
  await admin.from("connectors").upsert(
    {
      shop_id: shopId, platform: "meta",
      creds_encrypted: encrypt(JSON.stringify({ token, expire_le: expire_le ?? null })),
      status: "connected", last_error: null,
    },
    { onConflict: "shop_id,platform" },
  );
}

/** Date d'expiration du jeton Meta, pour prevenir avant la coupure. */
export async function expirationToken(admin: Admin, shopId: string) {
  const { data } = await admin
    .from("connectors").select("creds_encrypted")
    .eq("shop_id", shopId).eq("platform", "meta").maybeSingle();
  if (!data?.creds_encrypted) return null;
  const c = JSON.parse(decrypt(data.creds_encrypted)) as { expire_le?: string | null };
  return c.expire_le ?? null;
}

/**
 * Depense quotidienne d'un compte, agregee au niveau compte.
 * Meta renvoie les montants dans la devise du compte : on refuse
 * silencieusement toute devise differente de celle de la boutique,
 * plutot que d'additionner des euros a des dollars.
 */
export async function syncSpendMeta(
  admin: Admin, shopId: string, opts: { jours?: number } = {},
) {
  const token = await chargerToken(admin, shopId);
  const { data: shop } = await admin
    .from("shops").select("currency").eq("id", shopId).single();
  const { data: comptes } = await admin
    .from("ad_accounts").select("*")
    .eq("shop_id", shopId).eq("platform", "meta").eq("enabled", true);

  const jours = opts.jours ?? 30;
  const depuis = new Date(Date.now() - jours * 86400_000).toISOString().slice(0, 10);
  const jusqua = new Date().toISOString().slice(0, 10);

  const parJour = new Map<string, number>();
  const erreurs: string[] = [];

  for (const c of comptes ?? []) {
    if (c.currency && shop?.currency && c.currency !== shop.currency) {
      erreurs.push(
        `${c.name} est en ${c.currency}, la boutique en ${shop.currency} : compte ignoré.`,
      );
      continue;
    }
    try {
      let url: string | null = null;
      let page = await graph<{ data?: { date_start: string; spend: string }[]; paging?: { next?: string } }>(
        `act_${c.external_id}/insights`, token,
        {
          fields: "spend", level: "account", time_increment: "1",
          time_range: JSON.stringify({ since: depuis, until: jusqua }),
          limit: "500",
        },
      );
      for (;;) {
        for (const l of page.data ?? []) {
          const v = Number(l.spend) || 0;
          parJour.set(l.date_start, (parJour.get(l.date_start) ?? 0) + v);
        }
        url = page.paging?.next ?? null;
        if (!url) break;
        page = (await (await fetch(url)).json()) as typeof page;
      }
      await admin.from("ad_accounts")
        .update({ last_sync_at: new Date().toISOString(), last_error: null })
        .eq("id", c.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      erreurs.push(`${c.name} : ${msg}`);
      await admin.from("ad_accounts").update({ last_error: msg.slice(0, 300) }).eq("id", c.id);
    }
  }

  const lignes = [...parJour].map(([date, amount]) => ({
    shop_id: shopId, date, platform: "meta", amount,
    source: "api", updated_at: new Date().toISOString(),
  }));
  for (let i = 0; i < lignes.length; i += 500) {
    const { error } = await admin
      .from("ad_spend")
      .upsert(lignes.slice(i, i + 500), { onConflict: "shop_id,date,platform" });
    if (error) throw new Error(`upsert ad_spend : ${error.message}`);
  }

  await admin.from("connectors")
    .update({
      last_sync_at: new Date().toISOString(),
      status: erreurs.length ? "error" : "connected",
      last_error: erreurs.length ? erreurs.join(" | ").slice(0, 500) : null,
    })
    .eq("shop_id", shopId).eq("platform", "meta");

  return { jours: lignes.length, erreurs };
}
