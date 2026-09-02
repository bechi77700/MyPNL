import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/logo";
import Nav, { NavMobile } from "./nav";
import { SelecteurBoutique } from "@/components/selecteur-boutique";

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

  const [{ data: boutique }, { data: profil }, { data: toutes }] = await Promise.all([
    supabase.from("shops").select("slug, name, currency, timezone").eq("slug", slug).maybeSingle(),
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase.from("shops").select("slug, name, currency, timezone").eq("is_active", true).order("name"),
  ]);
  if (!boutique) notFound();
  const estAdmin = profil?.role === "admin";

  return (
    <div className="min-h-screen bg-fond lg:flex">
      <NavMobile slug={slug} boutique={boutique.name} estAdmin={estAdmin} courante={boutique} boutiques={toutes ?? [boutique]} />
      <aside className="hidden w-[224px] shrink-0 flex-col px-3 py-5 lg:flex">
        <div className="px-2.5 pt-1">
          <Logo />
        </div>
        <SelecteurBoutique courante={boutique} boutiques={toutes ?? [boutique]} estAdmin={estAdmin} />
        <Nav slug={slug} estAdmin={estAdmin} />
      </aside>

      <main className="min-w-0 flex-1 overflow-hidden bg-panneau">
        <div className="apparait">{children}</div>
      </main>
    </div>
  );
}
