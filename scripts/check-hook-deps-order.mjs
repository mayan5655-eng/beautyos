// scripts/check-hook-deps-order.mjs
//
// Fails if a hook's dependency array names a `const` or `let` declared LATER in
// the same file.
//
// ── The bug this exists for ───────────────────────────────────────────────
//
// A dependency array is evaluated DURING RENDER, in source order. So this:
//
//     useEffect(() => { ... loadOfferings(); }, [activeTab, loadOfferings]);
//     ...3,000 lines...
//     const loadOfferings = useCallback(...)
//
// throws "Cannot access 'loadOfferings' before initialization" on every render,
// server and client. The component does not degrade - it does not render.
//
// It shipped twice, ten commits apart, and survived every "build passed"
// because the build was dying two steps earlier on a missing environment
// variable and never reached the render. The first check that got far enough
// found it in one run.
//
// The body of a hook callback is NOT checked, and must not be: referring to a
// later const from inside the callback is fine, because the callback runs after
// the module body has finished. Only the array is evaluated eagerly, and that
// is the whole distinction this script encodes.
//
// A heuristic, deliberately: it reads text rather than an AST, so it can be one
// file with no dependencies. It errs towards silence - a name it cannot resolve
// is skipped - because a check that cries wolf gets disabled, and then it is
// another thing nobody runs.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['app', 'lib'];
const files = [];
for (const root of ROOTS) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) stack.push(full);
      else if (/\.(jsx?|tsx?)$/.test(entry)) files.push(full);
    }
  }
}

// useEffect(..., [a, b]) / useMemo / useCallback / useLayoutEffect
const HOOK = /use(?:Effect|LayoutEffect|Memo|Callback)\s*\(/g;
const problems = [];

for (const file of files) {
  const src = readFileSync(file, 'utf8');

  // Where each top-level-ish const/let is declared, by name.
  const declaredAt = new Map();
  for (const m of src.matchAll(/^\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/gm)) {
    if (!declaredAt.has(m[1])) declaredAt.set(m[1], m.index);
  }

  HOOK.lastIndex = 0;
  let h;
  while ((h = HOOK.exec(src))) {
    // Walk to the matching close paren of the hook call.
    let depth = 1, i = HOOK.lastIndex;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      i++;
    }
    const call = src.slice(HOOK.lastIndex, i - 1);

    // The dependency array is the last [...] before the close.
    const lastOpen = call.lastIndexOf('[');
    const lastClose = call.lastIndexOf(']');
    if (lastOpen === -1 || lastClose < lastOpen) continue;
    const deps = call.slice(lastOpen + 1, lastClose);
    if (/[[\]{]/.test(deps)) continue; // nested structure: skip rather than guess

    // Only the HEAD of each dependency expression is a variable. In
    // [showModal, newAppt.duration] the names that matter are showModal and
    // newAppt — "duration" is a property, and reading it as a variable is how
    // this reported its first false positive.
    for (const expr of deps.split(',')) {
      const head = /^\s*([A-Za-z_$][\w$]*)/.exec(expr);
      if (!head) continue;
      const name = head[1];
      const at = declaredAt.get(name);
      if (at === undefined) continue;              // not a local const/let
      if (at < h.index) continue;                  // declared before: fine
      const line = src.slice(0, h.index).split('\n').length;
      const declLine = src.slice(0, at).split('\n').length;
      problems.push({ file, line, name, declLine });
    }
  }
}

if (problems.length === 0) {
  console.log('hook deps order: ok');
  process.exit(0);
}

console.error('Hook dependency array names a variable declared later in the file.');
console.error('The array is evaluated during render, so this throws "Cannot access X');
console.error('before initialization" on every render. Move the hook below the declaration.\n');
for (const p of problems) {
  console.error(`  ${p.file}:${p.line}  uses "${p.name}" (declared at line ${p.declLine})`);
}
process.exit(1);
