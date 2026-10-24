#!/usr/bin/env bash
# Proves every migration has a working DOWN: roll back all of them, then apply all again.
set -euo pipefail
cd "$(dirname "$0")/../packages/db"
D=(dbmate -e DATABASE_MIGRATION_URL -d migrations --migrations-table crm.schema_migrations --no-dump-schema)
n=$(ls migrations/*.sql | wc -l)
echo "Rolling back $n migrations..."
for _ in $(seq 1 "$n"); do pnpm exec "${D[@]}" rollback >/dev/null; done
echo "Re-applying..."
pnpm exec "${D[@]}" up >/dev/null
echo "OK: up/down/up clean ($n migrations)"
