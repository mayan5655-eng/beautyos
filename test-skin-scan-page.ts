// The public skin-scan page redesign (2026-11-04): what the results view draws must come from the report, old and partial
// reports must still render, and every safeguard of the old page is still wired. lib/skinScanView.ts + app/skin-scan/page.jsx.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { zonesOf, levelOf, ingredientsOf, viewOfReport, refusalOf, INVALID_LINK_HE } from './lib/skinScanView.ts';

// ── zones: the fixed five places the prompt allows, matched with Hebrew prefixes, never inside another word ──
assert.deepEqual(zonesOf('נקבוביות מורחבות באף ובמצח'), ['forehead', 'nose']);
assert.deepEqual(zonesOf('אדמומיות קלה בלחיים'), ['cheeks']);
assert.deepEqual(zonesOf('כהות עדינה באזור העיניים'), ['eyes']);
assert.deepEqual(zonesOf('קווים עדינים בסנטר'), ['chin']);
assert.deepEqual(zonesOf('אפשר לשפר גוון אפור, אפילו מעט'), [], '"אף" is not found inside אפשר / אפור / אפילו');
assert.deepEqual(zonesOf('יובש כללי'), [], 'a concern naming no place gets no marker');
assert.deepEqual(zonesOf(undefined), []);

// ── severity: only the three words, only when present (old reports have no concern_levels) ──
assert.deepEqual(levelOf({ concern_levels: ['קל', 'בינוני', 'בולט'] }, 2), { label: 'בולט', value: 3 });
assert.equal(levelOf({ concern_levels: ['רמת ממצא 1'] }, 0), null, 'an echoed placeholder is not a level');
assert.equal(levelOf({ concern_levels: [7] }, 0), null, 'a number is not a level');
assert.equal(levelOf({ concern_levels: ['קל'] }, 1), null, 'a shorter list leaves the rest without a meter');
assert.equal(levelOf({}, 0), null, 'no field, no meter');
assert.equal(levelOf(null, 0), null);

// ── ingredient chips: only the Latin words already in the step ──
assert.deepEqual(ingredientsOf('סרום niacinamide 5% לאיזון'), ['niacinamide 5%']);
assert.deepEqual(ingredientsOf('קרם הגנה SPF 50'), ['SPF 50']);
assert.deepEqual(ingredientsOf('סרום hyaluronic acid'), ['hyaluronic acid']);
assert.deepEqual(ingredientsOf('ניקוי עדין'), [], 'a Hebrew-only step gets no chip');

// ── the whole view: a full current report, a legacy one, a partial one, garbage ──
const full = viewOfReport({
  valid: true, skin_type: 'עור מעורב', score: 74,
  concerns: ['נקבוביות מורחבות באף ובמצח', 'אדמומיות קלה בלחיים', 'כהות עדינה באזור העיניים'],
  concern_levels: ['בינוני', 'קל', 'קל'],
  clinical_treatment: 'פילינג אנזימטי', matched_service: 'טיפול פנים מעמיק',
  routine_morning: ['ניקוי', 'סרום niacinamide 5%', 'SPF 50'], routine_evening: ['ניקוי כפול', 'סרום', 'קרם'],
  summary: 'זו הערכה ראשונית, האבחון המלא בפגישה',
});
assert.equal(full.score, 74);
assert.equal(full.concerns.length, 3);
assert.equal(full.concerns[0].level?.label, 'בינוני');
assert.deepEqual(full.zoneMarks.map((z) => [z.key, z.n]), [['forehead', 1], ['nose', 1], ['cheeks', 2], ['eyes', 3]], 'each zone carries the number of the first concern naming it');

const legacy = viewOfReport({ skin_type: 'עור יבש', score: 60, concerns: ['יובש בלחיים'], therapist_notes: { protocol: 'x' }, clinic_plan: { sessions: '4' } });
assert.equal(legacy.concerns[0].level, null, 'a report from before concern_levels renders without a meter');
assert.deepEqual(legacy.concerns[0].zones, ['cheeks']);

