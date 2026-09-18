import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/** Nombre de requetes rejouees pour cause d'horloge Supabase (lu par la route cron). */
export const reprisesJwt = { n: 0 };

/**
 * Supabase refuse parfois une requete avec « JWT issued at future » : le jeton
 * interne qu'il vient de fabriquer est date une fraction de seconde en avance
 * sur l'horloge du service qui le verifie. Observe le 2026-09-18 sur 2 appels
 * cron sur 9, a la seconde 00 pile.
 * Un jeton refuse a l'authentification n'a RIEN execute : rejouer la requete
 * est donc sans risque, y compris pour une ecriture. On attend 1 s (le temps
 * que l'horloge en retard rattrape), deux fois au plus, puis on laisse l'erreur
 * remonter telle quelle.
 */
async function fetchTolerant(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  for (let essai = 0; ; essai++) {
    const res = await fetch(input, init);
    if (res.ok || essai >= 2) return res;
    const corps = await res.clone().text().catch(() => "");
    if (!/JWT issued at future/i.test(corps)) return res;
    reprisesJwt.n++;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

/**
 * Client d'administration : contourne le RLS.
 * A n'utiliser QUE cote serveur (synchro, cron, creation d'utilisateurs).
 * Ne jamais importer depuis un composant client.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: fetchTolerant } },
  );
}
