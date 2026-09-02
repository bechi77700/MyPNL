import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Client d'administration : contourne le RLS.
 * A n'utiliser QUE cote serveur (synchro, cron, creation d'utilisateurs).
 * Ne jamais importer depuis un composant client.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
