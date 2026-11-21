#!/usr/bin/env bash
# JULEX · construir y publicar en Cloudflare Pages
#
# El proyecto de Cloudflare es de subida directa (no está conectado a
# Git), así que se publica desde aquí. Construye en un worktree limpio de
# origin/main para no publicar nunca trabajo sin commitear.
#
#   ./scripts/desplegar.sh            # publica el último origin/main
#   ./scripts/desplegar.sh --local    # publica el árbol actual (cuidado)

set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
WRANGLER="$(command -v wrangler || echo "$HOME/.local/bin/wrangler")"
PROYECTO="julex"

cd "$REPO"

if [ "${1:-}" = "--local" ]; then
  npm run build
  "$WRANGLER" pages deploy dist --project-name "$PROYECTO" --branch main --commit-dirty=true
  exit 0
fi

git fetch origin --quiet
COMMIT="$(git rev-parse origin/main)"
WT="$(mktemp -d /tmp/julex-deploy.XXXXXX)"
trap 'git -C "$REPO" worktree remove --force "$WT" >/dev/null 2>&1 || rm -rf "$WT"' EXIT

git worktree add --detach "$WT" "$COMMIT" >/dev/null
ln -s "$REPO/node_modules" "$WT/node_modules"
cp "$REPO/.env.local" "$WT/.env.local"
(cd "$WT" && npm run build)

cd "$WT"
"$WRANGLER" pages deploy dist \
  --project-name "$PROYECTO" \
  --branch main \
  --commit-hash "$COMMIT" \
  --commit-message "Deploy $(git -C "$REPO" log -1 --format=%s "$COMMIT")" \
  --commit-dirty=false
