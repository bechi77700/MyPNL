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
  const [enCours, setEnCours] = useState(false);

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
        <label htmlFor="email" className="mb-1.5 block text-sm text-neutral-400">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3.5 py-2.5 text-neutral-100 outline-none transition placeholder:text-neutral-600 focus:border-neutral-600"
          placeholder="toi@exemple.com"
        />
      </div>

      <div>
        <label htmlFor="mdp" className="mb-1.5 block text-sm text-neutral-400">
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
          className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3.5 py-2.5 text-neutral-100 outline-none transition placeholder:text-neutral-600 focus:border-neutral-600"
          placeholder={premierCompte ? "8 caractères minimum" : "••••••••"}
        />
      </div>

      {erreur && (
        <p className="rounded-lg border border-red-900/60 bg-red-950/40 px-3.5 py-2.5 text-sm text-red-300">
          {erreur}
        </p>
      )}

      <button
        type="submit"
        disabled={enCours}
        className="w-full rounded-lg bg-neutral-100 px-4 py-2.5 font-medium text-neutral-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {enCours
          ? "Un instant…"
          : premierCompte
            ? "Créer mon compte administrateur"
            : "Se connecter"}
      </button>
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
