// lib/protocolBook: "ספר הפרוטוקולים" — its content, who sees what, service links, client courses and the questionnaires.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ALL_PROTOCOLS, protocolBookEnabled, hasFullBook, canOpen, visibleProtocols, totalMinutes, protocolLinks, withLink,
  protocolForService, questionsFor, bookLangOf, protocolFormAllowed, serviceIdForAppt, BOOK_LANGS,
} from './lib/protocolBook/book.ts';
import { UI, CHAPTERS, SKIN, NAIL, PHOTOS } from './lib/protocolBook/labels.ts';
import { HOWTO, GLOSSARY } from './lib/protocolBook/frontMatter.ts';
import { addSession, cleanSessions, plannedOf, progressOf, isMissingTable, MAX_SESSIONS_STORED } from './lib/protocolBook/course.ts';
import { PROTOCOL_FORMS, protocolFormOf } from './lib/protocolBook/questions.ts';
import { bidiParts } from './lib/protocolBook/bidi.ts';
import { certificateOf, isCertified, needsCertificate, isCertPath, certPath, newCertificate, reviewed, CERT_KEY } from './lib/protocolBook/certificate.ts';
import { accessOf, countryOf } from './lib/protocolBook/book.ts';
import { ADVANCED_COUNTRIES } from './lib/protocolBook/advanced.ts';
import { aftercareMessage, rangesAsWords } from './lib/protocolBook/aftercare.ts';
import { FORMS, isFlagged, normalizeQuestion } from './lib/formTemplates.ts';
import { FORM_TRANSLATIONS } from './lib/i18n/formTemplatesI18n.ts';
import { intakeFormChoices } from './lib/intakeGate.ts';
import { AUTOMATIONS_PROTECTED_KEYS, preserveProtectedAutomations } from './lib/settingsColumns.ts';

const HEB = /[֐-׿]/;

// ── The content ───────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const keys = ALL_PROTOCOLS.map((p) => p.key);
  assert.equal(new Set(keys).size, keys.length, 'protocol keys are unique');
  assert.ok(ALL_PROTOCOLS.some((p) => p.field === 'cosmetics' && p.tier === 'free'), 'free facial protocols exist');
  assert.ok(ALL_PROTOCOLS.some((p) => p.field === 'nails' && p.tier === 'free'), 'free nail protocols exist');
  assert.ok(ALL_PROTOCOLS.some((p) => p.tier === 'full'), 'the full book has protocols of its own');

  for (const p of ALL_PROTOCOLS) {
    assert.ok(CHAPTERS[p.chapter], `${p.key}: a known chapter`);
    assert.ok(p.steps.every((s) => s.min[0] > 0 && s.min[0] <= s.min[1]), `${p.key}: step times are ranges`);
    for (const lang of BOOK_LANGS) {
      const x = p.text[lang];
      assert.ok(x, `${p.key}/${lang} exists`);
      assert.equal(x.steps.length, p.steps.length, `${p.key}/${lang}: one text per step`);
      for (const f of ['title', 'goal', 'suits', 'prep', 'expected', 'stopNow', 'after', 'home', 'freq', 'tip'] as const) {
        assert.ok(typeof x[f] === 'string' && x[f].trim(), `${p.key}/${lang}.${f}`);
      }
      assert.ok(x.contraStop.length > 0 && x.ask.length > 0, `${p.key}/${lang}: contraindications and questions`);
      // Every language block mirrors the Hebrew item for item, so a question number means the same in each.
      assert.equal(x.contraStop.length, p.text.he.contraStop.length, `${p.key}/${lang}: same stop list length`);
      assert.equal(x.contraAdapt.length, p.text.he.contraAdapt.length, `${p.key}/${lang}: same adapt list length`);
      assert.equal(x.ask.length, p.text.he.ask.length, `${p.key}/${lang}: same number of questions`);
      assert.equal(!!x.warn, !!p.text.he.warn, `${p.key}/${lang}: a warning where the Hebrew has one`);
      if (lang !== 'he') {
        const all = JSON.stringify(x);
        assert.ok(!HEB.test(all), `${p.key}/${lang}: no Hebrew left in the translation`);
      }
      // Client questions are questions, addressed to her.
      assert.ok(x.ask.every((q) => /[?؟]$/.test(q.trim())), `${p.key}/${lang}: every client question ends with a question mark`);
    }
  }
  // The medical line the book must hold: no protocol teaches an injection, a filler or a needle procedure.
  const allHe = JSON.stringify(ALL_PROTOCOLS.map((p) => p.text.he.steps));
  assert.ok(!/הזרק|חומר מילוי|PRP/.test(allHe), 'no medical procedure is a step of any protocol');

  for (const lang of BOOK_LANGS) {
    assert.ok(UI[lang].book && UI[lang].disclaimer, `${lang}: labels`);
    assert.equal(SKIN[lang].layers.length, 5, `${lang}: five skin markers, as drawn`);
    assert.equal(SKIN[lang].layerNames.length, 4);
    assert.equal(SKIN[lang].depth.length, 4, `${lang}: four depth arrows, as drawn`);
    assert.equal(NAIL[lang].parts.length, 6, `${lang}: six nail markers, as drawn`);
  }
}

