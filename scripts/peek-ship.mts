import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^'|'$/g, "");
}
if (!("WebSocket" in globalThis)) { const { WebSocket } = await import("ws"); (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket; }
const { createAdminClient } = await import("../src/lib/supabase/admin");
const admin = createAdminClient();
const { data: shop } = await admin.from("shops").select("id, fallback_country").eq("slug", "everhaar").single();
console.log("repli :", shop!.fallback_country);
const { data } = await admin.from("shipping_costs").select("country, standard, upsell, is_estimated").eq("shop_id", shop!.id).eq("sku", "43029231370305").order("country");
console.table(data ?? []);
const { data: pays } = await admin.from("shop_countries").select("*").eq("shop_id", shop!.id).limit(8);
console.log("shop_countries :", JSON.stringify(pays));
