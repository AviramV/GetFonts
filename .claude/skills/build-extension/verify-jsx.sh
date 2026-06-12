#!/usr/bin/env bash
# Sanity-check a compiled bolt-cep / CEP ExtendScript bundle for the ES3 hazards
# that a successful `npm run build` does NOT surface. Project-agnostic.
#
# Usage: verify-jsx.sh [symbol ...]
#   Positional args are exported function names to ASSERT are present in the bundle
#   (e.g. the functions you just edited). With none, only the universal checks run.
#   Env overrides: JSX_PATH (default dist/cep/jsx/index.js),
#                  MANIFEST_PATH (default dist/cep/CSXS/manifest.xml).
set -uo pipefail

JSX="${JSX_PATH:-dist/cep/jsx/index.js}"
MANIFEST="${MANIFEST_PATH:-dist/cep/CSXS/manifest.xml}"
fail=0

if [ ! -f "$JSX" ]; then
  found=$(find dist -path '*jsx*' -name '*.js' 2>/dev/null | head -1)
  if [ -n "$found" ]; then JSX="$found"; else
    echo "❌ compiled jsx not found (looked for '$JSX'). Did 'npm run build' succeed?"
    exit 1
  fi
fi
echo "bundle: $JSX"

# 1. NUL bytes → ExtendScript reports "Unterminated string constant" and refuses to
#    parse the WHOLE file (the host then silently keeps running the cached script).
#    `npm run build` still succeeds — it's valid JS; ES3's parser is stricter.
nul=$(perl -ne '$c += tr/\x00//; END{print $c+0}' "$JSX")
if [ "$nul" -ne 0 ]; then
  echo "❌ $nul NUL byte(s) in bundle — will fail to parse in the host."
  echo "   locate: perl -ne 'print \"line \$.\\n\" if /\\x00/' \"$JSX\""
  fail=1
else
  echo "✓ no NUL bytes"
fi

# 2. ES3 down-level sanity — ExtendScript has no const/let/arrow functions.
if grep -aqE '(^|[^.[:alnum:]])(const|let)[[:space:]]' "$JSX"; then
  echo "⚠ found 'const'/'let' in bundle — ES3 down-level may not have run on all input"
else
  echo "✓ no const/let (ES3 down-level looks ok)"
fi

# 3. Assert the named exports are present. NOTE: grep reads the minified bundle as
#    BINARY, so a plain grep prints nothing and falsely reads as "missing" — use -a.
if [ "$#" -gt 0 ]; then
  for fn in "$@"; do
    if grep -aq "$fn" "$JSX"; then
      echo "✓ symbol '$fn' present"
    else
      echo "❌ symbol '$fn' NOT found in bundle"
      fail=1
    fi
  done
else
  echo "ℹ pass function names as args to assert they made it into the bundle (e.g. the ones you just edited)"
fi

# 4. Manifest host(s) + CEP runtime — informational (echo whatever is declared).
if [ -f "$MANIFEST" ]; then
  echo -n "  manifest: "
  grep -oE 'Host Name="[A-Z]+" Version="[^"]+"|Name="CSXS" Version="[0-9.]+"' "$MANIFEST" | tr '\n' ' '
  echo
fi

echo "ℹ CEP caches ExtendScript per host session — fully QUIT & relaunch the host app to load this build; reopening the panel is not enough."
exit $fail
