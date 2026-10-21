// marketing/tutorial-motion.mjs
//
// The two tutorial videos for new users, voiced: the tour of every main screen, and how to book an appointment (from the app,
// and by the client on her booking page). Same style as the welcome video (motion-lib.mjs: real demo clips in the phone,
// Gveret Levin titles, pop-up windows, music) plus a Hebrew voice-over from Google Cloud Text-to-Speech.
//
//   node tutorial-motion.mjs --clips [--only=t-home,b-self]   record the real clips (demo tenant; the booking clips book on it)
//   node tutorial-motion.mjs [tour|booking]                   render with the voice -> out/tutorials/kalmea-tutorial-<v>-voice.mp4
//   node tutorial-motion.mjs [tour|booking] --draft           no voice: silent placeholders of estimated length (chars / 14 s),
//                                                             music only -> ...-voice-draft.mp4 (to check the pictures without a key)
//   node tutorial-motion.mjs tour --frame=12.5                one still -> out/motion/frame.png
//
// Voice: Google TTS (texttospeech.googleapis.com, he-IL). The API key is read from C:\Users\ksafi\kalmea-google-tts-key.txt
// (KALMEA_TTS_KEY_FILE to override); it is never printed and never committed. Voice: KALMEA_TTS_VOICE, else the first female
// Chirp3-HD he-IL voice, else Neural2, else WaveNet. Every line is cached as out/voice/<sha1(voice+text)>.mp3, so a re-render
// costs nothing; the whole narration of both videos is about 1,300 characters (Google's free tier is 1M a month for Chirp 3 HD).
//
// Each scene's length = max(its minimum visual length, 0.5 s lead + the narration + 0.8 s). The music sits at 0.18 under the
// voice and 0.4 between lines, with a fade in and out.
//
// What it may claim: only what the frames show and what is on in production. The reminders are "ready to send", not
// automatic; the booking pop-ups ("תור חדש נקבע!") are the in-app notification she always gets. Demo tenant only; AI routes
// abort a take; "שלחי" is never tapped. The end card's face is the product's AI presenter, labelled as such.
// Music: "Beauty Skincare Cosmetic Music" by GR0ZA, Pixabay Content License (see welcome-motion.mjs).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { BASE, DEMO_TENANT, OUT, ff, duration, log, pause } from './lib.mjs';
import {
  DIR, SHOTS, MUSIC, b64, el, title, phone, pop, wa, petals, endCard, timeline, page, recordClips, clipMarks, clipDuration, render,
} from './motion-lib.mjs';

const args = process.argv.slice(2);
const which = args.filter((a) => !a.startsWith('--'));
const DRAFT = args.includes('--draft');
const stillAt = args.find((a) => a.startsWith('--frame='))?.split('=')[1];
const KEY_FILE = process.env.KALMEA_TTS_KEY_FILE || 'C:\\Users\\ksafi\\kalmea-google-tts-key.txt';
const VOICE_DIR = path.join(OUT, 'voice');
const TUT = path.join(OUT, 'tutorials');
for (const d of [VOICE_DIR, TUT]) fs.mkdirSync(d, { recursive: true });

// ── the real clips ─────────────────────────────────────────────────────────────────────────────────
const nav = (p, l) => p.locator('button:visible', { hasText: new RegExp(`${l}$`) }).last();
const btn = (p, re) => p.locator('button:visible', { hasText: re }).first();
const home = async (p) => { await p.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await nav(p, 'יומן').waitFor({ timeout: 20000 }); await pause(1200); };
const settings = async (h) => { await home(h.page); await h.tap(h.page.locator('button[aria-label="הגדרות"]').first(), { before: 200, after: 1400 }); };
const israelDom = (n) => +new Date(Date.now() + n * 864e5).toLocaleDateString('en-GB', { timeZone: 'Asia/Jerusalem', day: 'numeric' });
// a different made-up client each run (the same phone would attach to the same record); obviously fake phones
const FIRST = ['אביגיל', 'גילי', 'דורית', 'חן', 'ורד', 'זהבה', 'ליאור', 'ענבל', 'פנינה', 'צליל', 'קרן', 'תהל'];
const LAST = ['כהן', 'לוי', 'מזרחי', 'דהן', 'פרידמן', 'אשכנזי', 'ביטון', 'גולן', 'חזן', 'טל', 'שמעוני', 'רוזן'];
const pick = Math.floor(Date.now() / 60000) % (FIRST.length * LAST.length);
const NAME = `${FIRST[pick % FIRST.length]} ${LAST[Math.floor(pick / FIRST.length)]}`;
const PHONE = `050000${String(1000 + pick).padStart(4, '0')}`;

