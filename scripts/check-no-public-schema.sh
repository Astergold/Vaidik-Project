#!/usr/bin/env bash
# Fails CI if any migration or query references the `public` schema. Everything lives in `crm`.
set -euo pipefail
cd "$(dirname "$0")/.."

hits=$(grep -rnE "(^|[^A-Za-z_])public\.[A-Za-z_\"]" \
  packages apps infra \
  --include='*.sql' --include='*.ts' --include='*.tsx' --include='*.sh' --include='*.yml' \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=generated --exclude-dir=.turbo \
  --exclude='check-no-public-schema.sh' || true)

if [ -n "$hits" ]; then
  echo "ERROR: references to the 'public' schema found (use the crm schema):"
  echo "$hits"
  exit 1
fi
echo "OK: no references to the public schema."
