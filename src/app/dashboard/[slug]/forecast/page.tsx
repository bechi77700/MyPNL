import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { aujourdhui } from "@/lib/periode";
import Forecast, { type BaseProjection } from "@/components/forecast";
import { Carte, EnTetePage } from "@/components/ui";

export const dynamic = "force-dynamic";

type Mois = {
  bucket: string; gross_sales: number; revenue_ht: number;
  gross_margin: number; ad_spend: number; opex: number; owner_salary: number;
};

export default async function ForecastPage({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: boutique } = await supabase
    .from("shops").select("id, name, currency, timezone").eq("slug", slug).maybeSingle();
  const devise = boutique!.currency as string;

  // On projette depuis le dernier mois COMPLET : le mois en cours fausserait tout.
  const auj = aujourdhui(boutique!.timezone);
  const [an, mo] = auj.split("-").map(Number);
  const finDernierMois = new Date(Date.UTC(an, mo - 1, 0)).toISOString().slice(0, 10);
  const debut = new Date(Date.UTC(an, mo - 13, 1)).toISOString().slice(0, 10);

  const debutDernierMois = new Date(Date.UTC(an, mo - 2, 1)).toISOString().slice(0, 10);
  const joursDuMois = Number(finDernierMois.slice(-2));

  const [{ data }, { data: joursPub }] = await Promise.all([
    supabase.rpc("pnl_series", {
      p_shop: boutique!.id, p_from: debut, p_to: finDernierMois, p_grain: "month",
    }),
    // Combien de jours du mois ont une depense pub connue : sans ca, on
    // projetterait un EBITDA gonfle par une pub artificiellement basse.
    supabase.from("ad_spend").select("date")
      .eq("shop_id", boutique!.id)
      .gte("date", debutDernierMois).lte("date", finDernierMois)
      .gt("amount", 0),
  ]);
  const couverturePub = new Set((joursPub ?? []).map((r) => r.date)).size;
  const mois = (data ?? []) as Mois[];
  const dernier = mois[mois.length - 1];

  if (!dernier || Number(dernier.gross_sales) <= 0) {
    return (
      <div className="px-7 py-8">
        <EnTetePage titre="Forecast" sous={boutique!.name} />
        <Carte className="border-dashed px-6 py-14 text-center">
          <p className="text-doux">Pas encore de mois complet à projeter.</p>
          <p className="mt-1.5 text-sm text-faible">
            Reviens quand un mois entier sera terminé.
          </p>
        </Carte>
      </div>
    );
  }

  const ca = Number(dernier.gross_sales);
  const caHt = Number(dernier.revenue_ht) || ca;
  const base: BaseProjection = {
    mois: dernier.bucket,
    ca,
    tauxMarge: Number(dernier.gross_margin) / caHt,
    tauxPub: ca > 0 ? Number(dernier.ad_spend) / ca : 0,
    chargesFixes: Number(dernier.opex) + Number(dernier.owner_salary),
  };

  const libelle = new Date(dernier.bucket + "T12:00:00Z").toLocaleDateString("fr-FR", {
    month: "long", year: "numeric",
  });

  return (
    <div className="px-7 py-8">
      <EnTetePage
        titre="Forecast"
        sous={`${boutique!.name} · projection depuis ${libelle}, ton dernier mois complet`}
      />
      {couverturePub < joursDuMois * 0.8 && (
        <Carte className="mb-4 border-alerte/30 bg-alerte/5 px-5 py-4">
          <p className="font-medium text-alerte">
            Dépense publicitaire incomplète sur {libelle}
          </p>
          <p className="mt-1 text-sm text-doux">
            Je n&apos;ai que <b className="text-texte">{couverturePub} jour{couverturePub > 1 ? "s" : ""}</b> de
            dépense sur les {joursDuMois} du mois. Le taux de départ ({Math.round(base.tauxPub * 100)} %
            du CA) est donc très en dessous de la réalité, et{" "}
            <b className="text-texte">l&apos;EBITDA projeté est fortement surévalué</b>.
            {" "}
            <Link href={`/dashboard/${slug}/integrations`} className="text-accent underline underline-offset-4">
              Importe ton historique de pub
            </Link>{" "}
            ou monte le curseur au taux que tu connais.
          </p>
        </Carte>
      )}
      <Forecast base={base} devise={devise} />
    </div>
  );
}
