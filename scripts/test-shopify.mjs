// Verifie qu'un token de connecteur stocke en base fonctionne vraiment.
import crypto from "node:crypto";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter(Boolean)
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

function decrypt(paquet, secret) {
  const key = crypto.createHash("sha256").update(secret).digest();
  const buf = Buffer.from(paquet, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
}

const r = await fetch(`${env.SUPABASE_URL}/rest/v1/connectors?select=creds_encrypted,shop_id&platform=eq.shopify`, {
  headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` },
});
const rows = await r.json();
if (!rows.length) { console.log("aucun connecteur"); process.exit(1); }

const { token, domaine } = JSON.parse(decrypt(rows[0].creds_encrypted, env.APP_ENCRYPTION_KEY));
console.log("dechiffrement : OK");
console.log("domaine       :", domaine);
console.log("token         : shpat_… (", token.length, "caracteres )");

const v = env.SHOPIFY_API_VERSION || "2026-07";
async function appel(chemin) {
  const res = await fetch(`https://${domaine}/admin/api/${v}/${chemin}`, {
    headers: { "X-Shopify-Access-Token": token },
  });
  return { status: res.status, body: await res.text() };
}

const shop = await appel("shop.json?fields=name,currency,iana_timezone");
console.log("\nshop.json     :", shop.status, shop.body.slice(0, 160));

const cnt = await appel("orders/count.json?status=any");
console.log("orders/count  :", cnt.status, cnt.body.slice(0, 120));

const pay = await appel("shopify_payments/payouts.json?limit=1");
console.log("payouts       :", pay.status, pay.body.slice(0, 160));

const dis = await appel("shopify_payments/disputes.json?limit=1");
console.log("disputes      :", dis.status, dis.body.slice(0, 160));