const partial = viewOfReport({ skin_type: 'עור יבש', concerns: ['יובש כללי'] });
assert.equal(partial.score, null, 'no score: no ring, never a made-up number');
assert.deepEqual(partial.morning, []);
assert.equal(partial.treatment, '');
assert.equal(viewOfReport({ score: '' }).score, null);
assert.equal(viewOfReport({ score: 140 }).score, 100, 'clamped');
const junk = viewOfReport('not a report');
assert.equal(junk.concerns.length, 0);
assert.equal(viewOfReport({ concerns: 'x', routine_morning: [null, 3, ' a '] }).morning.join(), 'a', 'non-strings dropped, never thrown on');

// ── refusals keep the route's own flags ──
assert.equal(refusalOf({ success: false, quotaExceeded: true, error: 'x' }), 'quota');
assert.equal(refusalOf({ success: false, scannerUnavailable: true }), 'unavailable');
assert.equal(refusalOf({ success: false, code: 'business_paused' }), 'paused');
assert.equal(refusalOf({ success: false, error: INVALID_LINK_HE }), 'link');
assert.equal(refusalOf({ success: false, error: 'לא זוהו פנים ברורות בתמונה.' }), null, 'a bad photo is retried on the capture card');

// ── the page keeps every safeguard ──
const page = fs.readFileSync('app/skin-scan/page.jsx', 'utf8');
const code = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
assert.ok(page.includes('params.get("t")') && page.includes('params.get("s")'), 'the signed link (t, s)');
assert.ok(page.includes('body: JSON.stringify({ image: imageData, mediaType, tenantId, s: scanSig })'), 'the scan call sends the signature');
assert.ok(page.includes('const gateOk = isAdult && photoConsent;'), 'adult + consent gate');
assert.ok(page.includes('onClick={gateOk ? a.onPick : pickBlocked}') && page.includes('preview && gateOk &&'), 'pickers and analyse refuse until both are ticked');
assert.ok(page.includes('body: JSON.stringify({ report, reportToken, clientName: clientName.trim(), clientPhone: clientPhone.trim(), tenantId })'), '/send gets the signed report');
assert.ok(page.includes('if (sending || sent) return;'), 'duplicate-send guard');
assert.ok(page.includes('setSentQueued(!!data.queued)') && page.includes('הדוח ממתין לשליחה'), 'queued is said as queued, never as sent');
assert.ok(page.includes('"/api/skin-scan/lead"') && page.includes('keepalive: true'), 'booking-intent lead');
assert.ok(page.includes('leftRef') && page.includes('rightRef') && page.includes('(רשות)'), 'optional left / right profiles');
assert.ok(page.includes('fetchPublicBranding(supabase, tenantId)') && page.includes('accentStyle(accent)'), 'clinic branding with fallbacks');
assert.ok(page.includes('{INVALID_LINK_HE}') && page.includes('refusalOf(data)'), 'link error and refusal states');
assert.ok(page.includes('אינה מחליפה ייעוץ או אבחון מקצועי'), 'the not-a-diagnosis line stays at the top of the results');
assert.ok(page.includes('showPro ? "הסתרת החלק המקצועי" : "חלק מקצועי למטפלת"') && page.includes('report.therapist_notes &&'), 'therapist section behind its toggle, legacy notes still shown');
assert.ok(page.includes('prefers-reduced-motion: reduce'), 'reduced motion turns the scan off');
assert.ok(/Math\.min\(s \+ 1, SCAN_STEPS\.length - 1\)/.test(page), 'the wait advances and holds on the last step instead of looping');
assert.ok(page.includes('mode="scan"') && page.includes('src={preview}'), 'the scan runs over her own photo');
assert.ok(!/<img[^>]+src="(?:https?:|\/)/.test(page), 'no stock or generated faces: the only image sources are her photo and her logo');
assert.ok(!/[–—]/.test(code), 'no en or em dashes in product copy');
assert.ok(!/color: "var\(--pc[,)]/.test(code) && !/color: ACCENT[,} ]/.test(code), 'her accent is drawn as text only through --pc-text');

// ── the route: concern_levels is additive and the existing wording is kept ──
const route = fs.readFileSync('app/api/skin-scan/route.js', 'utf8');
const prompt = route.slice(route.indexOf('const systemPrompt'), route.indexOf('היי הוגנת ומעודדת'));
assert.ok(prompt.includes('"concern_levels"') && prompt.includes('קל, בינוני או בולט'), 'the prompt asks for a level per concern');
assert.ok(prompt.includes('אל תאבחני מצבים רפואיים. הערכה קוסמטית בלבד.'), 'the medical wording is unchanged');

console.log('skin-scan page: ok');
