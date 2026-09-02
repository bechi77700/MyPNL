import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^'|'$/g, "");
}
if (!("WebSocket" in globalThis)) { const { WebSocket } = await import("ws"); (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket; }
const { createAdminClient } = await import("../src/lib/supabase/admin");
const admin = createAdminClient();
const { data: shop } = await admin.from("shops").select("id").eq("slug", process.argv[2]).single();
const id = shop!.id as string;
const { data: skus } = await admin.from("sku_overview", ).select("*").limit(0).then(() => ({ data: null })).catch(() => ({ data: null }));
const { data: vue } = await admin.rpc("sku_overview", { p_shop: id, p_actifs_seulement: false });
const rows = (vue ?? []) as { sku: string; title: string; variant_title: string | null; status: string; cost: number; orders_count: number; units: number; exclude_from_shipping: boolean }[];
const sans = rows.filter((r) => Number(r.cost) === 0 && !r.exclude_from_shipping);
console.log(`${rows.length} variantes, ${sans.length} sans coût produit :`);
for (const r of sans.sort((a, b) => b.orders_count - a.orders_count)) console.log(`  [${r.status}] ${r.title}${r.variant_title ? " / " + r.variant_title : ""} — ${r.orders_count} cmd, ${r.units} unités (SKU ${r.sku})`);
// unites vendues sur 90 jours sans cout
const { data: cmds } = await admin.from("orders").select("items").eq("shop_id", id).gte("order_day", "2026-06-04").range(0, 9999);
const sansSet = new Set(sans.map((s) => s.sku)); let unites = 0, cmdTouchees = 0;
for (const o of cmds ?? []) { let t = false; for (const [s, q] of Object.entries(o.items ?? {})) if (sansSet.has(s)) { unites += Number(q); t = true; } if (t) cmdTouchees++; }
console.log(`\n90 derniers jours : ${cmdTouchees} commandes touchées, ${unites} unités sans coût`);
