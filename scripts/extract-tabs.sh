#!/usr/bin/env bash
# one commit per extraction; revert that one extraction when the tool refuses or the tests fail
set -u
cd "$(dirname "$0")/.."
export NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder SUPABASE_SERVICE_ROLE_KEY=placeholder
for spec in "$@"; do
  id="${spec%%:*}"; comp="${spec##*:}"
  line=$(grep -n "^ *{activeTab===\"$id\"&&" app/beautyos.jsx | head -1 | cut -d: -f1)
  if [ -z "$line" ]; then echo "SKIP $id: block not found"; continue; fi
  if ! node scripts/extract-block.mjs "$line" "$comp" "tab-$id" ; then
    git checkout -- app/beautyos.jsx; rm -f "app/tab-$id.jsx"; echo "REVERTED $id (tool refused)"; continue
  fi
  if node scripts/run-tests.mjs 2>&1 | grep -q "FAIL"; then
    git checkout -- app/beautyos.jsx; rm -f "app/tab-$id.jsx"; echo "REVERTED $id (tests failed)"; continue
  fi
  git add -A >/dev/null 2>&1
  git commit -q -m "Split beautyos.jsx: the $id screen loads on demand (app/tab-$id.jsx), unchanged

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" && echo "COMMITTED $id $(wc -c < app/beautyos.jsx)"
done
