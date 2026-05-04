#!/usr/bin/env bash
set -euo pipefail

REMOTE="${1:-}"
REMOTE_DIR="${2:-/opt/resume-template-web}"

if [[ -z "$REMOTE" ]]; then
  echo "Usage: scripts/deploy-static.sh <user@host> [remote-dir]"
  echo "Example: scripts/deploy-static.sh root@example.com /opt/resume-template-web"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ARCHIVE="$(mktemp -t resume-template-web.XXXXXX.tar.gz)"

cleanup() {
  rm -f "$ARCHIVE"
}
trap cleanup EXIT

cd "$ROOT_DIR"
npm ci
npm run build
tar --exclude='./node_modules' --exclude='./dist' --exclude='./.git' -czf "$ARCHIVE" .

ssh "$REMOTE" "mkdir -p '$REMOTE_DIR'"
scp "$ARCHIVE" "$REMOTE:/tmp/resume-template-web.tar.gz"
ssh "$REMOTE" "set -e;
  cd '$REMOTE_DIR';
  tar -xzf /tmp/resume-template-web.tar.gz;
  rm -f /tmp/resume-template-web.tar.gz;
  find . -type d -exec chmod 755 {} +;
  find . -type f -exec chmod 644 {} +;
  chmod +x scripts/*.sh 2>/dev/null || true;
  if [[ ! -f deploy/.env ]]; then cp deploy/.env.example deploy/.env; fi;
  docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build --remove-orphans;
  curl -fsS http://127.0.0.1:\${RESUME_WEB_PORT:-8081}/health >/dev/null"

echo "Deployed to $REMOTE:$REMOTE_DIR"
