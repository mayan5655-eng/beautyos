// test-landing-page.ts
//
// Same structural-source technique as the rest of this suite (no component-
// render harness exists here - see test-calendar-empty-tenant.ts). What
// this actually guards against:
//   - the copy rules getting violated by a future edit ("נשלח" claimed for
//     a message, or "קבלה" used for what the system issues)
//   - the root route silently going back to redirecting instead of
//     branching server-side (the whole reason this page exists - an ad
//     click used to hit a loading spinner, then a client-side bounce to
//     /login, with nothing for a crawler or a slow connection to read)
//   - the cost-table numbers drifting out of sync with their own stated sum
//   - reduced motion actually turning everything off, not just shortening it

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let passed = 0, failed = 0;
function ok(cond: unknown, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}

const pageSrc = readFileSync('app/page.tsx', 'utf8');
const landingSrc = readFileSync('app/LandingPage.jsx', 'utf8');
const cssSrc = readFileSync('app/globals.css', 'utf8');
const revealSrc = readFileSync('app/landing/Reveal.jsx', 'utf8');
const costSrc = readFileSync('app/landing/CostTable.jsx', 'utf8');

// ── Root route branches server-side, doesn't redirect ───────────────────────
ok(/export default async function Page/.test(pageSrc), 'root page is an async Server Component, not a client redirect');
ok(/await supabase\.auth\.getUser\(\)/.test(pageSrc), 'checks the session before deciding what to render');
ok(/if \(user\) return <BeautyOS/.test(pageSrc), 'a logged-in visitor still gets the real dashboard');
ok(/return <LandingPage/.test(pageSrc), 'a logged-out visitor gets the landing page, not a redirect to /login');
ok(!/router\.push\(["']\/login["']\)|router\.replace\(["']\/login["']\)/.test(pageSrc),
  'no client-side redirect to /login left in the root route itself');
ok(/export const metadata/.test(pageSrc), 'has real metadata (title/description/OG), not inherited silence');
ok(/og-1200x630\.jpg/.test(pageSrc), 'OG image is set');

// ── Copy rules ────────────────────────────────────────────────────────────
// "פקידת קבלה" (receptionist) in the cost-comparison table is a different
// word entirely (reception, not receipt) - excluded explicitly rather than
// loosening this to the point it stops catching the real thing. (No regex
// lookbehind: that's ES2018+, and this build target is ES2017 - the exact
// thing that broke the Vercel deploy for test-onboarding-tour.ts earlier.)
const withoutReceptionist = landingSrc.replace(/פקידת קבלה/g, '');
ok(!/קבלה/.test(withoutReceptionist), 'never says קבלה (the receipt document) outside of "פקידת קבלה" (receptionist)');
ok(!/נשלח(ת|ה|ים|ות)?\s+אוטומטית/.test(landingSrc),
  'never claims a message is sent automatically - "prepared" (מוכן/ה) is the word for it');

// ── Cost table: the row sum matches the stated total, and matches the brief ─
const rowMatches = [...landingSrc.matchAll(/low:\s*(\d+),\s*high:\s*(\d+)\s*\}/g)];
ok(rowMatches.length === 6, `six cost rows (found ${rowMatches.length})`);
const sumLow = rowMatches.reduce((s, m) => s + Number(m[1]), 0);
const sumHigh = rowMatches.reduce((s, m) => s + Number(m[2]), 0);
ok(sumLow === 3831, `row lows sum to 3,831 (got ${sumLow})`);
ok(sumHigh === 10068, `row highs sum to 10,068 (got ${sumHigh})`);

// ── The one real "moment": rows reveal, THEN the total counts up ────────────
ok(/requestAnimationFrame/.test(costSrc), 'the total count-up is driven by rAF, not a CSS transition on a number');
ok(/900/.test(costSrc), 'the count-up duration is ~900ms, as specified');
ok(/rows\.length \* 80/.test(costSrc), 'rows stagger at 80ms apart, and the count-up waits for them to finish first');

// ── Motion: reduced-motion turns it OFF, not down ────────────────────────────
ok(/prefers-reduced-motion:\s*reduce/.test(cssSrc), 'globals.css has a reduced-motion override for the landing primitives');
ok(/opacity:\s*1\s*!important/.test(cssSrc) && /transform:\s*none\s*!important/.test(cssSrc),
  'reduced motion snaps straight to the finished state (!important), not a shorter version of the animation');
ok(/prefers-reduced-motion/.test(revealSrc) && /setShown\(true\)/.test(revealSrc),
  'Reveal itself skips the IntersectionObserver entirely under reduced motion, not just shortens the CSS transition');
ok(/prefers-reduced-motion/.test(costSrc) && /setCountLow\(totalLow\)/.test(costSrc),
  'CostTable renders the final numbers immediately under reduced motion, no count-up at all');

// ── Flowers fade to 60%, never pop to full ───────────────────────────────────
ok(/0\.6/.test(cssSrc) && /klFlowerFade/.test(cssSrc), 'flower marks fade in to 60% opacity, not 100%');

console.log(`landing page: passed ${passed} failed ${failed}`);
if (failed > 0) process.exit(1);