const CLIPS = {
  't-home': { setup: async (h) => { await home(h.page); },
    play: async (h) => { await pause(1200); await h.scrollBy(520, 2400); await pause(2000); } },
  't-calendar': { setup: async (h) => { await home(h.page); await h.tap(nav(h.page, 'יומן'), { before: 100, after: 1000 }); },
    play: async (h) => { await pause(900); await h.tap(btn(h.page, /^שבוע$/), { before: 200, after: 1300 }); await h.scrollBy(240, 1500);
      await h.tap(btn(h.page, /^יום$/), { before: 300, after: 800 });
      await h.tap(btn(h.page, /תור חדש/), { before: 300, after: 1800 }); await h.page.keyboard.press('Escape'); await pause(600); } }, // never saved
  't-card': { setup: async (h) => { await home(h.page); await h.tap(nav(h.page, 'לקוחות'), { after: 1000 }); },
    play: async (h) => { await pause(900); await h.tap(h.page.getByText('ליה דהן', { exact: true }).filter({ visible: true }).first(), { before: 300, after: 1500 });
      await h.tap(btn(h.page, /^היסטוריה/), { before: 400, after: 1200 }); await h.tap(btn(h.page, /^תשלומים/), { before: 400, after: 1400 }); } },
  't-messages': { setup: async (h) => { await home(h.page); await h.tap(nav(h.page, 'לקוחות'), { after: 700 }); await h.tap(btn(h.page, /^הודעות$/), { after: 1200 }); },
    play: async (h) => { await pause(1200); await h.scrollBy(300, 2000); await pause(2200); } }, // "שלחי" is never tapped
  't-income': { setup: async (h) => { await home(h.page); await h.tap(nav(h.page, 'תשלום'), { before: 100, after: 1000 }); },
    play: async (h) => { await pause(900); await h.scrollBy(360, 1600); await h.scrollBy(-360, 900);
      await h.tap(h.page.getByText(/סיכום הכנסות ודוחות/).filter({ visible: true }).first(), { before: 300, after: 1300 });
      const monthly = btn(h.page, /^חודשי$/); if (await monthly.count()) await h.tap(monthly, { before: 300, after: 1500 }); } },
  't-content': { setup: async (h) => { await home(h.page); await h.tap(nav(h.page, 'תוכן'), { after: 1200 }); },
    play: async (h) => { await pause(1200); await h.tap(btn(h.page, /^תבניות/), { before: 200, after: 1000 }); await h.scrollBy(520, 2400); await pause(1000); } },
  't-settings': { setup: settings,
    play: async (h) => { await pause(600); await h.tap(btn(h.page, /^יומן ושירותים$/), { before: 200, after: 1600 }); await h.scrollBy(260, 1400);
      await h.scrollBy(-260, 800); await h.tap(btn(h.page, /^הדף שלי$/), { before: 300, after: 1600 }); await h.scrollBy(260, 1400); } },
  't-book': { owner: false,
    setup: async (h) => { await h.page.goto(`${BASE}/book?t=${DEMO_TENANT}`, { waitUntil: 'networkidle' }); await h.page.locator('#bk-services').waitFor({ timeout: 15000 }); await pause(300); },
    play: async (h) => { await pause(1200); await h.glide(h.page.locator('#bk-services'), 1400); await pause(900); await h.scrollBy(420, 2000); await pause(1200); } },
  // booking video: books ליה דהן today from the app (written on the demo tenant; the nightly reset clears it)
  'b-inapp': { setup: async (h) => { await home(h.page); await h.tap(nav(h.page, 'יומן'), { before: 100, after: 1000 }); },
    async play(h, mark) {
      const page = h.page;
      await pause(900);
      await h.tap(btn(page, /תור חדש/), { before: 300, after: 900 });
      await h.type(page.getByPlaceholder('שם הלקוחה או טלפון'), 'ליה', { after: 900 });
      const match = page.locator('.sheet-backdrop').getByText('ליה דהן', { exact: true }).filter({ visible: true }).first(); // she may also be in the calendar behind it
      await match.waitFor({ timeout: 8000 });
      await h.tap(match, { before: 200, after: 800 });
      await h.tap(btn(page, /^ניקוי פנים עמוק$/), { before: 300, after: 900 }); // the treatment first: its length decides which times are free
      const sel = page.locator('select:visible').filter({ has: page.locator('option', { hasText: /^\d\d:\d\d/ }) }).first();
      await sel.waitFor({ timeout: 8000 });
      for (let i = 0; i < 40 && !(await sel.locator('option').evaluateAll((os) => os.some((o) => /תפוס/.test(o.textContent || '')))); i++) await pause(150);
      const free = (await sel.locator('option').evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent || '' })))).filter((o) => /^\d\d:\d\d/.test(o.t) && !/תפוס|מחוץ/.test(o.t));
      if (!free.length) throw new Error('b-inapp: no free time today in the sheet');
      const time = free.find((o) => /^1[6-8]:/.test(o.t)) || free[free.length - 1];
      const sb = await sel.boundingBox();
      await page.evaluate(([x, y]) => window.__finger && window.__finger(x, y), [sb.x + sb.width / 2, sb.y + sb.height / 2]); await pause(700);
      await sel.selectOption(time.v); await pause(900);
      await page.evaluate(() => window.__fingerOff && window.__fingerOff());
      if (await page.getByText(/השעה תפוסה/).filter({ visible: true }).count()) throw new Error(`b-inapp: ${time.t} turned out taken`);
      await h.tap(btn(page, /שמירה/), { before: 500, after: 1200 });
      mark('saved');
      const mine = page.locator('div', { hasText: time.t.slice(0, 5) }).filter({ has: page.getByText('ליה דהן') }).last();
      await mine.waitFor({ timeout: 10000 }).catch(() => { throw new Error(`b-inapp: the new appointment (${time.t}) is not in the calendar after saving`); });
      const row = mine.getByText('ליה דהן').first();
      await h.glide(row, 800);
      await row.evaluate((e) => { const c = e.closest('div:has(button)') || e.parentElement; c.style.transition = 'box-shadow .4s'; c.style.boxShadow = '0 0 0 3px #E9A9A1'; });
      await pause(2600);
    } },
  // booking video: a client books herself on the public page (a made-up client, on the demo tenant)
  'b-self': { owner: false,
    setup: async (h) => { await h.page.goto(`${BASE}/book?t=${DEMO_TENANT}`, { waitUntil: 'networkidle' }); await h.page.locator('#bk-services').waitFor({ timeout: 15000 }); await pause(400); },
    async play(h, mark) {
      const page = h.page;
      await pause(1000); await h.glide(page.locator('#bk-services'), 1100); await pause(1200);
      await h.tap(page.locator('#bk-services button', { hasText: 'קביעת תור' }).first(), { after: 900 });
      await page.getByText('בחרי יום').waitFor({ timeout: 10000 });
      const weekdays = page.getByText(/^(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)$/);
      const today = israelDom(0), chips = [];
      for (let i = 0; i < Math.min(await weekdays.count(), 14); i++) {
        const dom = +(await weekdays.nth(i).evaluate((e) => (e.parentElement.innerText.match(/\d+/) || [])[0]));
        if (dom) chips.push({ i, dom, ahead: (dom - today + 31) % 31 });
      }
      chips.sort((a, b) => (a.ahead === 0) - (b.ahead === 0) || a.ahead - b.ahead);
      const slots = page.locator('button.bk-btn:not([disabled])').filter({ hasText: /^\d{2}:\d{2}$/ });
      let chosen = null;
      for (const c of chips) {
        await h.tap(weekdays.nth(c.i), { after: 400 });
        if (await slots.first().waitFor({ timeout: 3500 }).then(() => true).catch(() => false)) { chosen = c; break; }
      }
      if (!chosen) throw new Error('b-self: no day in the next two weeks has a free time on the demo tenant');
      await pause(1500);
      const slot = slots.filter({ hasText: /^(11:00|11:30|12:00|12:30)$/ });
      await h.tap((await slot.count()) ? slot.first() : slots.first(), { after: 900 });
      await h.tap(page.getByRole('button', { name: /המשיכי/ }), { after: 600 });
      await page.getByText('סיכום התור').waitFor({ timeout: 10000 });
      mark('details');
      await pause(600);
      await h.type(page.getByPlaceholder('שם מלא'), NAME, { after: 300 });
      await h.type(page.getByPlaceholder('טלפון נייד'), PHONE, { after: 300 });
      await h.tap(page.getByRole('checkbox', { name: 'אישור שמירת הפרטים' }), { after: 500 }); // the marketing opt-in next to it stays unticked
      await h.tap(page.getByRole('button', { name: 'קביעת תור' }).last(), { after: 400 });
      await page.getByText('התור נקבע').waitFor({ timeout: 20000 });
      mark('booked');
      log(`   b-self: ${NAME}`);
      await pause(2600);
    } },
};

