// Onboarding never promises legal receipts: Kalmea issues "אישור תשלום"; a legal
// receipt comes only from her own provider (Morning), connected later. (2026-10-23 pass, B2.)
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src = fs.readFileSync(new URL('./app/onboarding/page.tsx', import.meta.url), 'utf8');
assert.ok(!src.includes('להפיק לך קבלות חוקיות'), 'no "we will issue legal receipts" promise');
assert.ok(!src.includes('איזו קבלה חוקית תצא'), 'no "which legal receipt goes out" promise');
assert.ok(src.includes('המערכת מפיקה &quot;אישור תשלום&quot; בלבד'), 'the honest note stays');
assert.ok(src.includes('הגדרות ← חיבורים'), 'points at the group where Morning is connected');
console.log('test-onboarding-receipt-copy: ok');
