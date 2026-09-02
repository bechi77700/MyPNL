import { createAdminClient } from "@/lib/supabase/admin";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ suite?: string }>;
}) {
  const { suite } = await searchParams;

  // Aucun profil en base = toute premiere utilisation.
  // Le compte cree devient automatiquement administrateur (trigger handle_new_user).
  const admin = createAdminClient();
  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true });
  const premierCompte = (count ?? 0) === 0;

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">
            MyPNL
          </h1>
          <p className="mt-1.5 text-sm text-neutral-500">
            {premierCompte
              ? "Première connexion — crée ton compte administrateur."
              : "Connecte-toi pour accéder à tes tableaux de bord."}
          </p>
        </div>

        <LoginForm
          premierCompte={premierCompte}
          suite={suite && suite.startsWith("/") ? suite : "/select"}
        />

        {premierCompte && (
          <p className="mt-6 text-xs leading-relaxed text-neutral-600">
            Ce premier compte aura tous les droits : gestion des boutiques, des
            coûts et des autres utilisateurs.
          </p>
        )}
      </div>
    </main>
  );
}
