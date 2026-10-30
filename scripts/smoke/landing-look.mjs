// Screenshots of the logged-out landing page at phone and desktop width, and the checks a source test cannot make: the hero photos really load,
// the page does not scroll sideways, no long dash or arrow reaches the visitor.
//
//   SMOKE_BASE=https://<branch-preview>.vercel.app node --env-file=.env.local scripts/smoke/landing-look.mjs <outDir>
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const out = process.argv[2];
const BASE = process.env.SMOKE_BASE;
if (!out || !BASE) { console.error('usage: SMOKE_BASE=<url> landing-look.mjs <outDir>'); process.exit(2); }
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
let failed = false;
for (const [name, width, height] of [['phone', 430, 932], ['desktop', 1280, 800]]) {
  const page = await (await browser.newContext({ viewport: { width, height }, locale: 'he-IL' })).newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const facts = await page.evaluate(() => ({
    title: document.title,
    h1: document.querySelector('h1')?.innerText,
    sideways: document.documentElement.scrollWidth - window.innerWidth,
    photos: [...document.images].filter((i) => /facial-classic|nails-manicure|kalmea-wordmark/.test(i.currentSrc)).map((i) => i.naturalWidth),
    h1Bottom: Math.round(document.querySelector('h1')?.getBoundingClientRect().bottom || 0),
    dashes: (document.body.innerText.match(/[—–←]| -- /g) || []).length,
    videos: [...document.querySelectorAll('[data-testid=landing-videos] p')].map((p) => p.innerText),
  }));
  console.log(name, JSON.stringify(facts));
  if (facts.sideways > 0 || facts.dashes > 0 || facts.photos.length !== 3 || facts.photos.some((w) => !w)) failed = true;
  await page.screenshot({ path: `${out}/landing-${name}-top.png` });
  // Reveal sections appear on scroll: walk down first so the full-page picture is the finished page.
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, 0); });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/landing-${name}-full.png`, fullPage: true });
}
await browser.close();
process.exit(failed ? 1 : 0);
