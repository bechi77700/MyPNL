import { createClient } from "@/lib/supabase/server";
import {
  ajouterDepenseManuelle, basculerCompte, connecterMeta,
  importerCsvDepenses, synchroniserMaintenant,
} from "@/lib/actions/integrations";
import { Bouton, Carte, Champ, EnTetePage, Message, Pastille } from "@/components/ui";

export const dynamic = "force-dynamic";

const PLATEFORMES: [string, string][] = [
  ["meta", "Meta"], ["google", "Google"], ["tiktok", "TikTok"],
  ["snapchat", "Snapchat"], ["pinterest", "Pinterest"], ["manual", "Autre"],
];

export default async function IntegrationsPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const { slug } = await params;
  const { ok, erreur } = await searchParams;

  const supabase = await createClient();
  const { data: boutique } = await supabase
    .from("shops").select("id, currency, name").eq("slug", slug).maybeSingle();
  const shopId = boutique!.id as string;
  const devise = boutique!.currency as string;

  const [{ data: etats }, { data: comptes }, { data: depenses }] = await Promise.all([
    supabase.rpc("integrations_status", { p_shop: shopId }),
    supabase.from("ad_accounts").select("*").eq("shop_id", shopId).order("name"),
    supabase.from("ad_spend").select("platform, amount").eq("shop_id", shopId),
  ]);

  const parPlateforme = new Map<string, number>();
  for (const d of depenses ?? [])
    parPlateforme.set(d.platform, (parPlateforme.get(d.platform) ?? 0) + Number(d.amount));

  type Etat = {
    platform: string; status: string | null;
    last_sync_at: string | null; last_error: string | null;
    expires_at: string | null; jours_restants: number | null;
  };
  const listeEtats = (etats ?? []) as Etat[];
  const shopify = listeEtats.find((e) => e.platform === "shopify");
  const meta = listeEtats.find((e) => e.platform === "meta");
  const comptesMeta = (comptes ?? []).filter((c) => c.platform === "meta");

  const cls = "rounded-[7px] border border-bord bg-fond px-3 py-2 text-texte outline-none transition focus:border-accent/60";

  return (
    <div className="px-7 py-8">
      <EnTetePage
        titre="Integrations"
        sous="Sources de données : ventes, dépenses publicitaires et frais réels."
        action={
          <form action={synchroniserMaintenant.bind(null, slug)}>
            <input type="hidden" name="quoi" value="tout" />
            <Bouton type="submit">Synchroniser maintenant</Bouton>
          </form>
        }
      />
      <Message ok={ok} erreur={erreur} />

      {/* ── Shopify ── */}
      <Carte className="px-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 font-medium text-texte">
              Shopify
              <Pastille ton={shopify?.status === "connected" ? "vert" : "ambre"}>
                {shopify?.status === "connected" ? "connecté" : (shopify?.status ?? "absent")}
              </Pastille>
            </p>
            <p className="mt-1 text-[13px] text-faible">
              Commandes, frais de transaction réels, litiges et sessions.
              {shopify?.last_sync_at && (
                <> Dernière synchro : {new Date(shopify.last_sync_at).toLocaleString("fr-FR")}.</>
              )}
            </p>
            {shopify?.last_error && (
              <p className="mt-1 text-[13px] text-negatif">{shopify.last_error}</p>
            )}
          </div>
          <form action={synchroniserMaintenant.bind(null, slug)}>
            <input type="hidden" name="quoi" value="shopify" />
            <Bouton variante="discret" type="submit">Synchroniser</Bouton>
          </form>
        </div>
      </Carte>

      {/* ── Meta ── */}
      <Carte className="mt-3 px-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 font-medium text-texte">
              Meta Ads
              <Pastille ton={meta?.status === "connected" ? "vert" : "neutre"}>
                {meta?.status === "connected" ? "connecté" : "non connecté"}
              </Pastille>
            </p>
            <p className="mt-1 text-[13px] text-faible">
              Dépense publicitaire quotidienne.
              {parPlateforme.get("meta") != null && (
                <> Total importé : {Math.round(parPlateforme.get("meta")!).toLocaleString("fr-FR")} {devise}.</>
              )}
            </p>
            {meta?.expires_at && (
              <p className={`mt-1 text-[13px] ${
                (meta.jours_restants ?? 99) <= 0 ? "text-negatif"
                : (meta.jours_restants ?? 99) <= 10 ? "text-alerte" : "text-faible"
              }`}>
                {(meta.jours_restants ?? 0) <= 0
                  ? "Jeton expiré — reconnecte Meta pour reprendre la synchro."
                  : `Jeton valable encore ${meta.jours_restants} jours (jusqu'au ${new Date(meta.expires_at).toLocaleDateString("fr-FR")}).`}
              </p>
            )}
            {meta?.last_error && <p className="mt-1 text-[13px] text-negatif">{meta.last_error}</p>}
          </div>
          {meta?.status === "connected" && (
            <form action={synchroniserMaintenant.bind(null, slug)}>
              <input type="hidden" name="quoi" value="meta" />
              <Bouton variante="discret" type="submit">Synchroniser</Bouton>
            </form>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <form action="/api/connect/meta/start" method="post">
            <input type="hidden" name="slug" value={slug} />
            <Bouton type="submit" variante={meta?.status === "connected" ? "discret" : "principal"}>
              {meta?.status === "connected" ? "Reconnecter Meta" : "Connecter Meta"}
            </Bouton>
          </form>
          <span className="text-[11.5px] text-faible">
            Tu seras redirigé vers Facebook pour autoriser la lecture de tes
            comptes publicitaires. Aucun droit d&apos;écriture n&apos;est demandé.
          </span>
        </div>

        <details className="mt-3">
          <summary className="cursor-pointer text-[11.5px] text-faible transition-colors hover:text-doux">
            Coller un jeton à la main
          </summary>
          <form action={connecterMeta.bind(null, slug)} className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Champ name="token" required type="password" placeholder="Jeton d'accès Meta" className="flex-1" />
            <Bouton type="submit" variante="discret">Enregistrer</Bouton>
          </form>
        </details>

        {comptesMeta.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-faible">
              Comptes publicitaires — active ceux à suivre pour {boutique!.name}
            </p>
            <div className="divide-y divide-bord overflow-hidden rounded-[7px] border border-bord">
              {comptesMeta.map((c) => {
                const mauvaiseDevise = c.currency && c.currency !== devise;
                return (
                  <div key={c.id} className="flex items-center justify-between gap-3 bg-fond px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] text-texte">{c.name}</p>
                      <p className="flex items-center gap-2 text-[11.5px] text-faible">
                        {c.external_id} · {c.currency}
                        {mauvaiseDevise && <Pastille ton="ambre">devise ≠ {devise}</Pastille>}
                        {c.last_error && <span className="text-negatif">{c.last_error}</span>}
                      </p>
                    </div>
                    <form action={basculerCompte.bind(null, slug, c.id, !c.enabled)}>
                      <button
                        className={`rounded-[7px] border px-3 py-1.5 text-[11.5px] transition ${
                          c.enabled
                            ? "border-accent/40 text-accent"
                            : "border-bord text-faible hover:text-doux"
                        }`}
                      >
                        {c.enabled ? "suivi" : "ignoré"}
                      </button>
                    </form>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[11.5px] text-faible">
              Un compte dans une autre devise que {devise} est ignoré à la synchro :
              additionner des devises fausserait le P&amp;L.
            </p>
          </div>
        )}
      </Carte>

      {/* ── Saisie manuelle ── */}
      <Carte className="mt-3 px-5 py-5">
        <p className="font-medium text-texte">Dépense manuelle</p>
        <p className="mt-1 text-[13px] text-faible">
          Pour une plateforme non connectée. Le montant est réparti au prorata des
          jours de la période.
        </p>
        <form action={ajouterDepenseManuelle.bind(null, slug)} className="mt-4 flex flex-wrap items-end gap-2.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] text-faible">Plateforme</span>
            <select name="platform" className={cls}>
              {PLATEFORMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] text-faible">Du</span>
            <Champ name="du" type="date" required className="chiffres" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] text-faible">Au</span>
            <Champ name="au" type="date" required className="chiffres" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] text-faible">Montant total ({devise})</span>
            <Champ name="montant" type="number" step="0.01" min="0" required className="chiffres w-32 text-right" />
          </label>
          <Bouton type="submit" variante="discret">Ajouter</Bouton>
        </form>
      </Carte>

      {/* ── Import CSV ── */}
      <Carte className="mt-3 px-5 py-5">
        <p className="font-medium text-texte">Importer un export Ads Manager</p>
        <p className="mt-1 max-w-2xl text-[13px] text-faible">
          Pour récupérer la dépense d&apos;un compte publicitaire désactivé, que Meta
          refuse de reconnecter. Dans Ads Manager, ouvre le compte, mets la
          ventilation <b className="text-doux">par jour</b>, puis exporte en CSV.
          Je détecte tout seul les colonnes de date et de montant.
        </p>
        <form action={importerCsvDepenses.bind(null, slug)} className="mt-4 flex flex-wrap items-end gap-2.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] text-faible">Plateforme</span>
            <select name="platform" className={cls}>
              {PLATEFORMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] text-faible">Fichier CSV</span>
            <input
              type="file" name="fichier" accept=".csv,text/csv" required
              className="rounded-[7px] border border-bord bg-fond px-3 py-1.5 text-[13px] text-doux file:mr-3 file:rounded-[7px] file:border-0 file:bg-carte-haut file:px-3 file:py-1.5 file:text-texte"
            />
          </label>
          <Bouton type="submit" variante="discret">Importer</Bouton>
        </form>
      </Carte>

      {parPlateforme.size > 0 && (
        <p className="mt-5 text-[13px] text-faible">
          Dépense enregistrée :{" "}
          {[...parPlateforme].map(([p, v]) =>
            `${PLATEFORMES.find((x) => x[0] === p)?.[1] ?? p} ${Math.round(v).toLocaleString("fr-FR")} ${devise}`,
          ).join(" · ")}
        </p>
      )}
    </div>
  );
}
