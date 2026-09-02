import Link from "next/link";
import { Carte } from "@/components/ui";

export type Renouvellement = {
  platform: string; expires_at: string; jours_restants: number; expire: boolean;
};

const NOMS: Record<string, string> = { meta: "Meta Ads", google: "Google Ads" };

/**
 * Un jeton Meta expire au bout de 60 jours. Sans ce bandeau, la depense
 * publicitaire cesserait de remonter en silence et le profit net
 * redeviendrait faussement optimiste.
 */
export default function AlerteConnecteur({
  renouvellements, slug,
}: { renouvellements: Renouvellement[]; slug: string }) {
  if (!renouvellements.length) return null;
  const critique = renouvellements.some((r) => r.expire);

  return (
    <Carte
      className={`mb-4 px-5 py-4 ${
        critique ? "border-negatif/40 bg-negatif/5" : "border-alerte/30 bg-alerte/5"
      }`}
    >
      <p className={`font-medium ${critique ? "text-negatif" : "text-alerte"}`}>
        {critique
          ? "Connexion publicitaire expirée"
          : "Connexion publicitaire bientôt expirée"}
      </p>
      <p className="mt-1 text-sm text-doux">
        {renouvellements.map((r) => {
          const nom = NOMS[r.platform] ?? r.platform;
          return (
            <span key={r.platform} className="mr-1.5">
              <b className="text-texte">{nom}</b>
              {r.expire
                ? " a expiré"
                : ` expire dans ${r.jours_restants} jour${r.jours_restants > 1 ? "s" : ""}`}
              {" "}({new Date(r.expires_at).toLocaleDateString("fr-FR")}).
            </span>
          );
        })}
        {critique
          ? " Ta dépense publicitaire ne remonte plus : le profit net affiché est surévalué."
          : " Passé cette date, la dépense publicitaire cessera de remonter."}{" "}
        <Link
          href={`/dashboard/${slug}/integrations`}
          className={`underline underline-offset-4 ${critique ? "text-negatif" : "text-accent"}`}
        >
          Reconnecter
        </Link>
      </p>
    </Carte>
  );
}
