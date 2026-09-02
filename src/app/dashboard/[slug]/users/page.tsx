import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { inviter, modifierAcces, retirer } from "@/lib/actions/users";
import { Bouton, Champ, EnTetePage, Message, Pastille, Section, Selecteur, Vide } from "@/components/ui";

export const dynamic = "force-dynamic";

type Profil = { id: string; email: string | null; role: string; allowed_shops: string[]; created_at: string };
type Boutique = { id: string; name: string; slug: string };

export default async function UsersPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const { slug } = await params;
  const { ok, erreur } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: moi }, { data: profils }, { data: boutiques }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase.from("profiles").select("id, email, role, allowed_shops, created_at").order("created_at"),
    supabase.from("shops").select("id, name, slug").eq("is_active", true).order("name"),
  ]);
  if (moi?.role !== "admin") redirect(`/dashboard/${slug}`);

  const h = await headers();
  const origine = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const liste = (profils ?? []) as Profil[];
  const shops = (boutiques ?? []) as Boutique[];

  return (
    <div className="px-6 py-6">
      <EnTetePage
        titre="Utilisateurs"
        sous="Qui accède à MyPNL, avec quels droits. Un membre ne voit que les boutiques que tu lui attribues, même en tapant l'URL."
      />
      <Message ok={ok} erreur={erreur} />

      <Section titre={`${liste.length} compte${liste.length > 1 ? "s" : ""}`}>
        <div className="divide-y divide-bord/60">
          {liste.map((p) => {
            const estMoi = p.id === user.id;
            return (
              <form key={p.id} action={modifierAcces.bind(null, slug)}
                className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_150px_minmax(0,1.4fr)_auto] lg:items-center">
                <input type="hidden" name="id" value={p.id} />
                <div className="min-w-0">
                  <p className="flex items-center gap-2 truncate text-[13px] text-texte">
                    {p.email ?? "—"}
                    {estMoi && <Pastille ton="bleu">toi</Pastille>}
                  </p>
                  <p className="text-[11px] text-faible">
                    depuis le {new Date(p.created_at).toLocaleDateString("fr-FR")}
                  </p>
                </div>
                <Selecteur name="role" defaultValue={p.role} disabled={estMoi}>
                  <option value="admin">Administrateur</option>
                  <option value="member">Membre</option>
                </Selecteur>
                <div className="flex flex-wrap gap-1.5">
                  {shops.map((b) => (
                    <label key={b.id} className="inline-flex cursor-pointer items-center gap-1.5 rounded-[10px] bg-carte-haut px-2.5 py-1 text-[12px] text-doux has-[:checked]:border-accent/40 has-[:checked]:bg-accent/10 has-[:checked]:text-accent">
                      <input type="checkbox" name="boutiques" value={b.id}
                        defaultChecked={p.role === "admin" || p.allowed_shops?.includes(b.id)}
                        disabled={p.role === "admin"} className="sr-only" />
                      {b.name}
                    </label>
                  ))}
                  {p.role === "admin" && <span className="self-center text-[11px] text-faible">toutes (admin)</span>}
                </div>
                <div className="flex items-center gap-1.5">
                  <Bouton type="submit" variante="discret">Enregistrer</Bouton>
                  {!estMoi && (
                    <Bouton type="submit" variante="danger" formAction={retirer.bind(null, slug, p.id)}
                      title="Supprimer ce compte">Retirer</Bouton>
                  )}
                </div>
              </form>
            );
          })}
        </div>
      </Section>

      <Section titre="Inviter quelqu'un" className="mt-3">
        <form action={inviter.bind(null, slug)} className="flex flex-wrap items-end gap-2.5 px-5 py-4">
          <input type="hidden" name="origine" value={origine} />
          <label className="flex flex-col gap-1.5">
            <span className="surtitre">Email</span>
            <Champ name="email" type="email" required placeholder="prenom@entreprise.com" className="w-64" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="surtitre">Rôle</span>
            <Selecteur name="role" defaultValue="member">
              <option value="member">Membre</option>
              <option value="admin">Administrateur</option>
            </Selecteur>
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="surtitre">Boutiques (membre)</span>
            <div className="flex flex-wrap gap-1.5">
              {shops.map((b) => (
                <label key={b.id} className="inline-flex cursor-pointer items-center gap-1.5 rounded-[10px] bg-carte-haut px-2.5 py-[7px] text-[12px] text-doux has-[:checked]:border-accent/40 has-[:checked]:bg-accent/10 has-[:checked]:text-accent">
                  <input type="checkbox" name="boutiques" value={b.id} className="sr-only" />{b.name}
                </label>
              ))}
            </div>
          </div>
          <Bouton type="submit">Envoyer l&apos;invitation</Bouton>
        </form>
        <p className="border-t border-bord px-5 py-3 text-[11.5px] text-faible">
          La personne reçoit un email avec un lien pour choisir son mot de passe. Un
          administrateur voit tout et peut modifier les coûts ; un membre consulte
          uniquement les boutiques cochées.
        </p>
      </Section>

      {shops.length === 0 && (
        <div className="mt-3"><Vide titre="Aucune boutique à attribuer" /></div>
      )}
    </div>
  );
}
