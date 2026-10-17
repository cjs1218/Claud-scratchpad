#!/usr/bin/env bash
# Give every ?v= cache-busting tag in cancer-family-history-navigator/index.html (and the Explorer's) a new version (date + counter) so browsers load changed files.
set -euo pipefail
cd "$(dirname "$0")/.."
today="$(date +%Y%m%d)"
cur="$(grep -o '?v=[0-9]*-[0-9]*' cancer-family-history-navigator/index.html | head -1 | cut -d= -f2)"
n=1; [[ "${cur%%-*}" == "$today" ]] && n=$(( ${cur##*-} + 1 ))
sed -i -E "s/\?v=[0-9]+-[0-9]+/?v=${today}-${n}/g" cancer-family-history-navigator/index.html test-directory-explorer/index.html
echo "cancer-family-history-navigator/index.html and test-directory-explorer/index.html now use ?v=${today}-${n}"
