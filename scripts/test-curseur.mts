import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^'|'$/g, "");
}
if (!("WebSocket" in globalThis)) { const { WebSocket } = await import("ws"); (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket; }
const { createAdminClient } = await import("../src/lib/supabase/admin");
const { syncBoutique } = await import("../src/lib/sync/shopify");
const admin = createAdminClient();
const curseur = async (id: string) => (await admin.from("connectors").select("sync_cursor").eq("shop_id", id).eq("platform", "shopify").single()).data?.sync_cursor;
for (const [slug, passes] of [["everhaar", 2], ["looma", 2]] as const) {
  const { data: shop } = await admin.from("shops").select("id").eq("slug", slug).single();
  console.log(`\n== ${slug} — curseur avant :`, JSON.stringify(await curseur(shop!.id)));
  for (let i = 1; i <= passes; i++) {
    const t = Date.now(); const r = await syncBoutique(shop!.id);
    console.log(`  passe ${i} : ${((Date.now() - t) / 1000).toFixed(1)} s, commandes relues ${r.commandes}, rebalayage ${r.rebalayage}, erreurs ${JSON.stringify(r.erreurs)}`);
  }
  console.log(`   curseur apres :`, JSON.stringify(await curseur(shop!.id)));
}
