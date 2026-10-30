// marketing/landing-clips.mjs
//
// The short "the system in action" clips for the landing page: real screen recordings of the live app on the demo tenant, at phone size.
// Nothing is saved and nothing is sent: no clip presses "שליחה" or finishes a booking, and an AI route aborts the take.
//
//   node landing-clips.mjs [--only=booking,leads]   -> ../public/media/landing-<id>.mp4 + .jpg (over the files that are there)

import fs from 'node:fs';
import path from 'node:path';
import { BASE, DEMO_TENANT, ff, duration, log, pause } from './lib.mjs';
import { CLIPS, recordClips } from './motion-lib.mjs';

const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1].split(',');
const PUB = path.resolve('../public/media');

const nav = (p, l) => p.locator('button:visible', { hasText: new RegExp(`${l}$`) }).last();
const btn = (p, re) => p.locator('button:visible', { hasText: re }).first();
const noBanner = (p) => p.evaluate(() => { for (const e of document.querySelectorAll('div')) if (e.children.length && /תצוגת דמו/.test(e.textContent) && e.textContent.length < 120) { e.style.display = 'none'; break; } }).catch(() => {});
const home = async (p) => { await p.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' }); await nav(p, 'יומן').waitFor({ timeout: 25000 }); await pause(2500); await noBanner(p); };

const DEFS = {
  leads: {
    setup: async (h) => { await home(h.page); await h.tap(nav(h.page, 'לקוחות'), { after: 800 }); await noBanner(h.page); },
    play: async (h) => { await pause(700); await h.tap(btn(h.page, /^פניות/), { before: 200, after: 1600 }); await h.scrollBy(260, 1500); await pause(1800); },
  },
  booking: {
    owner: false,
    setup: async (h) => { await h.page.goto(`${BASE}/book?t=${DEMO_TENANT}`, { waitUntil: 'networkidle' }); await h.page.locator('#bk-services').waitFor({ timeout: 15000 }); await pause(400); },
    play: async (h) => {
      const page = h.page;
      await pause(700); await h.glide(page.locator('#bk-services'), 1000); await pause(700);
      await h.tap(page.locator('#bk-services button', { hasText: 'קביעת תור' }).first(), { after: 900 });
      await page.getByText('בחרי יום').waitFor({ timeout: 10000 });
      const weekdays = page.getByText(/^(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)$/);
      const slots = page.locator('button.bk-btn:not([disabled])').filter({ hasText: /^\d{2}:\d{2}$/ });
      for (let i = 1; i < Math.min(await weekdays.count(), 10); i++) {
        await h.tap(weekdays.nth(i), { after: 400 });
        if (await slots.first().waitFor({ timeout: 3000 }).then(() => true).catch(() => false)) break;
      }
      await pause(1200);
      await h.tap(slots.first(), { after: 1600 }); // stops here: the booking is never sent
    },
  },
  messages: {
    setup: async (h) => { await home(h.page); await h.tap(nav(h.page, 'לקוחות'), { after: 700 }); await h.tap(btn(h.page, /^הודעות$/), { after: 1200 }); await noBanner(h.page); },
    play: async (h) => { await pause(1000); await h.scrollBy(320, 2000); await pause(1800); }, // "שליחה" is never tapped
  },
  content: {
    setup: async (h) => { await home(h.page); await h.tap(nav(h.page, 'תוכן'), { after: 1200 }); await noBanner(h.page); },
    play: async (h) => { await pause(900); await h.tap(btn(h.page, /^תבניות/), { before: 200, after: 1000 }); await h.scrollBy(520, 2400); await pause(1200); },
  },
  data: {
    setup: async (h) => { await home(h.page); await h.tap(nav(h.page, 'תשלום'), { after: 1000 }); await noBanner(h.page); },
    play: async (h) => { await pause(800); await h.tap(h.page.getByText(/סיכום הכנסות ודוחות/).filter({ visible: true }).first(), { before: 300, after: 1500 }); await h.scrollBy(380, 2000); await pause(1500); },
  },
};

await recordClips(DEFS, only);

for (const id of Object.keys(DEFS)) {
  if (only && !only.includes(id)) continue;
  const src = path.join(CLIPS, `${id}.webm`);
  const out = path.join(PUB, `landing-${id}.mp4`);
  ff(['-i', src, '-vf', 'scale=430:-2:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-profile:v', 'main', '-preset', 'slow', '-crf', '30', '-r', '30', '-an', '-movflags', '+faststart', out]);
  ff(['-ss', String(Math.min(2.5, duration(src) / 2)), '-i', src, '-frames:v', '1', '-vf', 'scale=430:-2', '-q:v', '5', path.join(PUB, `landing-${id}.jpg`)]);
  log(`${id}: ${duration(out).toFixed(1)} s, ${Math.round(fs.statSync(out).size / 1024)} KB`);
}
