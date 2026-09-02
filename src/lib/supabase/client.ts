import { createBrowserClient } from "@supabase/ssr";

/** Client Supabase cote navigateur. Utilise la cle publiable (jamais la secrete). */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
