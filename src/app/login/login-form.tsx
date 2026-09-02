"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm({
  premierCompte,
  suite,
}: {
  premierCompte: boolean;
  suite: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function motDePasseOublie() {
    if (!email) { setErreur("Entre ton email d'abord."); return; }
    setErreur(null);
    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset`,
    });
    if (error) setErreur(traduire(error.message));
    else setInfo("Email envoyé. Ouvre le lien qu'il contient pour choisir un nouveau mot de passe.");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    const supabase = createClient();

    const { error } = premierCompte
      ? await supabase.auth.signUp({ email, password: motDePasse })
      : await supabase.auth.signInWithPassword({ email, password: motDePasse });

    if (error) {
      setErreur(traduire(error.message));
      setEnCours(false);
      return;
    }
    router.push(suite);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-[13px] text-doux">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-[7px] border border-bord bg-carte px-3.5 py-2.5 text-texte outline-none transition placeholder:text-faible focus:border-accent/60"
          placeholder="toi@exemple.com"
        />
      </div>

      <div>
        <label htmlFor="mdp" className="mb-1.5 block text-[13px] text-doux">
          Mot de passe
        </label>
        <input
          id="mdp"
          type="password"
          required
          minLength={8}
          autoComplete={premierCompte ? "new-password" : "current-password"}
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          className="w-full rounded-[7px] border border-bord bg-carte px-3.5 py-2.5 text-texte outline-none transition placeholder:text-faible focus:border-accent/60"
          placeholder={premierCompte ? "8 caractères minimum" : "••••••••"}
        />
      </div>

      {info && (
        <p className="rounded-[8px] border border-accent/40 bg-accent/10 px-3.5 py-2.5 text-[13px] text-accent">{info}</p>
      )}
      {erreur && (
        <p className="rounded-[7px] border border-negatif/40 bg-negatif/10 px-3.5 py-2.5 text-[13px] text-negatif">
          {erreur}
        </p>
      )}

      <button
        type="submit"
        disabled={enCours}
        className="btn-principal w-full rounded-[8px] px-4 py-2.5 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
      >
        {enCours
          ? "Un instant…"
          : premierCompte
            ? "Créer mon compte administrateur"
            : "Se connecter"}
      </button>
      {!premierCompte && (
        <button type="button" onClick={motDePasseOublie}
          className="w-full text-center text-[12px] text-faible transition-colors hover:text-doux">
          Mot de passe oublié ?
        </button>
      )}
    </form>
  );
}

function traduire(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "Email ou mot de passe incorrect.";
  if (m.includes("email not confirmed"))
    return "Cet email n'a pas encore été confirmé.";
  if (m.includes("user already registered"))
    return "Un compte existe déjà avec cet email.";
  if (m.includes("password should be at least"))
    return "Le mot de passe doit faire au moins 8 caractères.";
  if (m.includes("signups not allowed") || m.includes("signup is disabled"))
    return "Les inscriptions sont fermées. Demande à un administrateur de te créer un accès.";
  return message;
}
