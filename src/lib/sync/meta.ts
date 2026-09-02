import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt, encrypt } from "@/lib/crypto";

type Admin = ReturnType<typeof createAdminClient>;

export const META_API_VERSION = process.env.META_API_VERSION ?? "v21.0";

export type CompteMeta = {
  id: string; name: string; currency: string; status: number;
};

async function graph<T>(chemin: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`https://graph.facebook.com/${META_API_VERSION}/${chemin}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
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

export async function enregistrerToken(admin: Admin, shopId: string, token: string) {
  await admin.from("connectors").upsert(
    {
      shop_id: shopId, platform: "meta",
      creds_encrypted: encrypt(JSON.stringify({ token })),
      status: "connected", last_error: null,
    },
    { onConflict: "shop_id,platform" },
  );
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