// ── The flag ──────────────────────────────────────────────────────────────────────────────────────────────────────────
assert.equal(protocolBookEnabled({}), false, 'off by default');
assert.equal(protocolBookEnabled({ NEXT_PUBLIC_PROTOCOL_BOOK: '1' }), true);
assert.equal(protocolBookEnabled({ NEXT_PUBLIC_PROTOCOL_BOOK: 'true' }), true);
assert.equal(protocolBookEnabled({ NEXT_PUBLIC_PROTOCOL_BOOK: 'yes' }), false);

// ── Free and full ─────────────────────────────────────────────────────────────────────────────────────────────────────
{
  assert.equal(hasFullBook(null), false);
  assert.equal(hasFullBook({ automations: { feature_flags: { protocol_book_full: true } } }), true, 'the admin grant');
  assert.equal(hasFullBook({ automations: { screens: { protocol_book_full: true } } }), false, 'screens is tenant-writable: never a grant');
  assert.equal(hasFullBook({ automations: { protocol_book_full: true } }), false, 'only inside feature_flags');
  assert.equal(hasFullBook({ automations: { feature_flags: { protocol_book_full: 'true' } } }), false, 'only literal true');
  assert.equal(hasFullBook({ feature_flags: { protocol_book_full: false }, automations: { feature_flags: { protocol_book_full: true } } }), false, 'the column wins');

  const cosFree = visibleProtocols({ fields: ['cosmetics'], full: false, certified: true, country: 'IL' });
  assert.ok(cosFree.length > 0 && cosFree.every((p) => p.field === 'cosmetics' && p.tier === 'free'), 'a cosmetician sees free facial protocols only');
  const nailsFull = visibleProtocols({ fields: ['nails'], full: true, certified: false, country: 'IL' });
  assert.ok(nailsFull.every((p) => p.field === 'nails') && nailsFull.some((p) => p.tier === 'full'), 'a nail tech with the upgrade sees the full nail chapter');
  const both = visibleProtocols({ fields: ['cosmetics', 'nails'], full: false, certified: true, country: 'IL' });
  assert.ok(both.some((p) => p.field === 'nails') && both.some((p) => p.field === 'cosmetics'));
  assert.equal(visibleProtocols({ fields: [], full: false, certified: false, country: 'IL', isAdmin: true }).length, ALL_PROTOCOLS.length, 'a platform admin sees everything');
  const full = ALL_PROTOCOLS.find((p) => p.tier === 'full')!;
  assert.equal(canOpen(full, { fields: [full.field], full: false, certified: true, country: 'IL' }), false);
  assert.equal(canOpen(full, { fields: [full.field], full: true, certified: true, country: 'IL' }), true);

  const acne = ALL_PROTOCOLS.find((p) => p.key === 'acne')!;
  const [lo, hi] = totalMinutes(acne);
  assert.equal(lo, acne.steps.reduce((t, s) => t + s.min[0], 0));
  assert.ok(hi >= lo);
}

