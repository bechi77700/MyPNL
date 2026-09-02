import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/logo";
import Nav from "./nav";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children, params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: boutique } = await supabase
    .from("shops")
    .select("name, currency, timezone")
    .eq("slug", slug)
    .maybeSingle();
  if (!boutique) notFound();

  return (
    <div className="flex min-h-screen gap-0 bg-fond p-0 lg:p-2.5">
      <aside className="hidden w-[228px] shrink-0 flex-col px-3 py-4 lg:flex">
        <div className="px-2">
          <Logo />
        </div>
        <div className="mt-5 rounded-xl border border-bord bg-carte px-3 py-2.5">
          <p className="truncate text-sm font-medium text-texte">{boutique.name}</p>
          <p className="mt-0.5 text-xs text-faible">
            {boutique.currency} · {boutique.timezone.split("/")[1]?.replace("_", " ")}
          </p>
        </div>
        <Nav slug={slug} />
        <div className="mt-auto space-y-0.5 pt-8">
          <Link
            href="/select"
            className="block rounded-xl px-3 py-2 text-xs text-faible transition hover:text-doux"
          >
            Changer de boutique
          </Link>
          <form action="/auth/signout" method="post">
            <button className="block rounded-xl px-3 py-2 text-xs text-faible transition hover:text-doux">
              Se déconnecter
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-hidden bg-panneau lg:rounded-2xl lg:border lg:border-bord">
        {children}
      </main>
    </div>
  );
}
