// scripts/tokenize-styles.mjs
//
// Collapse raw inline-style numbers to the design tokens in app/globals.css.
//
//   node scripts/tokenize-styles.mjs            # dry run: counts per file
//   node scripts/tokenize-styles.mjs --write    # rewrite in place
//
// Three properties, three mappings:
//
//   fontSize: <number>      -> "var(--t-*)"       the eight-step type scale
//   borderRadius: <number>  -> "var(--r-*)"       the seven radius tokens
//   boxShadow: "<literal>"  -> "var(--shadow-*)"  by the shadow's largest blur
//   boxShadow: `... ${pcShadow}` and friends -> "var(--shadow-accent)"
//
// Only object-literal properties are touched (`fontSize:12`, `fontSize: 12.5`,
// `borderRadius:"16px"`), which is how every inline style in this codebase is
// written. CSS inside <style> strings, canvas font strings ("700 64px Arial")
// and the print template are untouched: they are not inline styles and the
// lint rule does not cover them either.
//
// The mapping is a substitution table, not a judgement per site, so the
// change is one commit that can be reverted whole. Where a mapped value lands
// in a fixed-height box (the week grid's 30-minute block, the header) the
// commit message records what was checked.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const WRITE = process.argv.includes('--write');

// ── Type scale ──────────────────────────────────────────────────────────────
export function fontToken(px) {
  const n = Number(px);
  if (!Number.isFinite(n)) return null;
  if (n <= 11) return 'var(--t-xs)';
  if (n <= 12.5) return 'var(--t-sm)';
  if (n <= 14.5) return 'var(--t-md)';
  if (n <= 17) return 'var(--t-lg)';
  if (n <= 21) return 'var(--t-xl)';
  if (n <= 25) return 'var(--t-2xl)';
  if (n <= 29) return 'var(--t-3xl)';
  return 'var(--t-hero)';
}

// ── Radius ──────────────────────────────────────────────────────────────────
export function radiusToken(px) {
  const n = Number(px);
  if (!Number.isFinite(n)) return null;
  if (n === 0) return null;                 // square stays square
  if (n >= 99) return 'var(--r-full)';
  if (n <= 9) return 'var(--r-xs)';
  if (n <= 13) return 'var(--r-sm)';
  if (n <= 17) return 'var(--r-md)';
  if (n <= 23) return 'var(--r-lg)';
  if (n <= 30) return 'var(--r-xl)';
  return 'var(--r-2xl)';
}

// ── Shadow ──────────────────────────────────────────────────────────────────
export function shadowToken(literal) {
  const s = String(literal).trim();
  if (!s || s === 'none' || s.startsWith('var(--')) return null;
  if (/inset/.test(s)) return null;         // an inset is a border, leave it
  if (/pcShadow|--pc-shadow|\$\{/.test(s)) return 'var(--shadow-accent)';
  // Largest blur radius across comma-separated layers decides the tier.
  let maxBlur = 0;
  for (const layer of s.split(',')) {
    // x and y are often a bare 0 ("0 24px 60px ..."), so px is optional there.
    const m = /(-?\d+(?:\.\d+)?)(?:px)?\s+(-?\d+(?:\.\d+)?)(?:px)?\s+(\d+(?:\.\d+)?)px/.exec(layer);
    if (m) maxBlur = Math.max(maxBlur, Number(m[3]));
  }
  if (maxBlur <= 4) return 'var(--shadow-xs)';
  if (maxBlur <= 10) return 'var(--shadow-sm)';
  if (maxBlur <= 26) return 'var(--shadow-md)';
  if (maxBlur <= 50) return 'var(--shadow-lg)';
  return 'var(--shadow-xl)';
}

// ── The rewrite ─────────────────────────────────────────────────────────────
export function tokenize(src) {
  const counts = { fontSize: 0, borderRadius: 0, boxShadow: 0 };
  let out = src;

  // fontSize: 12 | 12.5 | "12px" | '12px'
  out = out.replace(/\bfontSize:\s*(?:(\d+(?:\.\d+)?)|"(\d+(?:\.\d+)?)px"|'(\d+(?:\.\d+)?)px')(?=\s*[,}\n])/g, (m, a, b, c) => {
    const t = fontToken(a ?? b ?? c);
    if (!t) return m;
    counts.fontSize++;
    return `fontSize:"${t}"`;
  });

  // borderRadius: 12 | "12px" | '12px'   (not "50%", not multi-value strings)
  out = out.replace(/\bborderRadius:\s*(?:(\d+(?:\.\d+)?)|"(\d+(?:\.\d+)?)px"|'(\d+(?:\.\d+)?)px')(?=\s*[,}\n])/g, (m, a, b, c) => {
    const t = radiusToken(a ?? b ?? c);
    if (!t) return m;
    counts.borderRadius++;
    return `borderRadius:"${t}"`;
  });

  // boxShadow: "literal" | 'literal' | `template`
  out = out.replace(/\bboxShadow:\s*(?:"([^"\n]*)"|'([^'\n]*)'|`([^`\n]*)`)/g, (m, a, b, c) => {
    const lit = a ?? b ?? c;
    const t = shadowToken(lit);
    if (!t) return m;
    counts.boxShadow++;
    return `boxShadow:"${t}"`;
  });

  return { out, counts };
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules') walk(p, out); }
    else if (/\.(jsx|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const isMain = process.argv[1] && /tokenize-styles\.mjs$/.test(process.argv[1]);
if (isMain) {
  const files = walk('app');
  let total = { fontSize: 0, borderRadius: 0, boxShadow: 0 };
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const { out, counts } = tokenize(src);
    const n = counts.fontSize + counts.borderRadius + counts.boxShadow;
    if (n === 0) continue;
    console.log(`${f}: fontSize ${counts.fontSize}, borderRadius ${counts.borderRadius}, boxShadow ${counts.boxShadow}`);
    total = { fontSize: total.fontSize + counts.fontSize, borderRadius: total.borderRadius + counts.borderRadius, boxShadow: total.boxShadow + counts.boxShadow };
    if (WRITE && out !== src) writeFileSync(f, out);
  }
  console.log(`${WRITE ? 'rewrote' : 'would rewrite'}: fontSize ${total.fontSize}, borderRadius ${total.borderRadius}, boxShadow ${total.boxShadow}`);
}