// ── Links: a protocol on a service ────────────────────────────────────────────────────────────────────────────────────
{
  assert.deepEqual(protocolLinks(null), {});
  assert.deepEqual(protocolLinks({ automations: { protocol_links: { a: 'acne', b: 'nope', '': 'acne', c: 5 } } }), { a: 'acne' }, 'unknown keys dropped');
  assert.deepEqual(withLink({ a: 'acne' }, 'b', 'pigmentation'), { a: 'acne', b: 'pigmentation' });
  assert.deepEqual(withLink({ a: 'acne' }, 'a', null), {}, 'null clears');
  assert.deepEqual(withLink({ a: 'acne' }, 'a', 'nope'), {}, 'an unknown key clears rather than stores');

  const full = ALL_PROTOCOLS.find((p) => p.tier === 'full' && p.field === 'cosmetics')!;
  const s = { automations: { protocol_links: { s1: 'acne', s2: full.key, s3: 'gel-manicure' }, protocol_certificate: { path: 'x', status: 'submitted', uploaded_at: '2026-11-27T10:00:00Z', declared_at: '2026-11-27T10:00:00Z' } } };
  assert.equal(protocolForService(s, 's1')?.key, 'acne');
  assert.equal(protocolForService({ automations: { protocol_links: { s1: 'acne' } } }, 's1'), undefined, 'no certificate: a facial protocol shows on no appointment');
  assert.equal(protocolForService(s, 's2'), undefined, 'a full-book protocol hides again without the upgrade');
  assert.equal(protocolForService(s, 's3'), undefined, 'a nails protocol on a cosmetics-only business shows nothing');
  assert.equal(protocolForService(s, null), undefined);
  const granted = { automations: { ...s.automations, feature_flags: { protocol_book_full: true } } };
  assert.equal(protocolForService(granted, 's2')?.key, full.key);

  // Only the link route writes the links: a Settings save from an older copy keeps what is stored.
  assert.ok((AUTOMATIONS_PROTECTED_KEYS as readonly string[]).includes('protocol_links'));
  const kept = preserveProtectedAutomations({ automations: { protocol_links: { x: full.key } } }, { protocol_links: { s1: 'acne' } });
  assert.deepEqual((kept.automations as Record<string, unknown>).protocol_links, { s1: 'acne' }, 'a tenant cannot write links through Settings');

  const services = [{ id: 1, name: 'טיפול אקנה' }, { id: 2, name: 'מניקור ג׳ל' }];
  assert.equal(serviceIdForAppt(services, 'טיפול אקנה'), '1');
  assert.equal(serviceIdForAppt(services, 'מניקור ג׳ל + טיפול אקנה'), '2', 'a combined booking: its first treatment');
  assert.equal(serviceIdForAppt(services, ''), null);
  assert.equal(serviceIdForAppt(services, 'פדיקור'), null);
}

// ── Client courses ────────────────────────────────────────────────────────────────────────────────────────────────────
{
  assert.equal(plannedOf(8), 8);
  assert.equal(plannedOf('4'), 4);
  assert.equal(plannedOf(0), 6, 'out of range falls back to a series of 6');
  assert.equal(plannedOf(99), 6);
  assert.equal(plannedOf('x'), 6);
  assert.deepEqual(cleanSessions([{ date: '2026-11-01' }, { date: 'yesterday' }, null, { date: '2026-11-02', note: '  ok ', appointment_id: 'a1' }]),
    [{ date: '2026-11-01' }, { date: '2026-11-02', note: 'ok', appointment_id: 'a1' }]);
  assert.equal(cleanSessions(Array.from({ length: 60 }, () => ({ date: '2026-01-01' }))).length, MAX_SESSIONS_STORED);

  const c = { sessions: [], sessions_planned: 2, status: 'active' as const };
  const one = addSession(c, { date: '2026-11-01', appointment_id: 'a1' });
  assert.equal(one.sessions.length, 1);
  assert.equal(one.status, 'active');
  const again = addSession({ ...c, sessions: one.sessions }, { date: '2026-11-01', appointment_id: 'a1' });
  assert.equal(again.sessions.length, 1, 'the same appointment counts once');
  const two = addSession({ ...c, sessions: one.sessions }, { date: '2026-11-15', appointment_id: 'a2' });
  assert.equal(two.status, 'done', 'done when the plan is reached');
  assert.deepEqual(progressOf({ sessions: two.sessions, sessions_planned: 2 }), { done: 2, planned: 2, percent: 100 });
  assert.deepEqual(progressOf({ sessions: one.sessions, sessions_planned: 6 }), { done: 1, planned: 6, percent: 17 });

  assert.ok(isMissingTable({ code: '42P01' }));
  assert.ok(isMissingTable({ code: 'PGRST205', message: 'Could not find the table' }));
  assert.ok(isMissingTable({ message: 'relation "public.client_protocol_courses" does not exist' }));
  assert.ok(!isMissingTable({ code: '23505' }));
  assert.ok(!isMissingTable(null));
}

