"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function adminRequis() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profil } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profil?.role !== "admin") throw new Error("Réservé aux administrateurs.");
  return { moi: user.id, admin: createAdminClient() };
}

function retour(slug: string, cle: "ok" | "erreur", msg: string) {
  redirect(`/dashboard/${slug}/users?${new URLSearchParams({ [cle]: msg })}`);
}

/** Invitation par email : Supabase envoie le lien, l'invite choisit son mot de passe. */
export async function inviter(slug: string, form: FormData): Promise<void> {
  const { admin } = await adminRequis();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const role = form.get("role") === "admin" ? "admin" : "member";
  const boutiques = form.getAll("boutiques").map(String);
  if (!email) retour(slug, "erreur", "Email manquant.");

  const origine = String(form.get("origine") ?? "");
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origine}/reset`,
  });
  if (error) retour(slug, "erreur", error.message);

  // Le trigger a cree le profil en 'member' : on applique le role et les acces choisis.
  if (data.user) {
    await admin.from("profiles")
      .update({ role, allowed_shops: role === "admin" ? [] : boutiques })
      .eq("id", data.user.id);
  }
  revalidatePath(`/dashboard/${slug}/users`);
  retour(slug, "ok", `Invitation envoyée à ${email}.`);
}

export async function modifierAcces(slug: string, form: FormData): Promise<void> {
  const { moi, admin } = await adminRequis();
  const id = String(form.get("id") ?? "");
  const role = form.get("role") === "admin" ? "admin" : "member";
  const boutiques = form.getAll("boutiques").map(String);
  if (id === moi && role !== "admin")
    retour(slug, "erreur", "Tu ne peux pas te retirer tes propres droits d'administrateur.");

  const { error } = await admin.from("profiles")
    .update({ role, allowed_shops: role === "admin" ? [] : boutiques })
    .eq("id", id);
  if (error) retour(slug, "erreur", error.message);
  revalidatePath(`/dashboard/${slug}/users`);
  retour(slug, "ok", "Accès mis à jour.");
}

export async function retirer(slug: string, id: string): Promise<void> {
  const { moi, admin } = await adminRequis();
  if (id === moi) retour(slug, "erreur", "Tu ne peux pas supprimer ton propre compte.");
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) retour(slug, "erreur", error.message);
  revalidatePath(`/dashboard/${slug}/users`);
  retour(slug, "ok", "Utilisateur retiré.");
}
