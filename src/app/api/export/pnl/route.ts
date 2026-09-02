import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resoudrePeriode } from "@/lib/periode";
import { reponseCsv, versCsv } from "@/lib/csv-export";

const POSTES: [string, string][] = [
  ["Chiffre d'affaires", "gross_sales"], ["Remboursements", "refunds"],
  ["CA net", "net_revenue"], ["Taxes et TVA", "taxes"], ["CA hors taxes", "revenue_ht"],
  ["Coût produit", "product_cost"], ["Livraison", "shipping_cost"], ["COGS", "cogs"],
  ["Frais de transaction", "transaction_fees"], ["Marge brute", "gross_margin"],
  ["Dépense publicitaire", "ad_spend"], ["Contribution", "contribution"],
  ["Charges et litiges", "opex"], ["Profit net (EBITDA)", "ebitda"],
  ["Rémunération dirigeant", "owner_salary"], ["Commandes", "orders_count"], ["Articles", "units"],
];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug") ?? "";
  const grain = ["day", "month", "quarter"].includes(url.searchParams.get("grain") ?? "")
    ? url.searchParams.get("grain")! : "month";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erreur: "Non connecté." }, { status: 401 });
  const { data: shop } = await supabase
    .from("shops").select("id, name, timezone").eq("slug", slug).maybeSingle();
  if (!shop) return NextResponse.json({ erreur: "Boutique introuvable." }, { status: 404 });

  const periode = resoudrePeriode(shop.timezone, {
    p: url.searchParams.get("p") ?? undefined,
    du: url.searchParams.get("du") ?? undefined,
    au: url.searchParams.get("au") ?? undefined,
  });
  const { data } = await supabase.rpc("pnl_series", {
    p_shop: shop.id, p_from: periode.du, p_to: periode.au, p_grain: grain,
  });
  const lignes = (data ?? []) as Record<string, unknown>[];

  const entetes = ["Poste", ...lignes.map((l) => String(l.bucket)), "Total"];
  const corps = POSTES.map(([label, cle]) => {
    const valeurs = lignes.map((l) => Number(l[cle] ?? 0));
    return [label, ...valeurs, valeurs.reduce((a, b) => a + b, 0)];
  });
  const nom = `pnl-${slug}-${periode.du}-${periode.au}.csv`;
  return reponseCsv(nom, versCsv(entetes, corps));
}