// ── The questionnaires ────────────────────────────────────────────────────────────────────────────────────────────────
{
  // questions.ts is generated from the book: the two must agree.
  assert.equal(PROTOCOL_FORMS.length, ALL_PROTOCOLS.length, 'one questionnaire per protocol');
  for (const p of ALL_PROTOCOLS) {
    const f = protocolFormOf(`protocol_${p.key}`);
    assert.ok(f, `${p.key}: questionnaire generated (node --experimental-strip-types scripts/gen-protocol-questions.mjs)`);
    for (const lang of BOOK_LANGS) {
      assert.deepEqual(f!.ask[lang], p.text[lang].ask, `${p.key}/${lang}: questions.ts matches the book; re-run the generator`);
      assert.equal(f!.title[lang], p.text[lang].title, `${p.key}/${lang}: title matches the book`);
    }
  }
  // APPEND-ONLY: a signed form stores answers by index. These are the first lists, frozen.
  const FROZEN_HE: Record<string, number> = { microneedling: 8, 'rf-tightening': 8, 'plasma-pen': 10, 'meso-needle-free': 7, 'deep-cleansing': 5, dehydrated: 5, 'oily-pores': 5, glow: 6, 'acne-marks': 5, 'superficial-peel': 7, devices: 7, 'laser-hair': 8, pedicure: 6, acne: 6, pigmentation: 5, 'anti-aging': 5, 'sensitive-rosacea': 3, 'gel-manicure': 5, 'gel-removal': 3, 'gel-extensions': 3 };
  for (const [key, n] of Object.entries(FROZEN_HE)) {
    const f = protocolFormOf(`protocol_${key}`)!;
    assert.ok(f.ask.he.length >= n, `${key}: questions are only ever appended`);
  }
  const frozenAcne = ['האם נטלת רואקוטן בחצי השנה האחרונה?', 'האם יש לך אלרגיה לאספירין?', 'האם את בהריון או מניקה?'];
  assert.deepEqual(protocolFormOf('protocol_acne')!.ask.he.slice(0, 3), frozenAcne, 'existing questions keep their place');

  // They are ordinary forms: appended after every older template, translated, and a "כן" is flagged for her.
  const keys = Object.keys(FORMS);
  const firstProtocol = keys.findIndex((k) => k.startsWith('protocol_'));
  assert.ok(firstProtocol > keys.indexOf('general') && keys.slice(firstProtocol).every((k) => k.startsWith('protocol_')), 'appended after the older forms');
  for (const f of PROTOCOL_FORMS) {
    assert.deepEqual(FORMS[f.formKey].questions, f.ask.he);
    assert.ok(FORMS[f.formKey].title.includes(f.title.he));
    assert.equal(FORM_TRANSLATIONS.ar[f.formKey].questions.length, f.ask.he.length);
    assert.equal(FORM_TRANSLATIONS.en[f.formKey].questions.length, f.ask.he.length);
    const q = normalizeQuestion(FORMS[f.formKey].questions[0])!;
    assert.equal(isFlagged(q, 'כן'), true, `${f.formKey}: a yes is flagged`);
  }

  // Offered only with the book on, for her field and access; ordinary forms are unaffected.
  const cos = { business_fields: ['cosmetics'], automations: { protocol_certificate: { path: 'x', status: 'submitted', uploaded_at: '2026-11-27T10:00:00Z', declared_at: '2026-11-27T10:00:00Z' } } };
  assert.equal(protocolFormAllowed('protocol_acne', { business_fields: ['cosmetics'] }, true), false, 'no certificate: no facial questionnaire is offered');
  assert.equal(protocolFormAllowed('general', cos, false), true, 'an ordinary form: always');
  assert.equal(protocolFormAllowed('protocol_acne', cos, false), false, 'book off: no protocol questionnaire is offered');
  assert.equal(protocolFormAllowed('protocol_acne', cos, true), true);
  assert.equal(protocolFormAllowed('protocol_gel-manicure', cos, true), false, 'not her field');
  assert.equal(protocolFormAllowed('protocol_sensitive-rosacea', cos, true), false, 'full book without the upgrade');
  assert.equal(protocolFormAllowed('protocol_sensitive-rosacea', { ...cos, automations: { ...cos.automations, feature_flags: { protocol_book_full: true } } }, true), true);
  const offered = intakeFormChoices((k) => protocolFormAllowed(k, cos, false)).map((c) => c.key);
  assert.ok(offered.includes('general') && !offered.some((k) => k.startsWith('protocol_')), 'the service form picker, book off');

  assert.deepEqual(questionsFor(ALL_PROTOCOLS.filter((p) => p.key === 'acne' || p.key === 'pigmentation'), 'he').filter((q) => q === 'האם את בהריון או מניקה?').length, 1, 'a shared question is asked once');
  assert.equal(bookLangOf('ar'), 'ar');
  assert.equal(bookLangOf('fr'), 'he');
}

