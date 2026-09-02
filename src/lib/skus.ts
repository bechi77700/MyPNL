import { createClient } from "@/lib/supabase/server";

export type Sku = {
  sku: string;
  title: string | null;
  variant_title: string | null;
  product_title: string | null;
  status: string | null;
  price: number | null;
  image_url: string | null;
  exclude_from_shipping: boolean;
  cost: number;
  orders_count: number;
  units: number;
};

/**
 * Les SKU d'une boutique. Par defaut on masque les brouillons et les archives,
 * SAUF ceux qui ont deja vendu : sans eux, leur COGS resterait a zero
 * sans qu'on puisse le corriger.
 */
export async function chargerSkus(shopId: string, tout: boolean) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("sku_overview", {
    p_shop: shopId,
    p_actifs_seulement: false,
  });
  const tous = (data ?? []) as Sku[];
  const actifs = tous.filter((s) => !s.status || s.status === "active");
  const inactifsVendus = tous.filter(
    (s) => s.status && s.status !== "active" && s.orders_count > 0,
  );
  return {
    tous,
    actifs,
    inactifsVendus,
    visibles: tout ? [...actifs, ...inactifsVendus] : actifs,
  };
}

export function nomSku(s: Sku) {
  return s.product_title ?? s.title ?? s.sku;
}
