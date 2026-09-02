import { createAdminClient } from "@/lib/supabase/admin";
import { Logo } from "@/components/logo";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: { searchParams: Promise<{ suite?: string }> }) {
  const { suite } = await searchParams;

  // Aucun profil = toute premiere utilisation : le compte cree devient admin.
  const admin = createAdminClient();
  const { count } = await admin
    .from("profiles").select("id", { count: "exact", head: true });
  const premierCompte = (count ?? 0) === 0;

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <Logo />
        <p className="mt-6 text-[13px] text-doux">
          {premierCompte
            ? "Première connexion — crée ton compte administrateur."
            : "Connecte-toi pour accéder à tes tableaux de bord."}
        </p>
        <div className="mt-7">
          <LoginForm
            premierCompte={premierCompte}
            suite={suite && suite.startsWith("/") ? suite : "/select"}
          />
        </div>
        {premierCompte && (
          <p className="mt-6 text-[11.5px] leading-relaxed text-faible">
            Ce premier compte aura tous les droits : boutiques, coûts et utilisateurs.
          </p>
        )}
      </div>
    </main>
  );
}
