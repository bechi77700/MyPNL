#!/usr/bin/env bash
# Execute un fichier .sql sur la base Supabase via l'API de gestion.
# Usage : ./scripts/run-sql.sh supabase/migrations/001_core.sql
set -euo pipefail
[ $# -eq 1 ] || { echo "usage: $0 <fichier.sql>"; exit 1; }
SQL_FILE="$1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' "$ROOT/env.md" | cut -d= -f2- | sed 's/#.*//' | xargs)
REF=$(grep '^SUPABASE_PROJECT_REF=' "$ROOT/env.md" | cut -d= -f2- | sed 's/#.*//' | xargs)
PAYLOAD=$(mktemp)
python3 -c "import json,sys; print(json.dumps({'query': open(sys.argv[1]).read()}))" "$SQL_FILE" > "$PAYLOAD"
CODE=$(curl -s -o "$PAYLOAD.out" -w '%{http_code}' -X POST \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data-binary "@$PAYLOAD" \
  "https://api.supabase.com/v1/projects/$REF/database/query")
echo "$(basename "$SQL_FILE") -> HTTP $CODE"
head -c 12000 "$PAYLOAD.out"; echo
rm -f "$PAYLOAD" "$PAYLOAD.out"
[ "$CODE" = "201" ] || [ "$CODE" = "200" ]
