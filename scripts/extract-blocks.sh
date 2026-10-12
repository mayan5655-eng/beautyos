#!/usr/bin/env bash
# usage: extract-blocks.sh "<grep-pattern for the container's first line>:Component:slug" ...
set -u
cd "$(dirname "$0")/.."
export NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder SUPABASE_SERVICE_ROLE_KEY=placeholder
for spec in "$@"; do
  pat="${spec%%::*}"; rest="${spec#*::}"; comp="${rest%%:*}"; slug="${rest##*:}"
  line=$(grep -n "$pat" app/beautyos.jsx | head -1 | cut -d: -f1)
  if [ -z "$line" ]; then echo "SKIP $slug: block not found"; continue; fi
  if ! node scripts/extract-block.mjs "$line" "$comp" "$slug"; then
    git checkout -- app/beautyos.jsx; rm -f "app/$slug.jsx"; echo "REVERTED $slug (tool refused)"; continue
  fi
  if node scripts/run-tests.mjs 2>&1 | grep -q "FAIL"; then
    git checkout -- app/beautyos.jsx; rm -f "app/$slug.jsx"; echo "REVERTED $slug (tests failed)"; continue
  fi
  git add -A >/dev/null 2>&1
  git commit -q -m "Split beautyos.jsx: $slug loads on demand (app/$slug.jsx), unchanged

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" && echo "COMMITTED $slug $(wc -c < app/beautyos.jsx)"
done
