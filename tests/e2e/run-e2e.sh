#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT_DIR"

cleanup() {
  docker compose -f tests/e2e/docker-compose.yml down
}

trap cleanup EXIT

bun run build-lib
DATABASE_URL="postgresql://test:test@localhost:5434/prisma_migrations_test" \
  bunx prisma generate --schema tests/e2e/schema.prisma

docker compose -f tests/e2e/docker-compose.yml up -d --wait \
  postgres postgres-cli postgres-bun \
  postgres-codelab-new postgres-codelab-migrate

bun test tests/e2e/cli-commands.spec.ts --timeout 120000
bun test tests/e2e/bun-only.spec.ts --timeout 120000
bun test tests/e2e/codelab-new-project.spec.ts --timeout 120000
bun test tests/e2e/codelab-migrate-existing.spec.ts --timeout 120000
bun test tests/e2e/prisma-wrapper-commands.spec.ts --timeout 120000
bun test tests/e2e/monorepo-commands.spec.ts --timeout 120000
bun test tests/e2e/safety.spec.ts --timeout 120000
