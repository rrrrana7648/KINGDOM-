#!/usr/bin/env bash
# Validates, regression-tests and packages both packs into dist/KINGDOM.mcaddon
# (one-tap import on Android). Also emits the two .mcpack halves for players
# who prefer importing packs separately.
#
#   bash tools/package.sh            # validate + sim + build
#   bash tools/package.sh --fast     # build only (skip validate + sim)
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "${1:-}" != "--fast" ]]; then
  echo "🔍 Validating packs…"
  node tools/validate.mjs
  echo
  echo "🧪 Running the headless simulation…"
  (cd tools/sim && node --no-warnings --loader ./loader.mjs run-sim.mjs | tail -3)
  echo
fi

VERSION=$(node -p 'require("./packs/BP_Kingdom/manifest.json").header.version.join(".")')
mkdir -p dist
rm -f dist/KINGDOM.mcaddon dist/KINGDOM_BP.mcpack dist/KINGDOM_RP.mcpack dist/SHA256SUMS

# Deterministic zips: fixed ordering, no extra attrs, junk excluded.
EXCLUDES=(-x "*.DS_Store" -x "*Thumbs.db" -x "*.log" -x "*~")
(
  cd packs
  find BP_Kingdom RP_Kingdom -type f | LC_ALL=C sort | zip -X -q ../dist/KINGDOM.mcaddon -@ "${EXCLUDES[@]}"
  find BP_Kingdom -type f | LC_ALL=C sort | zip -X -q ../dist/KINGDOM_BP.mcpack -@ "${EXCLUDES[@]}"
  find RP_Kingdom -type f | LC_ALL=C sort | zip -X -q ../dist/KINGDOM_RP.mcpack -@ "${EXCLUDES[@]}"
)
(cd dist && sha256sum KINGDOM.mcaddon KINGDOM_BP.mcpack KINGDOM_RP.mcpack > SHA256SUMS)

echo "✅ Built KINGDOM v${VERSION}"
ls -l dist/KINGDOM.mcaddon dist/KINGDOM_BP.mcpack dist/KINGDOM_RP.mcpack | awk '{printf "   %-28s %7d bytes\n", $NF, $5}'
echo "   $(unzip -l dist/KINGDOM.mcaddon | tail -1 | awk '{print $2}') files in the .mcaddon"
unzip -tq dist/KINGDOM.mcaddon