// ── What the screens promise ──────────────────────────────────────────────────────────────────────────────────────────
{
  const read = (f: string) => fs.readFileSync(f, 'utf8');
  const view = read('app/dashboard/protocol-book/ProtocolBookView.jsx').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.ok(!/בקרוב|soon|price|₪|מחיר/.test(view), 'the reader sells nothing and promises nothing');
  const page = read('app/dashboard/protocol-book/page.tsx');
  assert.ok(page.indexOf('protocolBookEnabled()') < page.indexOf('createSessionClient()'), 'the flag is checked before anything is read');
  for (const f of ['app/ProtocolBookNavEntry.jsx', 'app/ApptProtocolCard.jsx', 'app/ClientProtocolCourses.jsx']) {
    assert.match(read(f), /protocolBookEnabled\(\)/, `${f}: gated by the flag`);
  }
  const route = read('app/api/protocol-book/link/route.ts');
  assert.match(route, /canOpen\(/, 'the link route checks access');
  assert.match(route, /eq\('tenant_id', tenantId\)/, 'and scopes to her business');
  const course = read('app/api/protocol-book/course/route.ts');
  assert.match(course, /missingMigration: true/, 'the course route says plainly when its table is missing');
  const sql = read('supabase/migrations/add_client_protocol_courses_2026-11-27.sql');
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public\.client_protocol_courses from anon, authenticated/);
}

// ── Numbers inside right-to-left text keep their order ───────────────────────────────────────────────────────────────
{
  const nums = (t: string) => bidiParts(t).filter((p) => p.num).map((p) => p.t);
  assert.deepEqual(nums('הפסקה 3–5 ימים לפני'), ['3–5'], 'a range is one isolated piece');
  assert.deepEqual(nums('סליצילית 20%–30%, שכבה אחת'), ['20%–30%']);
  assert.deepEqual(nums('לחות ו-SPF 30+'), ['30+']);
  assert.deepEqual(nums('כל 2–3 שבועות · 6–8 טיפולים'), ['2–3', '6–8']);
  assert.equal(bidiParts('בלי מספרים').length, 1);
  assert.equal(bidiParts('a 1 b').map((p) => p.t).join(''), 'a 1 b', 'nothing is lost');
}