if (args.includes('--clips')) {
  await recordClips(CLIPS, args.find((a) => a.startsWith('--only='))?.split('=')[1]?.split(','));
  process.exit(0);
}

// ── the voice ────────────────────────────────────────────────────────────────────────────────────
const LEAD = 0.5, TAIL = 0.8;
const key = !DRAFT && fs.existsSync(KEY_FILE) ? fs.readFileSync(KEY_FILE, 'utf8').trim() : null;
if (!DRAFT && !key && stillAt == null) { console.error(`[tour] no key in ${KEY_FILE}: render with --draft, or put the Google TTS key there`); process.exit(1); }
const TTS = 'https://texttospeech.googleapis.com/v1';

async function pickVoice() {
  if (process.env.KALMEA_TTS_VOICE) return process.env.KALMEA_TTS_VOICE;
  const r = await fetch(`${TTS}/voices?languageCode=he-IL&key=${encodeURIComponent(key)}`);
  if (!r.ok) throw new Error(`Google TTS voices: HTTP ${r.status} (is the Text-to-Speech API enabled for this key?)`);
  const vs = ((await r.json()).voices || []).filter((v) => (v.languageCodes || []).includes('he-IL'));
  const fem = vs.filter((v) => v.ssmlGender === 'FEMALE');
  const best = ['Chirp3-HD', 'Neural2', 'Wavenet'].map((k) => fem.find((v) => v.name.includes(k))).find(Boolean) || fem[0] || vs[0];
  if (!best) throw new Error('Google TTS: no he-IL voice');
  return best.name;
}

