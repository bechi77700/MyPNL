/** Execute un fichier SQL en direct sur Postgres (remplace run-sql.sh quand le jeton Management API est mort).
 *  npx tsx scripts/sql.mts <fichier.sql>   ou   npx tsx scripts/sql.mts -c "select 1" */
import fs from "node:fs";
import { createRequire } from "node:module";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^'|'$/g, "");
}
for (const l of fs.readFileSync("env.md", "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0 && /^[A-Z_]+=/.test(l)) process.env[l.slice(0, i)] ??= l.slice(i + 1).trim();
}
const require = createRequire("/private/tmp/claude-501/-Users-celinasomerville-Downloads-LOOMA-MARKETING/704636c2-e857-41e9-b48b-bca7c3479624/scratchpad/pg/package.json");
const postgres = require("postgres");
const ref = process.env.SUPABASE_PROJECT_REF!, pw = process.env.SUPABASE_DB_PASSWORD!;
const sql = postgres({ host: "aws-0-us-east-1.pooler.supabase.com", port: 5432, database: "postgres", username: `postgres.${ref}`, password: pw, ssl: "require", max: 1, prepare: false });
const texte = process.argv[2] === "-c" ? process.argv[3] : fs.readFileSync(process.argv[2], "utf8");
try {
  const r = await sql.unsafe(texte);
  const rows = Array.isArray(r) ? r : [];
  console.log(JSON.stringify(rows.slice(0, 50), null, rows.length > 3 ? 0 : 1));
} finally { await sql.end(); }
