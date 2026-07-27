#!/usr/bin/env bash
set -euo pipefail

cd frontend

pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck

pnpm exec vitest run \
  src/core/macro/psIsonote/professional/professionalAcceptanceAudit.test.ts \
  --pool=forks \
  --maxWorkers=1
