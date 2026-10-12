#!/usr/bin/env bash
# Rebuild js/criteria.js from the Test Directory PDF (TD_URL in js/data.js). Needs curl, pdftotext (poppler), python3, node.
# Usage: tools/update-criteria.sh [path-or-URL-of-PDF]
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="${1:-$(grep -o "TD_URL = '[^']*'" js/data.js | cut -d"'" -f2)}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
if [[ "$SRC" =~ ^https?:// ]]; then curl -fsSL "$SRC" -o "$TMP/td.pdf"; else cp "$SRC" "$TMP/td.pdf"; fi
pdftotext -layout "$TMP/td.pdf" "$TMP/td.txt"
python3 tools/extract_criteria.py "$TMP/td.txt" "$TMP/crit.json"
node tools/write_criteria.js "$TMP/crit.json"
node tests/criteria.test.js
echo "Done. Update the version wording in tools/write_criteria.js and TD_VERSION in js/data.js if the PDF version changed, then run tools/bump-version.sh."
