"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetForm() {
  const router = useRouter();
  const [pret, setPret] = useState(false);
  const [mdp, setMdp] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  // Le lien recu par email ouvre une session de recuperation : on attend qu'elle soit posee.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setPret(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setPret(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null); setEnCours(true);
    const { error } = await createClient().auth.updateUser({ password: mdp });
    if (error) { setErreur(error.message); setEnCours(false); return; }
    router.push("/select"); router.refresh();
  }

  if (!pret)
    return <p className="text-[13px] text-faible">Ouvre cette page depuis le lien reçu par email.</p>;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-[13px] text-doux">Nouveau mot de passe</span>
        <input type="password" required minLength={8} autoComplete="new-password"
          value={mdp} onChange={(e) => setMdp(e.target.value)}
          className="w-full rounded-[8px] border border-bord bg-carte px-3.5 py-2.5 text-texte outline-none focus:border-accent/50"
          placeholder="8 caractères minimum" />
      </label>
      {erreur && <p className="rounded-[8px] border border-negatif/40 bg-negatif/10 px-3.5 py-2.5 text-[13px] text-negatif">{erreur}</p>}
      <button type="submit" disabled={enCours}
        className="btn-principal w-full rounded-[8px] px-4 py-2.5 font-semibold disabled:opacity-50">
        {enCours ? "Un instant…" : "Enregistrer"}
      </button>
    </form>
  );
}
