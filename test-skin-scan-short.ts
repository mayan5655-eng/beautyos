// The skin-scan report must stay SHORT. 2026-10-08: a real scan hit max_tokens (3000) mid-JSON and returned a parse error, because the
// prompt asked for clinic / home / therapist blocks. These pin the shape that fits: short fields, a margin, a fixed closing line,
// and no raw error text shown to her.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hasForeignScript } from './lib/skinScanGuard.ts';

const src = fs.readFileSync('app/api/skin-scan/route.js', 'utf8');
const prompt = src.slice(src.indexOf('const systemPrompt'), src.indexOf('היי הוגנת ומעודדת'));

const max = Number(/max_tokens:\s*(\d+)/.exec(src)?.[1]);
assert.ok(max >= 800 && max <= 1500, `max_tokens is a margin over a short report, not the old 3000 (got ${max})`);
for (const gone of ['clinic_plan', 'home_plan', 'therapist_notes']) assert.ok(!prompt.includes(gone), `the prompt no longer asks for ${gone}`);
for (const kept of ['"skin_type"', '"concerns"', '"clinical_treatment"', '"routine_morning"', '"routine_evening"', '"matched_service"']) assert.ok(prompt.includes(kept), `the prompt still asks for ${kept}`);
assert.ok(prompt.includes('בדיוק 3 ממצאים') && prompt.includes('בדיוק 3 שלבים'), '3 findings, 3 steps morning, 3 evening');
assert.ok(src.includes('const SCAN_CLOSING = "זו הערכה ראשונית, האבחון המלא בפגישה"') && src.includes('report.summary = SCAN_CLOSING'), 'the closing line is ours, fixed');
assert.ok(!/error:\s*err\.message\s*\}/.test(src), 'no raw err.message goes to her');
assert.ok(src.includes('משהו השתבש בסריקה'), 'a friendly Hebrew line when something unexpected fails');
assert.ok(src.includes('הניתוח לא הושלם הפעם'), 'and when the answer is cut off anyway');

// ── Arabic-script letters in a Hebrew report (2026-10-08: "נياצינמיד"): refused by the prompt, caught by the server, asked again once ──
assert.ok(prompt.includes('בלי אותיות ערביות') && prompt.includes('niacinamide'), 'the prompt says Hebrew letters, Latin for ingredient names, nothing else');
assert.equal(hasForeignScript('נياצינמיד'), true, 'Arabic letters inside a Hebrew word are caught');
assert.equal(hasForeignScript({ routine_morning: ['ניקוי עדין', 'טוניק עם نیاسینامید'] }), true, '...anywhere in the report, nested');
assert.equal(hasForeignScript({ concerns: ['נקבוביות גלויות'], routine_evening: ['סרום niacinamide 5%', 'SPF 30'] }), false, 'Hebrew with Latin ingredient names is clean');
assert.equal(hasForeignScript(null), false); assert.equal(hasForeignScript(72), false);
assert.ok(src.includes('attempt < 2') && src.includes('hasForeignScript(report)'), 'the server asks again, once');
assert.ok(src.slice(src.indexOf('if (!report)')).slice(0, 220).includes('הניתוח לא הושלם הפעם'), 'and if it is still garbled she gets the friendly line, not the garbled report');

console.log('skin-scan short: ok');
