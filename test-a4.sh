#!/bin/bash
corepack pnpm --filter frontend exec tsc --noEmit
corepack pnpm --filter frontend run lint
corepack pnpm --filter frontend test -- view workspace
