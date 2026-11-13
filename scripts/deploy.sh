#!/usr/bin/env bash
# Run on the VPS: cd /srv/ongod/current && ./scripts/deploy.sh
# shortcut: no automatic DB backup or rollback, relies on the 03:00 nightly dump; add if a migration is risky.
set -euo pipefail

cd "$(dirname "$0")/.."

# env file is root:ongod 640, so read it through sudo (never printed)
while IFS='=' read -r k v; do
  [[ $k =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue # skips comments and blank lines
  v="${v%\"}"; v="${v#\"}"
  export "$k=$v"
done < <(sudo cat /etc/ongod/ongod.env)

export VITE_PUBLIC_URL=https://app.zuwuutawuu.mn

git pull --ff-only
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @ongod/api db:deploy
sudo systemctl restart ongod

sleep 3
curl -fsS "$VITE_PUBLIC_URL/health" && echo
