#!/usr/bin/env bash
# Packages both packs into dist/KINGDOM.mcaddon (one-tap import on Android).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist
rm -f dist/KINGDOM.mcaddon
cd packs
zip -r ../dist/KINGDOM.mcaddon BP_Kingdom RP_Kingdom \
  -x "*.DS_Store" "**/*.log" >/dev/null
echo "✅ Built dist/KINGDOM.mcaddon"
unzip -l ../dist/KINGDOM.mcaddon | head -30