let VOICE = null;
/** { file, dur } for a line of narration; cached on disk by voice + text. Draft: no file, estimated length. */
async function say(text) {
  if (!key) return { file: null, dur: +(text.length / 14).toFixed(2) };
  VOICE ||= await pickVoice();
  const f = path.join(VOICE_DIR, `${crypto.createHash('sha1').update(`${VOICE}\n${text}`).digest('hex')}.mp3`);
  if (!fs.existsSync(f)) {
    const r = await fetch(`${TTS}/text:synthesize?key=${encodeURIComponent(key)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: { text }, voice: { languageCode: 'he-IL', name: VOICE }, audioConfig: { audioEncoding: 'MP3', sampleRateHertz: 44100 } }),
    });
    if (!r.ok) throw new Error(`Google TTS: HTTP ${r.status} for "${text.slice(0, 30)}..."`);
    fs.writeFileSync(f, Buffer.from((await r.json()).audioContent, 'base64'));
  }
  return { file: f, dur: duration(f) };
}

// ── the videos ───────────────────────────────────────────────────────────────────────────────────
const REELS = fs.existsSync(path.join(SHOTS, 'reels.png')) ? b64(path.join(SHOTS, 'reels.png'), 'image/png') : null;
const reel = (x, left, top, rot, tin, tout) => (REELS ? el('thumb', tin, tout, 'fly', '',
  `left:${left}px;top:${top}px;background-image:url(${REELS});background-size:${430 * 2.3}px ${764 * 2.3}px;background-position:-${x * 2.3}px -${600 * 2.3}px`, `data-rot="${rot}" data-float="5"`) : '');
const card = (at, end, l1, l2) => `
  <img class="el" src="${BASE}/flower-full.png" data-in="${at(0.15)}" data-out="${end}" data-a="spin" style="left:200px;top:220px;width:140px">
  ${el('title big', at(0.5), end, 'up', `<div>${l1}</div><div>${l2}</div>`, 'top:400px')}
  <img class="el" src="${BASE}/kalmea-wordmark.png" data-in="${at(1.1)}" data-out="${end}" data-a="pop" style="left:165px;top:580px;width:210px">
  ${petals(255, 300, at(0.3))}`;

// A scene: min (s, its shortest visual length), text (the narration), clip (optional: the real take it plays, and which part),
// build(at, end, c) where c = { rate, from, until } for the clip. A long take is played faster (up to 1.7x) to fit its narration;
// past that the scene grows instead. clip.hold adds seconds after the take ends (time to read a pop-up on its last frame).
const VIDEOS = {
  tour: [
    { min: 3.6, text: 'היי, ברוכה הבאה לקלמיה! בואי נעשה סיור קצר במערכת.', build: (at, end) => card(at, end, 'ברוכה הבאה', 'לקלמיה!') },
    { min: 6, text: 'זה מסך הבית. כאן תראי כל בוקר את התורים של היום, כמה הכנסת, ומה כדאי לעשות היום.', clip: { id: 't-home' },
      build: (at, end, c) => `${title(at(0.1), end, 'מסך הבית,', 'כל הבוקר במבט אחד')}${phone(at(0.3), end, 't-home', 'rise', 0, 999, c.rate)}` },
    { min: 6, text: 'ביומן את רואה את כל התורים, ביום או בשבוע שלם. קובעים תור חדש בכמה נגיעות.', clip: { id: 't-calendar' },
      build: (at, end, c) => `${title(at(0.1), end, 'היומן שלך,', 'ביום או בשבוע')}${phone(at(0.3), end, 't-calendar', 'right', 0, 999, c.rate)}` },
    { min: 6, text: 'כל הלקוחות שלך במקום אחד. לכל לקוחה יש כרטיס עם הטיפולים, ההערות והתשלומים שלה.', clip: { id: 't-card' },
      build: (at, end, c) => `${title(at(0.1), end, 'כל הלקוחות,', 'וכרטיס לכל אחת')}${phone(at(0.3), end, 't-card', 'left', 0, 999, c.rate)}` },
    { min: 6, text: 'במרכז ההודעות מחכות לך תזכורות ואישורים ללקוחות, מוכנים לשליחה בוואטסאפ.', clip: { id: 't-messages' },
      build: (at, end, c) => `${title(at(0.1), end, 'תזכורות ואישורים,', 'מוכנים לשליחה')}${phone(at(0.3), end, 't-messages', 'rise', 0, 999, c.rate)}
        ${wa('תזכורת ללקוחה · יום לפני', ['היי ליה,', 'תזכורת לתור שלך בקליניקה מחר.'], at(2.2), end, 'right:24px;top:250px', '<div class="btns"><span>לאישור</span><span>לשינוי</span></div>')}` },
    { min: 6, text: 'כאן רושמים תשלומים, ובסיכום ההכנסות רואים כמה הכנסת בכל חודש.', clip: { id: 't-income' },
      build: (at, end, c) => `${title(at(0.1), end, 'תשלומים', 'וסיכום הכנסות')}${phone(at(0.3), end, 't-income', 'right', 0, 999, c.rate)}` },
    { min: 6, text: 'בלשונית התוכן יש פוסטים ורילס מוכנים, כבר בצבעים ובלוגו של העסק שלך.', clip: { id: 't-content' },
      build: (at, end, c) => `${title(at(0.1), end, 'פוסטים ורילס', 'בצבעים שלך')}${phone(at(0.3), end, 't-content', 'left', 0, 999, c.rate)}
        ${reel(30, 18, 320, -9, at(2.4), end)}${reel(222, 400, 350, 8, at(2.9), end)}${reel(91, 26, 650, 6, at(3.4), end)}${reel(344, 392, 670, -7, at(3.9), end)}` },
    { min: 6, text: 'בהגדרות מוסיפים שירותים ומחירים, שעות פעילות, ומעצבים את הדף שלך.', clip: { id: 't-settings' },
      build: (at, end, c) => `${title(at(0.1), end, 'ההגדרות שלך:', 'שירותים, שעות ועיצוב')}${phone(at(0.3), end, 't-settings', 'rise', 0, 999, c.rate)}` },
    { min: 6, text: 'וזה דף קביעת התורים שלך. שולחים ללקוחות את הקישור, והן קובעות לבד.', clip: { id: 't-book' },
      build: (at, end, c) => `${title(at(0.1), end, 'דף קביעת התורים', 'שלך')}${phone(at(0.3), end, 't-book', 'right', 0, 999, c.rate)}
        ${pop(at(3.6), end, 'תור חדש נקבע!', ['לקוחה קבעה דרך הדף שלך', 'והתור כבר ביומן'], 'top:250px')}` },
    { min: 5.4, text: 'זהו! יש שאלה? אנחנו כאן בוואטסאפ. בהצלחה!', build: (at) => endCard(at(0.1), 'יש שאלה? אנחנו כאן', 'בוואטסאפ') },
  ],
  booking: [
    { min: 3.4, text: 'בואי נראה איך קובעים תור.', build: (at, end) => card(at, end, 'איך קובעים', 'תור?') },
    { min: 7, text: 'ביומן, לוחצים על תור חדש. בוחרים לקוחה, טיפול ושעה פנויה, ושומרים. התור כבר ביומן.', clip: { id: 'b-inapp' },
      build: (at, end, c) => {
        const saved = clipMarks('b-inapp').saved;
        return `${title(at(0.1), end, 'תור חדש,', 'בכמה נגיעות')}${phone(at(0.3), end, 'b-inapp', 'rise', 0, 999, c.rate)}
          ${saved ? pop(at(0.5 + saved / c.rate + 0.3), end, 'התור נשמר ✓', ['ליה דהן · ניקוי פנים עמוק'], 'top:250px', 'calendar') : ''}`;
      } },
    { min: 7, text: 'ועכשיו מהצד של הלקוחה: היא נכנסת לדף שלך, בוחרת טיפול, ורואה רק את השעות שפנויות לך.', clip: { id: 'b-self', to: 'details' },
      build: (at, end, c) => `${title(at(0.1), end, 'מהצד של הלקוחה:', 'רק שעות פנויות')}${phone(at(0.3), end, 'b-self', 'rise', 0, c.until, c.rate)}` },
    { min: 6.5, text: 'היא ממלאת שם וטלפון, מאשרת, והתור נכנס ליומן שלך לבד.', clip: { id: 'b-self', from: 'details', hold: 2 },
      build: (at, end, c) => {
        const booked = clipMarks('b-self').booked;
        return `${title(at(0.1), end, 'שם, טלפון,', 'וזהו!')}${phone(at(0.3), end, 'b-self', 'left', c.from, 999, c.rate)}
          ${booked ? pop(at(0.5 + (booked - c.from) / c.rate - 0.6), end, 'תור חדש נקבע!', ['לקוחה חדשה קבעה דרך הדף שלך'], 'top:250px') : ''}`;
      } },
    { min: 5.2, text: 'ככה פשוט. בהצלחה!', build: (at) => endCard(at(0.1), 'ככה פשוט.', 'בהצלחה!') },
  ],
};

/** Where a scene's clip starts and stops (clip seconds), and how fast it must play to fit `len`. */
function clipFit(clip, len) {
  if (!clip) return { rate: 1, from: 0, until: 999, len };
  const marks = clipMarks(clip.id), total = clipDuration(clip.id);
  const from = clip.from ? +((marks[clip.from] ?? 0) - 0.3).toFixed(2) : 0;
  const until = clip.to ? +((marks[clip.to] ?? total) - 0.3).toFixed(2) : total;
  const seg = until - from, room = len - 0.8;
  const rate = +Math.min(1.7, Math.max(1, seg / room)).toFixed(3);
  return { rate, from, until: clip.to ? until : 999, len: +Math.max(len, seg / rate + 0.8 + (clip.hold || 0)).toFixed(2) };
}

// ── build, mix, render ──────────────────────────────────────────────────────────────────────────────
const names = which.length ? which : Object.keys(VIDEOS);
for (const n of names) if (!VIDEOS[n]) { console.error(`[tour] unknown video "${n}" (tour | booking)`); process.exit(1); }

for (const n of names) {
  const tl = timeline();
  const voice = [];
  for (const sc of VIDEOS[n]) {
    const v = await say(sc.text);
    const c = clipFit(sc.clip, +Math.max(sc.min, LEAD + v.dur + TAIL).toFixed(2));
    const t0 = tl.scene(c.len, (at, end) => sc.build(at, end, c));
    voice.push({ start: +(t0 + LEAD).toFixed(2), ...v });
  }
  const seconds = tl.seconds;
  const html = page(tl.html);
  if (stillAt != null) { log(`still -> ${await render({ html, seconds, still: +stillAt })} (${n}, ${seconds} s)`); continue; }

  // the audio: the narration lines at their starts, the music under them (0.18 under a line, 0.4 between), faded in and out
  if (!fs.existsSync(MUSIC)) throw new Error(`missing the music file ${MUSIC}`);
  const mix = path.join(DIR, `${n}-audio.m4a`);
  const lines = voice.filter((v) => v.file);
  const talk = voice.map((v) => `between(t,${v.start},${(v.start + v.dur).toFixed(2)})`).join('+');
  const inputs = ['-f', 'lavfi', '-t', String(seconds), '-i', 'anullsrc=r=44100:cl=stereo', '-stream_loop', '-1', '-i', MUSIC, ...lines.flatMap((v) => ['-i', v.file])];
  const delayed = lines.map((v, i) => `[${i + 2}:a]aresample=44100,aformat=channel_layouts=stereo,adelay=${Math.round(v.start * 1000)}|${Math.round(v.start * 1000)}[v${i}]`);
  const graph = [
    ...delayed,
    `[0:a]${lines.map((_, i) => `[v${i}]`).join('')}amix=inputs=${lines.length + 1}:normalize=0:duration=first[voice]`,
    `[1:a]atrim=0:${seconds},asetpts=N/SR/TB,aresample=44100,aformat=channel_layouts=stereo,volume='if(${talk},0.18,0.4)':eval=frame,afade=t=in:st=0:d=0.8,afade=t=out:st=${(seconds - 2).toFixed(2)}:d=2[music]`,
    '[voice][music]amix=inputs=2:normalize=0:duration=first[out]',
  ].join(';');
  ff([...inputs, '-filter_complex', graph, '-map', '[out]', '-t', String(seconds), '-c:a', 'aac', '-b:a', '160k', mix]);

  const outFile = path.join(TUT, `kalmea-tutorial-${n}-voice${key ? '' : '-draft'}.mp4`);
  await render({ html, seconds, outFile, audio: mix });
  const mb = fs.statSync(outFile).size / 1048576;
  log(`${n}: ${seconds} s, ${mb.toFixed(1)} MB${key ? `, voice ${VOICE}` : ', DRAFT (no voice)'} -> ${outFile}`);
  if (mb > 15) { console.error(`[tour] ${outFile} is over 15 MB`); process.exitCode = 1; }
  ff(['-i', outFile, '-vf', 'fps=1/2,scale=180:-1,tile=8x5', '-frames:v', '1', path.join(TUT, `${n}-voice-sheet.png`)]);
}