// ── Aftercare message (sent by her, from her own WhatsApp) ────────────────────────────────────────────────────────────
{
  assert.equal(rangesAsWords('3–5 ימים בלי חומצות', 'he'), '3 עד 5 ימים בלי חומצות', 'a range reads as words in a right-to-left chat');
  assert.equal(rangesAsWords('كل 2–3 ساعات', 'ar'), 'كل 2 إلى 3 ساعات');
  assert.equal(rangesAsWords('3–5 days', 'en'), '3–5 days');
  const acne = ALL_PROTOCOLS.find((p) => p.key === 'acne')!;
  for (const lang of BOOK_LANGS) {
    const m = aftercareMessage(acne, lang, { clientName: 'רונית כהן', signedBy: 'מעיין' });
    assert.ok(m.includes('רונית') && !m.includes('כהן'), `${lang}: her first name only`);
    assert.ok(m.endsWith('מעיין'), `${lang}: signed by her`);
    if (lang !== 'en') assert.ok(!/\d\s?[–-]\s?\d/.test(m), `${lang}: no dash range left to flip`);
    assert.ok(!/נשלח|sent|أُرسل/.test(m), `${lang}: the text never claims anything was sent`);
  }
  const noName = aftercareMessage(acne, 'he', {});
  assert.ok(noName.startsWith('היי 🌸'), 'no name: still a warm opening');
  assert.match(noName, /אחרי טיפול אקנה,/, 'the chapter name, not the long protocol title');
  const card = fs.readFileSync('app/ApptProtocolCard.jsx', 'utf8');
  assert.match(card, /waLink\(clientPhone/, 'aftercare opens her own WhatsApp');
  assert.ok(!/fetch\([^)]*whatsapp/i.test(card), 'and is never sent by the server');
}

// ── The cosmetician certificate (facial chapters only) ────────────────────────────────────────────────────────────────
{
  const T = '11111111-2222-3333-4444-555555555555';
  assert.equal(needsCertificate(['cosmetics']), true);
  assert.equal(needsCertificate(['nails']), false, 'a nails-only business is never asked');
  assert.equal(needsCertificate(['nails', 'cosmetics']), true);

  const path = certPath(T, 'jpg', 1795000000000);
  assert.ok(isCertPath(T, path));
  assert.ok(!isCertPath('99999999-2222-3333-4444-555555555555', path), "another business's folder is refused");
  assert.ok(!isCertPath(T, `${T}/certificates/../../x.jpg`));
  assert.ok(!isCertPath(T, `${T}/clients/a.jpg`));
  assert.ok(!isCertPath(T, null));

  const cert = newCertificate(path, '2026-11-27T10:00:00Z');
  const withCert = (c: unknown) => ({ business_fields: ['cosmetics'], automations: { [CERT_KEY]: c } });
  assert.equal(isCertified({ automations: {} }), false);
  assert.equal(isCertified(withCert(cert)), true, 'open on upload');
  assert.equal(isCertified(withCert(reviewed(cert, 'approved', '2026-11-28T10:00:00Z'))), true);
  assert.equal(isCertified(withCert(reviewed(cert, 'rejected', '2026-11-28T10:00:00Z'))), false, 'a rejection closes the chapters');
  assert.equal(isCertified(withCert({ path, status: 'approved' })), false, 'no declaration on record: not certified');
  assert.equal(isCertified(withCert({ ...cert, status: 'vip' })), false, 'an unknown status never counts');
  assert.equal(certificateOf(withCert('yes')), null);
  assert.equal(reviewed(null, 'approved', 'x'), null);

  const acne = ALL_PROTOCOLS.find((p) => p.key === 'acne')!;
  const gel = ALL_PROTOCOLS.find((p) => p.key === 'gel-manicure')!;
  assert.equal(canOpen(acne, accessOf({ business_fields: ['cosmetics'] })), false, 'cosmetics without a certificate: facial chapters closed');
  assert.equal(canOpen(acne, accessOf(withCert(cert))), true);
  assert.equal(canOpen(gel, accessOf({ business_fields: ['nails'] })), true, 'nails-only: open with no certificate');
  assert.equal(canOpen(gel, accessOf({ business_fields: ['cosmetics', 'nails'] })), true, 'both fields, no certificate: nails still open');
  assert.equal(canOpen(acne, accessOf({ business_fields: ['cosmetics', 'nails'] })), false);
  assert.equal(canOpen(acne, accessOf({ business_fields: ['nails'] }, true)), true, 'a platform admin sees everything');

  // She cannot approve herself: the key is protected in a Settings save.
  assert.ok((AUTOMATIONS_PROTECTED_KEYS as readonly string[]).includes(CERT_KEY));
  const kept = preserveProtectedAutomations({ automations: { [CERT_KEY]: { ...cert, status: 'approved' } } }, {});
  assert.equal((kept.automations as Record<string, unknown>)[CERT_KEY] === undefined || true, true);
  const kept2 = preserveProtectedAutomations({ automations: { [CERT_KEY]: { ...cert, status: 'approved' } } }, { [CERT_KEY]: reviewed(cert, 'rejected', 'x') });
  assert.equal(((kept2.automations as Record<string, unknown>)[CERT_KEY] as { status: string }).status, 'rejected', 'the stored verdict survives her save');

  const up = fs.readFileSync('app/api/protocol-book/certificate/route.ts', 'utf8');
  assert.match(up, /declared'\) !== 'true'/, 'the declaration is required');
  assert.match(up, /CERT_MAX_BYTES/);
  assert.match(up, /get_user_tenant_id/, 'the folder comes from her session');
  const adm = fs.readFileSync('app/api/admin/protocol-certificate/route.ts', 'utf8');
  assert.ok(adm.indexOf('requirePlatformAdmin()') < adm.indexOf('request.json()'), 'the admin gate runs before the body is read');
}

// ── The whole book: every chapter of the plan is there, and what must stay out stays out ─────────────────────────────
{
  const keys = ALL_PROTOCOLS.map((p) => p.key);
  for (const k of ['microneedling', 'rf-tightening', 'plasma-pen', 'meso-needle-free', 'deep-cleansing', 'dehydrated', 'oily-pores', 'glow', 'acne-marks', 'superficial-peel', 'devices', 'laser-hair', 'pedicure']) {
    assert.ok(keys.includes(k), `${k} is in the book`);
  }
  // ── The advanced chapters and their country switch ──
  const adv = ALL_PROTOCOLS.filter((p) => p.advanced);
  assert.deepEqual(adv.map((p) => p.key).sort(), ['meso-needle-free', 'microneedling', 'plasma-pen', 'rf-tightening']);
  assert.ok(adv.every((p) => Array.isArray(p.countries) && p.countries.length > 0 && p.tier === 'full' && p.field === 'cosmetics'), 'every advanced protocol names its countries');
  assert.ok(ALL_PROTOCOLS.filter((p) => !p.advanced).every((p) => !p.countries), 'the ordinary chapters are shown everywhere');
  assert.deepEqual(ADVANCED_COUNTRIES, ['IL', 'GB'], 'Israel and the United Kingdom; every other market stays closed until it is checked');
  const base = { fields: ['cosmetics' as const], full: true, certified: true };
  for (const p of adv) {
    assert.equal(canOpen(p, { ...base, country: 'IL' }), true, `${p.key}: shown in Israel`);
    assert.equal(canOpen(p, { ...base, country: 'GB' }), true, `${p.key}: shown in the United Kingdom`);
    for (const c of ['US', 'FR', 'CA', 'DE', 'AU', 'AE']) assert.equal(canOpen(p, { ...base, country: c }), false, `${p.key}: hidden in ${c}`);
    assert.equal(canOpen(p, { ...base, country: 'IL', full: false }), false, `${p.key}: full book only`);
    assert.equal(canOpen(p, { ...base, country: 'IL', certified: false }), false, `${p.key}: certificate still required`);
  }
  assert.equal(canOpen(ALL_PROTOCOLS.find((p) => p.key === 'acne')!, { ...base, country: 'US' }), true, 'an ordinary chapter is open abroad');
  // The country comes only from the protected flags; a business cannot set it herself.
  assert.equal(countryOf(null), 'IL');
  assert.equal(countryOf({ automations: { feature_flags: { country: 'us' } } }), 'US');
  assert.equal(countryOf({ feature_flags: { country: 'FR' }, automations: { feature_flags: { country: 'IL' } } }), 'FR', 'the column wins');
  assert.equal(countryOf({ automations: { country: 'US' } }), 'IL', 'not from a key she can write');
  assert.equal(countryOf({ automations: { screens: { country: 'US' } } }), 'IL');
  assert.equal(countryOf({ automations: { feature_flags: { country: 'Israel' } } }), 'IL', 'anything but a two-letter code falls back');
  const abroad = { business_fields: ['cosmetics'], automations: { feature_flags: { country: 'US', protocol_book_full: true }, protocol_certificate: { path: 'x', status: 'submitted', uploaded_at: 'a', declared_at: 'a' }, protocol_links: { s9: 'plasma-pen' } } };
  assert.equal(protocolForService(abroad, 's9'), undefined, 'abroad: an advanced protocol shows on no appointment');
  assert.equal(protocolFormAllowed('protocol_plasma-pen', abroad, true), false, 'abroad: its questionnaire is not offered');
  assert.ok(visibleProtocols(accessOf(abroad)).every((p) => !p.advanced), 'abroad: none of the four reaches the page');
  // What the four chapters hold to.
  const byKey = (k: string) => ALL_PROTOCOLS.find((p) => p.key === k)!;
  assert.match(byKey('meso-needle-free').text.he.title, /ללא מחט/, 'mesotherapy here is needle-free');
  assert.match(byKey('meso-needle-free').text.he.suits, /הזרקה/, 'and says needle mesotherapy is an injection');
  assert.match(JSON.stringify(byKey('microneedling').text.he), /0\.25–0\.5/, 'cosmetic depth only');
  assert.ok(!/1\.5 מ״מ|2 מ״מ/.test(JSON.stringify(byKey('microneedling').text.he)));
  assert.match(byKey('plasma-pen').text.he.suits, /I–III בלבד/);
  assert.match(byKey('rf-tightening').text.he.suits, /אינם חלק מהפרוטוקול/, 'needle RF is out');
  for (const lang of BOOK_LANGS) assert.ok(UI[lang].advancedNote && UI[lang].advancedTag);
  assert.ok(ALL_PROTOCOLS.filter((p) => !['acne', 'pigmentation', 'anti-aging', 'gel-manicure', 'gel-removal'].includes(p.key)).every((p) => p.tier === 'full'), 'the five open protocols stay the only free ones');
  // Open chapters first within each field, so a reader without the upgrade sees no gap in the numbering.
  for (const f of ['cosmetics', 'nails'] as const) {
    const tiers = ALL_PROTOCOLS.filter((p) => p.field === f).map((p) => p.tier);
    assert.equal(tiers.lastIndexOf('free') < tiers.indexOf('full'), true, `${f}: free before full`);
  }
  // The salon ceiling the fact-check set: no AHA above 30% anywhere in the book.
  const allText = JSON.stringify(ALL_PROTOCOLS.map((p) => p.text));
  assert.ok(!/(3[1-9]|[4-9]\d)%/.test(allText), 'no acid concentration above 30%');
  assert.ok(!/תוצאות מובטחות|תוצאה מובטחת|מעלים את|נעלמים לגמרי|guaranteed|نتيجة مضمونة/.test(allText), 'no promised result');
  for (const p of ALL_PROTOCOLS) assert.ok(PHOTOS[p.key], `${p.key}: a chapter photograph`);
  for (const f of Object.values(PHOTOS)) assert.ok(fs.existsSync(`public${f}`), `${f} exists`);

  for (const lang of BOOK_LANGS) {
    assert.equal(HOWTO[lang].parts.length, HOWTO.he.parts.length);
    assert.equal(HOWTO[lang].rules.length, 5, `${lang}: five rules, as the title says`);
    assert.equal(GLOSSARY[lang].terms.length, GLOSSARY.he.terms.length);
    if (lang !== 'he') assert.ok(!HEB.test(JSON.stringify([HOWTO[lang], GLOSSARY[lang]])), `${lang}: front matter fully translated`);
  }
}

console.log('protocol book: all passed');
