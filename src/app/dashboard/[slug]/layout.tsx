import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "./nav";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Le RLS suffit : une boutique non autorisee ne remonte pas, meme via l'URL.
  const { data: boutique } = await supabase
    .from("shops")
    .select("name, currency, timezone")
    .eq("slug", slug)
    .maybeSingle();
  if (!boutique) notFound();

  return (
    <div className="flex min-h-screen bg-neutral-50">
      <aside className="flex w-60 shrink-0 flex-col bg-neutral-950 px-4 py-6">
        <div className="px-2">
          <p className="text-sm font-semibold text-neutral-100">MyPNL</p>
          <p className="mt-0.5 truncate text-xs text-neutral-500">
            {boutique.name}
          </p>
        </div>
        <Nav slug={slug} />
        <div className="mt-auto space-y-1 px-1 pt-8">
          <Link
            href="/select"
            className="block rounded-lg px-2 py-1.5 text-xs text-neutral-500 transition hover:text-neutral-300"
          >
            Changer de boutique
          </Link>
          <form action="/auth/signout" method="post">
            <button className="block rounded-lg px-2 py-1.5 text-xs text-neutral-500 transition hover:text-neutral-300">
              Se déconnecter
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
