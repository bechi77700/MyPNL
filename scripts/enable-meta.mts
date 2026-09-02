import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^'|'$/g, "");
}
if (!("WebSocket" in globalThis)) { const { WebSocket } = await import("ws"); (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket; }
const { createAdminClient } = await import("../src/lib/supabase/admin");
const admin = createAdminClient();
const { data: shop } = await admin.from("shops").select("id, currency").eq("slug", process.argv[2]).single();
const { data: acc } = await admin.from("ad_accounts").select("id, name, currency, enabled").eq("shop_id", shop!.id);
console.log("comptes :", JSON.stringify(acc));
const ok = (acc ?? []).filter((a) => a.currency === shop!.currency).map((a) => a.id);
if (ok.length) await admin.from("ad_accounts").update({ enabled: true }).in("id", ok);
console.log(`actives (${shop!.currency}) : ${ok.length}`);
