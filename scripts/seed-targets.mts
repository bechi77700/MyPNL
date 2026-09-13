import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^'|'$/g, "");
}
if (!("WebSocket" in globalThis)) { const { WebSocket } = await import("ws"); (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket; }
const { createAdminClient } = await import("../src/lib/supabase/admin");
const admin = createAdminClient();
const defauts: Record<string, RegExp> = { looma: /antifungal barrier cream/i, "garden-gather": /grange carrier/i, everhaar: /farbshampoo/i };
for (const [slug, re] of Object.entries(defauts)) {
  const { data: shop } = await admin.from("shops").select("id, timezone").eq("slug", slug).single();
  const { data: skus } = await admin.from("shop_skus").select("sku, title, product_title, status, exclude_from_shipping").eq("shop_id", shop!.id);
  const choisis = (skus ?? []).filter((s) => s.status === "active" && !s.exclude_from_shipping && re.test(s.product_title ?? s.title ?? ""));
  const uniques = [...new Set(choisis.map((s) => s.sku))];
  const label = (choisis[0]?.product_title ?? choisis[0]?.title ?? "").replace(/\s+[-–|]\s+.*$/, "").trim() || null;
  await admin.from("shop_targets").upsert({ shop_id: shop!.id, main_skus: uniques, main_label: label }, { onConflict: "shop_id" });
  const auj = new Intl.DateTimeFormat("en-CA", { timeZone: shop!.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const du = new Date(new Date(auj + "T12:00:00Z").getTime() - 29 * 86400_000).toISOString().slice(0, 10);
  const { data: d, error } = await admin.rpc("targets_data", { p_shop: shop!.id, p_skus: uniques, p_from: du, p_to: auj });
  if (error) { console.log(slug, "ERREUR", error.message); continue; }
  const aov = Number(d.aov), cogs = Number(d.cogs), psp = Number(d.psp_rate ?? 0), dispo = aov - cogs - aov * psp;
  console.log(`${slug} → ${label} [${uniques.length} SKU] : ${d.orders} cmd, AOV ${aov.toFixed(2)}, COGS ${cogs.toFixed(2)}, PSP ${(psp * 100).toFixed(1)} %, BE ${(aov / dispo).toFixed(2)}, target ${(aov / (dispo - 0.2 * aov)).toFixed(2)}, réel ${(d.shop.revenue / d.shop.ad_spend).toFixed(2)} | mix ${d.mix.map((x: any) => `x${x.qty}:${Math.round(x.share * 100)}%`).join(" ")}`);
}
