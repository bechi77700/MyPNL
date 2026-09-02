import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resoudrePeriode } from "@/lib/periode";
import { reponseCsv, versCsv } from "@/lib/csv-export";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug") ?? "";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erreur: "Non connecté." }, { status: 401 });
  const { data: shop } = await supabase
    .from("shops").select("id, timezone").eq("slug", slug).maybeSingle();
  if (!shop) return NextResponse.json({ erreur: "Boutique introuvable." }, { status: 404 });

  const periode = resoudrePeriode(shop.timezone, {
    p: url.searchParams.get("p") ?? undefined,
    du: url.searchParams.get("du") ?? undefined,
    au: url.searchParams.get("au") ?? undefined,
  });

  // Tout, par pages de 1000 : le rapport a l'ecran est pagine, l'export non.
  const lignes: Record<string, unknown>[] = [];
  for (let decalage = 0; ; decalage += 1000) {
    const { data } = await supabase.rpc("orders_report", {
      p_shop: shop.id, p_from: periode.du, p_to: periode.au,
      p_limite: 1000, p_decalage: decalage, p_recherche: null,
    });
    const lot = (data ?? []) as Record<string, unknown>[];
    lignes.push(...lot);
    if (lot.length < 1000) break;
  }

  const entetes = ["Commande", "Date", "Pays", "Zone", "Articles", "CA", "Remboursé", "Taxe",
    "Coût produit", "Livraison", "COGS", "Frais", "Profit", "Marge %", "Livraison estimée", "Nouveau client"];
  const corps = lignes.map((l) => [
    String(l.order_number ?? ""), String(l.order_day ?? ""), String(l.country ?? ""), String(l.shipping_zone ?? ""),
    Number(l.units ?? 0), Number(l.revenue ?? 0), Number(l.refunded ?? 0), Number(l.vat ?? 0),
    Number(l.product_cost ?? 0), Number(l.shipping_cost ?? 0), Number(l.cogs ?? 0),
    Number(l.transaction_fee ?? 0), Number(l.profit ?? 0),
    l.marge_pct == null ? "" : Number(l.marge_pct),
    l.shipping_estimated ? "oui" : "non", l.is_new_customer ? "oui" : "non",
  ]);
  return reponseCsv(`commandes-${slug}-${periode.du}-${periode.au}.csv`, versCsv(entetes, corps));
}
