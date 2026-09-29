#!/usr/bin/env bash
# Pre-pull the IDE Run engine's Docker images so the first Run per language
# doesn't pay a cold-pull latency. Run this ON THE VPS:
#
#   bash scripts/ide-prepull.sh          # pull everything + disk report
#   bash scripts/ide-prepull.sh --smoke  # also run a trivial script per image
#
# Image list is read from utils/ideRunner.js (the manifest is the single
# source of truth, also served by GET /api/ide/languages). Falls back to a
# static list when node isn't installed on the host.
set -u

cd "$(dirname "$0")/.."

FALLBACK_IMAGES="node:22-alpine
python:3.12-slim
gcc:13
eclipse-temurin:21-jdk
golang:1.22-alpine
rust:1.78-alpine
ruby:3.2-alpine
php:8.2-cli-alpine
bash:5.2
perl:5.40
r-base
mcr.microsoft.com/dotnet/sdk:8.0
dart:stable
swift:5.10
elixir:1.17
mcr.microsoft.com/powershell:7.4-ubuntu-22.04
nickblah/lua:5.4-alpine
groovy:5-jdk21-alpine"

if command -v node >/dev/null 2>&1; then
  IMAGES=$(node -e "
    const { MANIFEST } = require('./utils/ideRunner');
    const imgs = [...new Set(Object.values(MANIFEST).map((e) => e.image))];
    console.log(imgs.join('\n'));
  " 2>/dev/null) || IMAGES=""
fi
if [ -z "${IMAGES:-}" ]; then
  echo "! node unavailable — using fallback image list (may lag the manifest)"
  IMAGES="$FALLBACK_IMAGES"
fi

echo "== Disk headroom =="
df -h / || df -h

echo
echo "== Pulling $(echo "$IMAGES" | wc -l | tr -d ' ') images =="
FAILED=""
while IFS= read -r img; do
  [ -z "$img" ] && continue
  if docker pull "$img"; then
    echo "ok: $img"
  else
    echo "FAILED: $img"
    FAILED="$FAILED $img"
  fi
done <<< "$IMAGES"

if [ "${1:-}" = "--smoke" ]; then
  echo
  echo "== Smoke runs (network disabled, must print OK) =="
  while IFS= read -r img; do
    [ -z "$img" ] && continue
    if docker run --rm --network=none --memory=256m "$img" sh -c 'echo OK' 2>/dev/null | grep -q OK; then
      echo "smoke ok: $img"
    else
      echo "smoke FAILED (no sh or image broken): $img"
    fi
  done <<< "$IMAGES"
fi

echo
echo "== Local images =="
docker images | head -40

if [ -n "$FAILED" ]; then
  echo
  echo "Pull failures:$FAILED"
  exit 1
fi

echo
echo "Done. Note: kotlin & scala are NOT in the manifest yet — they need the"
echo "custom toolbox image (zenika/kotlin is stale; scala-cli needs network)"
echo "which requires Docker on this host + the deploy SSH key."
