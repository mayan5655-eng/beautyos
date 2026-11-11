// The owner's outreach list (2026-11-09, /dashboard/admin/outreach): template personalization and rules, paste parsing with
// phone normalization and dedupe, the status rules (never again to whoever declined or asked to stop, a warning under 14 days),
// the numbers at the top, the migration, and the access guard. Nothing is ever sent from here.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  PROSPECT_STATUSES, TREATMENTS, SOURCES, canSend, statusAfterSend, contactedRecently, parsePastedProspects, planAdd, isChannel,
  cleanProspectInput, cleanInstagram, firstName, outreachCounts, sentToday, sortProspects, isMissingProspectsTable, DAILY_LIMIT_HE,
  MIGRATION_NEEDED_HE, CURRENT_SYSTEMS, ENRICH_MIGRATION_NEEDED_HE, ENRICH_MIGRATION_FILE, DAILY_SOFT_LIMIT, parseFollowers,
  formatFollowers, parseCurrentSystem, cleanEnrichFields, isFollowupDate, isMissingEnrichColumns, prospectPriority, sortByPriority,
  todayList, followupDue, followupOverdueDays,
} from './lib/prospects.ts'
import type { Prospect } from './lib/prospects.ts'
import {
  personalize, whatsappMessage, instagramMessage, prospectWaLink, instagramDmLink, messageTemplate, tailoredLine, outreachLink,
  BASE_TAILORED_LINE, OPT_OUT_LINE,
} from './lib/prospectTemplates.ts'
import { matchIsraeliCity, ISRAEL_CITY_COUNT } from './lib/israelCities.ts'
import { toProspect } from './lib/prospectsData.ts'

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '')
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]))
let n = 0
const pending: Array<Promise<void>> = []
const ok = (name: string, fn: () => void | Promise<void>) => {
  const r = fn()
  if (r instanceof Promise) pending.push(r.then(() => { n++; console.log('ok -', name) }))
  else { n++; console.log('ok -', name) }
}

const NOW = new Date('2026-11-09T10:00:00Z')
const day = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()
const p = (id: string, o: Partial<Prospect> = {}): Prospect => ({
  id, name: `שם ${id}`, phone: null, instagram: null, city: null, treatment: 'other', source: 'whatsapp', notes: '', status: 'new',
  lastContactedAt: null, lastChannel: null, contactCount: 0, createdAt: day(30), signedUp: false,
  followers: null, currentSystem: 'unknown', nextFollowup: null, ...o,
})

// ── templates ────────────────────────────────────────────────────────────────
// The approved DM (2026-11), with "[שם]" as {name}. Every message is exactly this with one line swapped and the link tagged.
const APPROVED_DM = "היי {name}, נעים מאוד, אני מעיין 🌸\n\nהקמתי את Kalmea, מערכת לקוסמטיקאיות ומניקוריסטיות שמנהלת לך את כל העסק במקום אחד, כדי שתוכלי להתמקד בטיפולים ולגדול:\n\n📅 יומן וניהול: אתר אישי משלך שבו הלקוחות קובעות ומזיזות תור לבד, עם מקדמה בכרטיס או בביט. פחות וואטסאפ, פחות לקוחות שלא מגיעות.\n📣 שיווק: פוסטים ורילסים לאינסטגרם עם AI, בעיצוב של העסק שלך, תוך דקות.\n💰 מכירות: קופה וסליקה, כרטיסיית ניקובים, שוברי מתנה ודוח חודשי שמראה כמה הרווחת ומאיפה.\n\nהכל בתוכנה אחת, במקום שלוש אפליקציות ומחברת ✨\n\nאם תרצי, אני מקימה לך את הכל בעצמי תוך 10 דקות, וחודש ראשון עליי 💛\nלהצצה: https://kalmea.app/?utm_source=instagram&utm_medium=dm\n\nמוזמנת לעקוב אחרינו ב-@kal.mea לטיפים ועדכונים 🌸\nלכל שאלה אני זמינה לך באופן אישי, כאן או בוואטסאפ: 054-2845655"
const allMessages = () => CURRENT_SYSTEMS.flatMap((sys) => TREATMENTS.flatMap((t) => (['instagram', 'whatsapp'] as const).map((ch) => ({ sys, t, ch, m: messageTemplate(ch, t, sys) }))))

ok('the approved DM is the base: unknown system + "other" on Instagram is it word for word, plus utm_campaign and the opt-out line', () => {
  assert.equal(messageTemplate('instagram', 'other', 'unknown'), `${APPROVED_DM.replace('utm_medium=dm', 'utm_medium=dm&utm_campaign=other')}\n\n${OPT_OUT_LINE}`)
  assert.equal(tailoredLine('other', 'unknown'), BASE_TAILORED_LINE)
})

ok('every message differs from the approved one in exactly one line (the tailored one), the link and the contact line', () => {
  const base = `${APPROVED_DM}\n\n${OPT_OUT_LINE}`.split('\n')
  for (const { sys, t, ch, m } of allMessages()) {
    const lines = m.split('\n')
    assert.equal(lines.length, base.length, `${sys}/${t}/${ch}`)
    const diff = lines.map((l, i) => (l === base[i] ? -1 : i)).filter((i) => i >= 0)
    const allowed = new Set([base.indexOf(BASE_TAILORED_LINE), base.findIndex((l) => l.startsWith('להצצה:')), base.findIndex((l) => l.startsWith('לכל שאלה'))])
    for (const i of diff) assert.ok(allowed.has(i), `${sys}/${t}/${ch}: line ${i} changed: ${lines[i]}`)
  }
})

ok('every message: signed by מעיין, the free first month, the tagged link, nothing not live, no em dash', () => {
  for (const { sys, t, ch, m } of allMessages()) {
    assert.match(m, /אני מעיין/)
    assert.ok(m.endsWith(`\n\n${OPT_OUT_LINE}`), `${sys}/${t}/${ch}: the opt-out line is the very last line`)
    assert.equal(m.split(OPT_OUT_LINE).length, 2, 'exactly once')
    assert.match(m, /חודש ראשון עליי/)
    assert.ok(m.includes(`https://kalmea.app/?utm_source=${ch}&utm_medium=dm&utm_campaign=${t}`), `${sys}/${t}/${ch}`)
    assert.equal((m.match(/https?:\/\//g) || []).length, 1, 'one link only')
    assert.doesNotMatch(m, /קבלה|קבלות/)
    assert.doesNotMatch(m, /תזכורת|תזכורות|אוטומטי/, 'no automatic reminders claim')
    assert.doesNotMatch(m, /—|–/)
    assert.ok(m.includes('{name}'))
  }
  assert.equal(outreachLink('whatsapp', 'brows'), 'https://kalmea.app/?utm_source=whatsapp&utm_medium=dm&utm_campaign=brows')
})

ok('tailoring: WhatsApp by hand gets the evenings in WhatsApp; another system gets "moving over is easy"; treatment is in the line', () => {
  assert.match(tailoredLine('brows', 'whatsapp_manual'), /הערבים הולכים על התכתבויות בוואטסאפ על תורי גבות/)
  assert.match(tailoredLine('lashes', 'whatsapp_manual'), /ריסים/)
  assert.match(tailoredLine('nails', 'excel_or_notebook'), /מחברת.*ציפורניים/)
  for (const sys of ['calmark', 'pink', 'tor4you', 'other_system'] as const) {
    const l = tailoredLine('face', sys)
    assert.match(l, /המעבר קל/)
    assert.doesNotMatch(l, /וואטסאפ על/)
    // the free month is already in the base, so the whole message carries both
    assert.match(whatsappMessage('face', 'נועה', sys), /המעבר קל[\s\S]*חודש ראשון עליי/)
  }
  assert.match(tailoredLine('brows', 'calmark'), /Calmark/)
  assert.match(tailoredLine('face', 'unknown'), /מטיפולי פנים ועד הקופה/)
  // different systems give different messages; different treatments too
  assert.notEqual(whatsappMessage('brows', 'x', 'whatsapp_manual'), whatsappMessage('brows', 'x', 'pink'))
  assert.notEqual(whatsappMessage('brows', 'x', 'unknown'), whatsappMessage('nails', 'x', 'unknown'))
  // WhatsApp asks to answer right here; Instagram gives the number
  assert.match(whatsappMessage('brows', 'x'), /כאן בוואטסאפ\n\n/)
  assert.match(instagramMessage('x'), /בוואטסאפ: 054-2845655\n\n/)
  assert.equal(OPT_OUT_LINE, 'ואם זה לא רלוונטי לך, רק תכתבי לי ולא אפנה שוב 🙏')
  // what she actually sends (name filled in, wa.me decoded) still ends with it
  for (const m of [whatsappMessage('nails', 'נועה', 'pink'), instagramMessage('', 'face', 'whatsapp_manual'),
    decodeURIComponent(prospectWaLink('972541234567', 'lashes', 'דנה', 'excel_or_notebook')!.split('?text=')[1])]) {
    assert.ok(m.endsWith(OPT_OUT_LINE))
  }
})

ok('personalized with her first name only; no name gives a clean greeting with no placeholder left', () => {
  assert.equal(firstName('נועה כהן'), 'נועה')
  assert.equal(firstName('  ד"ר מיכל לוי 🌸'), 'מיכל')
  assert.equal(firstName(''), '')
  assert.equal(firstName('🌸'), '')
  const m = whatsappMessage('face', 'נועה כהן')
  assert.ok(m.startsWith('היי נועה, נעים מאוד, אני מעיין 🌸'))
  assert.doesNotMatch(m, /כהן|\{name\}/)
  const anon = whatsappMessage('face', '')
  assert.ok(anon.startsWith('היי, נעים מאוד'))
  assert.doesNotMatch(anon, /\{name\}|  /)
  assert.ok(instagramMessage('').startsWith('היי, נעים מאוד'))
  assert.ok(instagramMessage('דנה').startsWith('היי דנה, נעים מאוד'))
  assert.equal(personalize('{name}!', 'שירה'), 'שירה!')
})

ok('wa.me link: her number, the typed message, nothing else; Instagram opens the DM thread', () => {
  const l = prospectWaLink('972541234567', 'brows', 'נועה כהן')!
  assert.match(l, /^https:\/\/wa\.me\/972541234567\?text=/)
  assert.equal(decodeURIComponent(l.split('?text=')[1]), whatsappMessage('brows', 'נועה כהן'))
  const l2 = prospectWaLink('972541234567', 'nails', 'נועה', 'whatsapp_manual')!
  assert.equal(decodeURIComponent(l2.split('?text=')[1]), whatsappMessage('nails', 'נועה', 'whatsapp_manual'))
  assert.ok(decodeURIComponent(l2).includes('utm_source=whatsapp&utm_medium=dm&utm_campaign=nails'))
  assert.equal(prospectWaLink(null, 'brows', 'x'), null)
  assert.equal(instagramDmLink('@Noa.Brows'), 'https://ig.me/m/noa.brows')
  assert.equal(instagramDmLink(null), null)
})

// ── phones, paste, dedupe ───────────────────────────────────────────────────
ok('paste: one per line, any separator, either order; phones normalized; repeats inside the paste kept once', () => {
  const r = parsePastedProspects([
    'נועה כהן, 050-123-4567',
    '0521112233\tדנה',
    'שירה; +972 54 999 8877',
    '',
    'מיכל - 050 123 4567', // same as line 1
    'רותם, 03-1234567', // landline
    'בלי מספר',
    ', 0541112233', // no name
  ].join('\n'))
  assert.deepEqual(r.rows, [
    { name: 'נועה כהן', phone: '972501234567' },
    { name: 'דנה', phone: '972521112233' },
    { name: 'שירה', phone: '972549998877' },
  ])
  assert.deepEqual(r.repeated.map((x) => x.line), [5])
  assert.deepEqual(r.invalid.map((x) => [x.line, x.error]), [[6, 'מספר נייד לא תקין'], [7, 'לא נמצא מספר טלפון'], [8, 'חסר שם']])
})

ok('dedupe: the same person is the same phone OR the same handle; a repeat inside the batch is skipped', () => {
  const existing = [{ id: 'A', phone: '972501234567', instagram: null }, { id: 'B', phone: null, instagram: 'noa.brows' }]
  const incoming = [
    { name: 'a', phone: '972501234567', instagram: null }, // same phone as A, nothing new
    { name: 'b', phone: '972521112233', instagram: null }, // new
    { name: 'c', phone: '972521112233', instagram: null }, // repeat of b in the batch
    { name: 'd', phone: null, instagram: 'noa.brows' }, // same handle as B, nothing new
    { name: 'e', phone: null, instagram: 'new.one' }, // new
  ]
  const r = planAdd(incoming, existing)
  assert.deepEqual(r.fresh.map((x) => x.name), ['b', 'e'])
  assert.deepEqual(r.duplicates.map((x) => x.name), ['a', 'c', 'd'])
  assert.deepEqual(r.merges, [])
})

ok('Vercel review #1: adding a phone to someone listed by handle merges into HER row, never a new contactable one', () => {
  // she is on the list by Instagram only, and asked to stop
  const existing = [{ id: 'B', phone: null, instagram: 'noa.brows' }]
  const r = planAdd([{ name: 'נועה', phone: '972541234567', instagram: 'noa.brows' }], existing)
  assert.equal(r.fresh.length, 0, 'no new row: a new row would be status "new" and contactable again')
  assert.deepEqual(r.merges.map((m) => [m.id, m.patch]), [['B', { phone_e164: '972541234567' }]])
  // and the other way: a handle added to someone listed by phone
  const r2 = planAdd([{ name: 'x', phone: '972501234567', instagram: 'x.handle' }], [{ id: 'A', phone: '972501234567', instagram: null }])
  assert.deepEqual(r2.merges.map((m) => [m.id, m.patch]), [['A', { instagram: 'x.handle' }]])
  // a merge never carries a status (or anything but the two keys)
  for (const m of [...r.merges, ...r2.merges]) for (const k of Object.keys(m.patch)) assert.ok(['phone_e164', 'instagram'].includes(k), k)
  // phone matches one row, handle another: two people already, never merged by guess and never a third row
  const r3 = planAdd([{ name: 'y', phone: '972501234567', instagram: 'noa.brows' }], [{ id: 'A', phone: '972501234567', instagram: null }, ...existing])
  assert.deepEqual([r3.fresh.length, r3.merges.length, r3.duplicates.length], [0, 0, 1])
  // a phone that already belongs to another row is never copied onto this one
  const r4 = planAdd([{ name: 'z', phone: '972501234567', instagram: 'noa.brows' }], [{ id: 'A', phone: '972501234567', instagram: 'other' }, { id: 'B', phone: null, instagram: 'noa.brows' }])
  assert.equal(r4.merges.length, 0)
})

ok('Vercel review #1, server side: a merge updates only the keys; insert only for fresh rows; one row per handle in SQL too', () => {
  const route = strip(rd('app/api/admin/prospects/route.ts'))
  assert.match(route, /planAdd\(valid, \[\.\.\.existing\.values\(\)\]\)/)
  assert.match(route, /\.update\(\{ \.\.\.m\.patch, updated_at: new Date\(\)\.toISOString\(\) \}\)/)
  assert.match(route, /\.insert\(fresh\.map/)
  assert.match(route, /select\(KEY_COLUMNS\)\.in\('phone_e164', phones\)/)
  assert.match(route, /select\(KEY_COLUMNS\)\.in\('instagram', handles\)/)
  assert.match(rd('supabase/migrations/add_prospects_2026-11-09.sql'), /unique index if not exists prospects_instagram_key on public\.prospects \(instagram\) where instagram is not null/)
})

ok('one prospect: Israeli mobile normalized, phone or Instagram required, unknown types fall back', () => {
  const r = cleanProspectInput({ name: ' נועה  כהן ', phone: '054-123-4567', instagram: 'https://instagram.com/Noa.B/', treatment: 'x', source: 'y' })
  assert.ok(r.ok)
  if (r.ok) assert.deepEqual(r.value, { name: 'נועה כהן', phone: '972541234567', instagram: 'noa.b', city: null, treatment: 'other', source: 'whatsapp', notes: '', followers: null, currentSystem: null, nextFollowup: null })
  assert.deepEqual(cleanProspectInput({ name: 'x', phone: '03-1234567' }), { ok: false, error: 'מספר נייד לא תקין' })
  assert.deepEqual(cleanProspectInput({ name: 'x' }), { ok: false, error: 'צריך טלפון או אינסטגרם' })
  assert.deepEqual(cleanProspectInput({ phone: '0541234567' }), { ok: false, error: 'חסר שם' })
  assert.ok(cleanProspectInput({ name: 'x', instagram: '@ok_handle' }).ok)
  assert.equal(cleanInstagram('not a handle!'), 'not')
  assert.equal(cleanInstagram('!!!'), null)
})

// ── status rules ─────────────────────────────────────────────────────────────
ok('never again to whoever declined or asked to stop; a send moves only a new one to "נשלחה הודעה"', () => {
  assert.equal(canSend('opted_out'), false)
  assert.equal(canSend('not_interested'), false)
  for (const s of ['new', 'messaged', 'replied', 'trial', 'paying'] as const) assert.equal(canSend(s), true, s)
  assert.equal(statusAfterSend('new'), 'messaged')
  assert.equal(statusAfterSend('replied'), 'replied')
})

ok('a second message under 14 days warns', () => {
  assert.equal(contactedRecently(day(3), NOW), true)
  assert.equal(contactedRecently(day(13.9), NOW), true)
  assert.equal(contactedRecently(day(14), NOW), false)
  assert.equal(contactedRecently(null, NOW), false)
  assert.equal(contactedRecently('junk', NOW), false)
})

ok('the numbers at the top are a funnel; signed-up counts as trial; today counts the Israel day; the daily hint', () => {
  const rows = [
    p('a'), p('b', { status: 'messaged', lastContactedAt: day(0) }), p('c', { status: 'replied', lastContactedAt: day(2) }),
    p('d', { status: 'trial', lastContactedAt: day(5) }), p('e', { status: 'paying', lastContactedAt: day(9) }),
    p('f', { status: 'opted_out', lastContactedAt: day(1) }), p('g', { status: 'messaged', signedUp: true, lastContactedAt: day(1) }),
  ]
  assert.deepEqual(outreachCounts(rows), { sent: 6, replied: 4, trial: 2, paying: 1 })
  assert.equal(sentToday(rows, NOW), 1)
  assert.equal(DAILY_LIMIT_HE, 'מומלץ עד 20 הודעות ביום מהטלפון שלך')
  assert.deepEqual(sortProspects(rows).map((r) => r.id).slice(0, 2), ['a', 'b'])
  assert.equal(sortProspects(rows).at(-1)!.id, 'f')
})

// ── enrich: followers, current system, next follow-up ─────────────────────
ok('followers: "12.5K", "1.2M", "3,400", "12.5 אלף", "980 עוקבות" parse; out of range or junk is null; shown short', () => {
  assert.equal(parseFollowers('12.5K'), 12500)
  assert.equal(parseFollowers('12.5k'), 12500)
  assert.equal(parseFollowers('1.2M'), 1_200_000)
  assert.equal(parseFollowers('3,400'), 3400)
  assert.equal(parseFollowers('12.5 אלף'), 12500)
  assert.equal(parseFollowers('980 עוקבות'), 980)
  assert.equal(parseFollowers('4K followers'), 4000)
  assert.equal(parseFollowers(4200), 4200)
  assert.equal(parseFollowers('0'), 0)
  assert.equal(parseFollowers('10000001'), null)
  assert.equal(parseFollowers('11M'), null)
  assert.equal(parseFollowers(-1), null)
  assert.equal(parseFollowers(1.5), null)
  assert.equal(parseFollowers('12.5'), null, 'a fraction without K/M is not a count')
  assert.equal(parseFollowers('abc'), null)
  assert.equal(formatFollowers(12500), '12.5K')
  assert.equal(formatFollowers(3000), '3K')
  assert.equal(formatFollowers(980), '980')
  assert.equal(formatFollowers(1_200_000), '1.2M')
  assert.equal(formatFollowers(null), '')
})

ok('system names in Hebrew or English map to the stored keys', () => {
  assert.equal(parseCurrentSystem('קלמרק'), 'calmark')
  assert.equal(parseCurrentSystem('Calmark'), 'calmark')
  assert.equal(parseCurrentSystem('פינק'), 'pink')
  assert.equal(parseCurrentSystem('Tor4You'), 'tor4you')
  assert.equal(parseCurrentSystem('תור פור יו'), 'tor4you')
  assert.equal(parseCurrentSystem('ווטסאפ'), 'whatsapp_manual')
  assert.equal(parseCurrentSystem('וואטסאפ ידני'), 'whatsapp_manual')
  assert.equal(parseCurrentSystem('מחברת'), 'excel_or_notebook')
  assert.equal(parseCurrentSystem('Excel'), 'excel_or_notebook')
  assert.equal(parseCurrentSystem('מערכת אחרת'), 'other_system')
  assert.equal(parseCurrentSystem('pink'), 'pink')
  assert.equal(parseCurrentSystem('תל אביב'), null)
  assert.equal(parseCurrentSystem(''), null)
})

ok('paste with the new columns: city, @handle, followers and system in any order; a handle alone is enough', () => {
  const r = parsePastedProspects([
    'נועה כהן, 050-123-4567, חיפה, 12.5K, ווטסאפ',
    'דנה\t0521112233\tקלמרק\t3400\tתל אביב',
    'שירה, @shira.nails, 980 עוקבות, Pink',
    'מיכל, @Shira.Nails', // same handle as line 3
    'רותם, 0541112233, 1.2M',
    'גלית, @galit, מחברת, ראשון לציון',
  ].join('\n'))
  assert.deepEqual(r.rows, [
    { name: 'נועה כהן', phone: '972501234567', city: 'חיפה', followers: 12500, currentSystem: 'whatsapp_manual' },
    { name: 'דנה', phone: '972521112233', city: 'תל אביב', followers: 3400, currentSystem: 'calmark' },
    { name: 'שירה', phone: null, instagram: 'shira.nails', followers: 980, currentSystem: 'pink' },
    { name: 'רותם', phone: '972541112233', followers: 1_200_000 },
    { name: 'גלית', phone: null, instagram: 'galit', city: 'ראשון לציון', currentSystem: 'excel_or_notebook' },
  ])
  assert.deepEqual(r.repeated.map((x) => x.line), [4])
  assert.deepEqual(r.invalid, [])
  // the two-column format still works exactly as before
  assert.deepEqual(parsePastedProspects('נועה, כהן, 050-123-4567').rows, [{ name: 'נועה כהן', phone: '972501234567' }])
  assert.deepEqual(parsePastedProspects('נועה, בת, שבע, לוי, 050-123-4567').rows, [{ name: 'נועה בת שבע', phone: '972501234567' }], 'up to 3 name parts')
  assert.deepEqual(parsePastedProspects('נועה כהן, 050-123-4567').rows, [{ name: 'נועה כהן', phone: '972501234567' }])
})

ok('enrich validation: followers 0..10M, a known system, a real date; only keys present are patched; empty clears', () => {
  assert.deepEqual(cleanEnrichFields({}), { ok: true, patch: {}, touched: false })
  assert.deepEqual(cleanEnrichFields({ followers: '12.5K', current_system: 'קלמרק', next_followup: '2026-11-20' }),
    { ok: true, patch: { followers: 12500, current_system: 'calmark', next_followup: '2026-11-20' }, touched: true })
  assert.deepEqual(cleanEnrichFields({ followers: null, next_followup: '' }), { ok: true, patch: { followers: null, next_followup: null }, touched: true })
  assert.equal(cleanEnrichFields({ followers: 10_000_001 }).ok, false)
  assert.equal(cleanEnrichFields({ followers: 'lots' }).ok, false)
  assert.equal(cleanEnrichFields({ current_system: 'wix' }).ok, false)
  assert.equal(cleanEnrichFields({ next_followup: '2026-02-30' }).ok, false)
  assert.equal(cleanEnrichFields({ next_followup: '20-11-2026' }).ok, false)
  assert.equal(cleanEnrichFields({ next_followup: '2101-01-01' }).ok, false)
  assert.equal(isFollowupDate('2026-11-11'), true)
  const one = cleanProspectInput({ name: 'x', phone: '0541234567', followers: '3K', current_system: 'pink' })
  assert.ok(one.ok && one.value.followers === 3000 && one.value.currentSystem === 'pink' && one.value.nextFollowup === null)
  assert.deepEqual(cleanProspectInput({ name: 'x', phone: '0541234567', followers: 'x' }), { ok: false, error: 'מספר עוקבות לא תקין (0 עד 10,000,000)' })
})

ok('priority: a due follow-up first, then WhatsApp-by-hand with 1K-10K followers; recent contact sinks; declined is never', () => {
  const rows = [
    p('big', { followers: 200_000, currentSystem: 'calmark' }),
    p('sweet', { followers: 4_000, currentSystem: 'whatsapp_manual' }),
    p('tiny', { followers: 120, currentSystem: 'whatsapp_manual' }),
    p('unknown'),
    p('due', { status: 'messaged', lastContactedAt: day(20), nextFollowup: '2026-11-08' }),
    p('recent', { status: 'messaged', lastContactedAt: day(2), followers: 4_000, currentSystem: 'whatsapp_manual' }),
    p('later', { followers: 4_000, currentSystem: 'whatsapp_manual', nextFollowup: '2026-11-20' }),
    p('stop', { status: 'opted_out', followers: 4_000, currentSystem: 'whatsapp_manual', nextFollowup: '2026-11-01' }),
  ]
  assert.deepEqual(sortByPriority(rows, NOW).map((r) => r.id), ['due', 'sweet', 'later', 'tiny', 'unknown', 'big', 'recent', 'stop'])
  assert.equal(prospectPriority(rows[7], NOW), -1)
  assert.ok(prospectPriority(p('a', { currentSystem: 'whatsapp_manual' }), NOW) > prospectPriority(p('b', { currentSystem: 'pink' }), NOW))
  assert.ok(prospectPriority(p('a', { followers: 5_000 }), NOW) > prospectPriority(p('b', { followers: 500 }), NOW))
  assert.ok(prospectPriority(p('a', { followers: 5_000 }), NOW) > prospectPriority(p('b', { followers: 60_000 }), NOW))
  assert.ok(prospectPriority(p('a', { status: 'replied', lastContactedAt: day(20) }), NOW) > prospectPriority(p('b', { status: 'messaged', lastContactedAt: day(20) }), NOW))
})

ok('follow-up due uses the Israel day: today and overdue count, tomorrow does not', () => {
  // 2026-11-09T23:30Z is already 2026-11-10 in Israel
  const late = new Date('2026-11-09T23:30:00Z')
  assert.equal(followupDue('2026-11-10', late), true)
  assert.equal(followupDue('2026-11-11', late), false)
  assert.equal(followupOverdueDays('2026-11-10', late), 0)
  assert.equal(followupOverdueDays('2026-11-07', late), 3)
  assert.equal(followupOverdueDays('2026-11-12', late), null)
  assert.equal(followupDue(null, late), false)
  assert.equal(followupDue('junk', late), false)
})

ok('"לפנות היום": due follow-ups first (oldest date first), then the best new ones; capped by what is left of the daily limit', () => {
  const rows = [
    p('n1', { followers: 4_000, currentSystem: 'whatsapp_manual' }),
    p('n2', { followers: 120 }),
    p('d2', { status: 'replied', lastContactedAt: day(5), nextFollowup: '2026-11-09' }),
    p('d1', { status: 'messaged', lastContactedAt: day(20), nextFollowup: '2026-11-02' }),
    p('future', { nextFollowup: '2026-11-30' }),
    p('messaged', { status: 'messaged', lastContactedAt: day(20) }),
    p('stop', { status: 'not_interested', nextFollowup: '2026-11-01' }),
  ]
  const t = todayList(rows, NOW)
  assert.deepEqual(t.map((x) => [x.p.id, x.reason]), [['d1', 'followup'], ['d2', 'followup'], ['n1', 'new'], ['n2', 'new']])
  assert.deepEqual(todayList(rows, NOW, 2).map((x) => x.p.id), ['d1', 'd2'])
  // 19 sent today leaves room for one
  const sent = Array.from({ length: DAILY_SOFT_LIMIT - 1 }, (_, i) => p(`s${i}`, { status: 'messaged', lastContactedAt: NOW.toISOString() }))
  assert.deepEqual(todayList([...rows, ...sent], NOW).map((x) => x.p.id), ['d1'])
  const full = [...sent, p('s-last', { status: 'messaged', lastContactedAt: NOW.toISOString() })]
  assert.deepEqual(todayList([...rows, ...full], NOW), [])
})

ok('missing enrich columns: recognised, never mistaken for a missing table; rows default to unknown', () => {
  assert.equal(isMissingEnrichColumns({ code: '42703', message: 'column prospects.followers does not exist' }), true)
  assert.equal(isMissingEnrichColumns({ code: 'PGRST204', message: "Could not find the 'current_system' column of 'prospects' in the schema cache" }), true)
  assert.equal(isMissingEnrichColumns({ code: '42P01', message: 'relation "public.prospects" does not exist' }), false)
  assert.equal(isMissingProspectsTable({ code: '42703', message: 'column prospects.followers does not exist' }), false)
  assert.equal(isMissingProspectsTable({ code: '42P01', message: 'relation "public.prospects" does not exist' }), true)
  const r = toProspect({ id: 'a', name: 'x', phone_e164: null, instagram: 'x', city: null, treatment: 'brows', source: 'instagram', notes: '', status: 'new',
    last_contacted_at: null, contact_count: 0, created_at: day(1) }, new Set())
  assert.deepEqual([r.followers, r.currentSystem, r.nextFollowup], [null, 'unknown', null])
  const r2 = toProspect({ id: 'a', name: 'x', phone_e164: null, instagram: 'x', city: null, treatment: 'brows', source: 'instagram', notes: '', status: 'new',
    last_contacted_at: null, contact_count: 0, created_at: day(1), followers: 4000, current_system: 'pink', next_followup: '2026-11-12' }, new Set())
  assert.deepEqual([r2.followers, r2.currentSystem, r2.nextFollowup], [4000, 'pink', '2026-11-12'])
  assert.match(ENRICH_MIGRATION_NEEDED_HE, new RegExp(ENRICH_MIGRATION_FILE))
  assert.doesNotMatch(ENRICH_MIGRATION_NEEDED_HE, /—|–/)
})

ok('missing enrich columns: the read falls back to the old columns, and the route writes none of them until the SQL ran', () => {
  const route = strip(rd('app/api/admin/prospects/route.ts'))
  const post = route.slice(route.indexOf('export async function POST'))
  assert.ok(post.indexOf('requirePlatformAdmin()') < post.indexOf('probeEnrichColumns(db)'))
  assert.match(post, /const enriched = \(await probeEnrichColumns\(db\)\) === true/)
  assert.match(post, /\.\.\.\(enriched \? \{ followers: v\.followers, current_system: v\.currentSystem \?\? 'unknown', next_followup: v\.nextFollowup \} : \{\}\)/)
  assert.match(post, /if \(enrich\.touched\) \{\s*if \(!enriched\) return enrichNeeded\(\)\s*Object\.assign\(patch, enrich\.patch\)/)
  assert.match(post, /if \(enriched && followupDue\(row\.next_followup, new Date\(\)\)\) patch\.next_followup = null/)
  assert.match(route, /function enrichNeeded\(\) \{\s*return NextResponse\.json\(\{ error: ENRICH_MIGRATION_NEEDED_HE, migrationNeeded: true \}, \{ status: 503 \}\)/)
  // every column the route selects or writes outside that guard is a base column
  assert.match(post, /const PROSPECT_COLUMNS = prospectColumns\(enriched\)/)
  const data = strip(rd('lib/prospectsData.ts'))
  assert.match(data, /if \(res\.error && isMissingEnrichColumns\(res\.error\)\) \{\s*enriched = false\s*res = await read\(PROSPECT_COLUMNS\)/)
  // the client shows the enrich fields and filter only when enriched, and the admin-only note otherwise
  const c = strip(rd('app/dashboard/admin/outreach/OutreachClient.tsx'))
  for (const id of ['followers', 'current-system', 'next-followup', 'system-filter']) {
    const i = c.indexOf(`data-testid="${id}"`)
    assert.ok(i > 0, id)
    assert.ok(c.slice(Math.max(0, i - 400), i).includes('{enriched && ('), id)
  }
  assert.match(c, /available && !enriched && \(\s*<p role="status" data-testid="enrich-migration-note"/)
})

ok('the read with a fake database: missing enrich columns -> a second read without them, enriched false, nothing written', async () => {
  const calls: string[] = []
  const fakeDb = {
    from(table: string) {
      return {
        select(cols: string) {
          calls.push(`${table}:${cols}`)
          const missing = table === 'prospects' && /followers/.test(cols)
          const res = missing
            ? { data: null, error: { code: '42703', message: 'column prospects.followers does not exist' } }
            : { data: table === 'prospects' ? [{ id: 'a', name: 'x', phone_e164: '972541234567', instagram: null, city: null, treatment: 'nails', source: 'whatsapp', notes: '', status: 'new', last_contacted_at: null, contact_count: 0, created_at: day(1) }] : [], error: null }
          const q = Promise.resolve(res) as Promise<typeof res> & { order: () => typeof q; limit: () => typeof q }
          q.order = () => q
          q.limit = () => q
          return q
        },
        insert() { throw new Error('no writes') }, update() { throw new Error('no writes') }, delete() { throw new Error('no writes') },
      }
    },
  }
  const { readProspects } = await import('./lib/prospectsData.ts')
  const r = await readProspects(fakeDb as never)
  assert.ok(r.ok && r.available && r.enriched === false)
  if (r.ok) assert.deepEqual([r.rows[0].treatment, r.rows[0].currentSystem, r.rows[0].followers], ['nails', 'unknown', null])
  assert.equal(calls.filter((x) => x.startsWith('prospects:')).length, 2)
})

ok('nothing sends: the templates module and the new screen code only build links and text', () => {
  const t = strip(rd('lib/prospectTemplates.ts'))
  assert.doesNotMatch(t, /fetch\(|sendWhatsApp|greenapi|waCloud|XMLHttpRequest|navigator\.sendBeacon/i)
  const lib = strip(rd('lib/prospects.ts'))
  assert.doesNotMatch(lib, /fetch\(|sendWhatsApp|greenapi|waCloud/i)
  const c = strip(rd('app/dashboard/admin/outreach/OutreachClient.tsx'))
  // the "לפנות היום" button is a wa.me link she opens herself, and it records the send through the same route
  assert.match(c, /function TodayRow[\s\S]*const wa = prospectWaLink\(p\.phone, p\.treatment, p\.name, p\.currentSystem\)/)
  assert.match(c, /data-testid="today"/)
  assert.match(c, /todayList\(rows, now\)/)
  assert.doesNotMatch(c, /window\.open|sendBeacon/)
})

ok('the enrich migration: additive, nullable, checked, every system listed, no drop or delete, nothing about grants loosened', () => {
  const sql = rd('supabase/migrations/add_prospects_enrich_2026-11-11.sql')
  for (const col of ['followers integer', 'current_system text', 'next_followup date']) {
    assert.match(sql, new RegExp(`alter table public\\.prospects add column if not exists ${col};`), col)
  }
  assert.match(sql, /followers between 0 and 10000000/)
  for (const s of CURRENT_SYSTEMS) assert.match(sql, new RegExp(`'${s}'`), s)
  assert.match(sql, /next_followup between date '2020-01-01' and date '2100-12-31'/)
  const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
  assert.doesNotMatch(code, /\bdrop\b|\bdelete\b|\btruncate\b|\bgrant\b|create policy|add column[^;]*not null|set not null/i)
  assert.match(code.trim(), /^begin;[\s\S]*commit;$/)
})

ok('Vercel review (4539220963): a handle with six or more digits is a handle, never a phone, before or after the phone', () => {
  const r = parsePastedProspects([
    'נועה, @nails_123456, 050-123-4567',
    'דנה, 0521112233, @brows.9876543',
    'שירה, @lash_2024000',
    'מיכל, instagram.com/nails_555555/, 0549998877',
  ].join('\n'))
  assert.deepEqual(r.invalid, [])
  assert.deepEqual(r.rows.map((x) => [x.name, x.phone, x.instagram]), [
    ['נועה', '972501234567', 'nails_123456'], ['דנה', '972521112233', 'brows.9876543'], ['שירה', null, 'lash_2024000'],
    ['מיכל', '972549998877', 'nails_555555'],
  ])
  // a landline is still refused as a mobile; a broken handle is reported, not guessed
  assert.deepEqual(parsePastedProspects('רותם, 03-1234567').invalid.map((x) => x.error), ['מספר נייד לא תקין'])
  assert.deepEqual(parsePastedProspects('רותם, @!!!, 0541234567').invalid.map((x) => x.error), ['שם משתמש באינסטגרם לא תקין'])
})

ok('Vercel review (4539220954): "3,400" and "200000" are followers; numbers never leak into her name or city', () => {
  const r = parsePastedProspects([
    'נועה כהן, 050-123-4567, 3,400, חיפה',
    'דנה, 0521112233, 200000',
    'שירה, 0549998877, 10,000,000',
    'מיכל, 0541112233, 1,250, 77, תל אביב', // the second number is dropped, not added to her name
    'רותם, 0541112234, 99999999', // over 10M: dropped
    'גלית, 0541112235, 0541112236', // a second phone: ignored
  ].join('\n'))
  assert.deepEqual(r.invalid, [])
  assert.deepEqual(r.rows.map((x) => [x.name, x.city ?? null, x.followers ?? null]), [
    ['נועה כהן', 'חיפה', 3400], ['דנה', null, 200000], ['שירה', null, 10_000_000], ['מיכל', 'תל אביב', 1250], ['רותם', null, null],
    ['גלית', null, null],
  ])
  assert.equal(r.rows[5].phone, '972541112235')
  for (const row of r.rows) assert.doesNotMatch(`${row.name} ${row.city ?? ''}`, /\d/)
})

ok('paste: a plain cell is the city only when it is a known Israeli city or starts with "עיר:"; otherwise it is her name', () => {
  const r = parsePastedProspects([
    'נועה, כהן, 050-123-4567', // כהן is not a city
    'דנה לוי, ת"א, 0521112233',
    'שירה, פ״ת, 0549998877',
    'מיכל, קרית גת, 0541112233',
    'רותם, ב"ש, 0541112234',
    'גלית, עיר: אריאל, 0541112235', // a first name, so only with the prefix
    'יעל, אריאל, 0541112236', // without it: part of her name
    'חיפה, הדס, 0541112237', // a city first, the other cell is the name
    'ראשל"צ, 0541112238', // the only plain cell is always the name
  ].join('\n'))
  assert.deepEqual(r.rows.map((x) => [x.name, x.city ?? null]), [
    ['נועה כהן', null], ['דנה לוי', 'תל אביב'], ['שירה', 'פתח תקווה'], ['מיכל', 'קריית גת'], ['רותם', 'באר שבע'],
    ['גלית', 'אריאל'], ['יעל אריאל', null], ['הדס', 'חיפה'], ['ראשל"צ', null],
  ])
  assert.equal(matchIsraeliCity('תל-אביב'), 'תל אביב')
  assert.equal(matchIsraeliCity('תל אביב יפו'), 'תל אביב')
  assert.equal(matchIsraeliCity('ראשון לציון'), 'ראשון לציון')
  assert.equal(matchIsraeliCity('ראשל״צ'), 'ראשון לציון')
  assert.equal(matchIsraeliCity('באר-שבע'), 'באר שבע')
  assert.equal(matchIsraeliCity('פתח תקוה'), 'פתח תקווה')
  assert.equal(matchIsraeliCity('נצרת עילית'), 'נוף הגליל')
  assert.equal(matchIsraeliCity('עיר: מושב בני דרור'), 'מושב בני דרור')
  for (const name of ['כהן', 'לוי', 'אריאל', 'אפרת', 'עומר', 'אלעד', 'נועה', 'שלומי', 'סביון']) assert.equal(matchIsraeliCity(name), null, name)
  assert.ok(ISRAEL_CITY_COUNT >= 120, `only ${ISRAEL_CITY_COUNT} cities`)
})

// ── migration ────────────────────────────────────────────────────────────────
ok('the migration: statuses, treatments and sources match the code; RLS on with no policy; browser roles revoked; no delete grant', () => {
  const sql = rd('supabase/migrations/add_prospects_2026-11-09.sql')
  for (const s of [...PROSPECT_STATUSES, ...TREATMENTS, ...SOURCES]) assert.match(sql, new RegExp(`'${s}'`), s)
  assert.match(sql, /alter table public\.prospects enable row level security/)
  assert.doesNotMatch(sql, /create policy/i)
  assert.match(sql, /revoke all on public\.prospects from anon, authenticated/)
  assert.match(sql, /grant select, insert, update on public\.prospects to service_role/)
  assert.doesNotMatch(sql, /grant[^;]*delete/i)
  assert.match(sql, /unique index if not exists prospects_phone_key/)
  assert.equal(isMissingProspectsTable({ code: 'PGRST205', message: 'x' }), true)
  assert.equal(isMissingProspectsTable({ code: '42501', message: 'permission denied' }), false)
  assert.match(MIGRATION_NEEDED_HE, /צריך להריץ עדכון קטן/)
})

// ── access and "nothing is sent" ────────────────────────────────────────────
ok('the page and the route are gated first with the platform-admin check; non-admins get a plain 404', () => {
  const loader = strip(rd('app/dashboard/admin/outreach/loader.ts'))
  const body = loader.slice(loader.indexOf('export async function loadOutreach'))
  assert.ok(body.indexOf('requirePlatformAdmin()') > -1 && body.indexOf('requirePlatformAdmin()') < body.indexOf('createAdminClient()'))
  assert.match(body, /if \(!admin\.ok\) notFound\(\)/)
  const page = strip(rd('app/dashboard/admin/outreach/page.tsx'))
  assert.match(page, /await loadOutreach\(\)/)
  assert.doesNotMatch(page, /createAdminClient|\.from\(|\.rpc\(/)
  assert.match(page, /export const dynamic = 'force-dynamic'/)
  const route = strip(rd('app/api/admin/prospects/route.ts'))
  assert.doesNotMatch(route, /export async function (GET|PUT|PATCH|DELETE)/)
  const post = route.slice(route.indexOf('export async function POST'))
  assert.ok(post.indexOf('requirePlatformAdmin()') > -1 && post.indexOf('requirePlatformAdmin()') < post.indexOf('createAdminClient()'))
  assert.ok(post.indexOf('requirePlatformAdmin()') < post.indexOf('request.text()'), 'the body is read only after the check')
  assert.match(post, /if \(!admin\.ok\) return notFound\(\)/)
})

ok('the route writes only prospects, never deletes, refuses a send to whoever declined; it sends nothing', () => {
  const route = strip(rd('app/api/admin/prospects/route.ts'))
  const writes = [...route.matchAll(/\.from\('([^']+)'\)\s*\.(upsert|insert|update|delete)/g)].map((m) => m[1])
  assert.deepEqual([...new Set(writes)], ['prospects'])
  assert.doesNotMatch(route, /\.delete\(/)
  assert.match(route, /if \(!canSend\(status\)\) return NextResponse\.json\([^)]*\{ status: 409 \}/)
  const server = route + strip(rd('lib/prospectsData.ts'))
  assert.doesNotMatch(server, /sendWhatsApp|greenapi|waCloud|lib\/whatsapp|fetch\(/i)
  const data = strip(rd('lib/prospectsData.ts'))
  assert.doesNotMatch(data, /\.insert\(|\.update\(|\.upsert\(|\.delete\(|select\('\*'\)/)
  assert.deepEqual([...new Set([...data.matchAll(/\.from\('([^']+)'\)/g)].map((m) => m[1]))].sort(), ['owner_phones', 'prospects', 'settings'])
})

ok('the client only links out and posts to its own route; no server module or tenant phone reaches the browser', () => {
  const c = strip(rd('app/dashboard/admin/outreach/OutreachClient.tsx'))
  assert.match(c, /^'use client'/)
  assert.doesNotMatch(c, /adminGuard|supabase|prospectsData|loader|sendWhatsApp|window\.open/)
  assert.deepEqual([...c.matchAll(/fetch\('([^']+)'/g)].map((m) => m[1]), ['/api/admin/prospects'])
  // the send button exists only when canSend() is true
  assert.match(c, /const wa = sendable \? prospectWaLink/)
  assert.match(c, /const sendable = canSend\(p\.status\)/)
  assert.match(c, /DAILY_LIMIT_HE/)
  for (const f of walk('app').filter((x) => /\.(tsx|jsx)$/.test(x) && /['"]use client['"]/.test(rd(x)))) {
    assert.doesNotMatch(rd(f), /outreach\/loader|prospectsData/, f)
  }
})

ok('Vercel review #2: an Instagram send can be recorded for anyone sendable, phone or not; the channel is stored', () => {
  const c = strip(rd('app/dashboard/admin/outreach/OutreachClient.tsx'))
  const i = c.indexOf('data-testid="mark-instagram-sent"')
  assert.ok(i > 0)
  const before = c.slice(Math.max(0, c.lastIndexOf('</button>', i)), i)
  assert.doesNotMatch(before, /!wa &&/, 'not hidden when a WhatsApp link exists')
  assert.match(c.slice(i, i + 200), /if \(confirmRecent\(\)\) void save\(\{ action: 'sent', channel: 'instagram' \}\)/)
  // it lives inside the sendable branch only (the opted-out branch renders no buttons)
  assert.ok(c.indexOf('available && (sendable ?') < i && i < c.indexOf("'ביקשה להפסיק' : 'לא מעוניינת'"))
  const route = strip(rd('app/api/admin/prospects/route.ts'))
  assert.match(route, /const channel = isChannel\(body\.channel\) \? body\.channel : 'whatsapp'/)
  assert.match(route, /last_channel: channel/)
  assert.ok(route.indexOf('if (!canSend(status))') < route.indexOf('last_channel: channel'))
  assert.equal(isChannel('instagram'), true)
  assert.equal(isChannel('sms'), false)
  assert.match(rd('supabase/migrations/add_prospects_2026-11-09.sql'), /last_channel\s+text check \(last_channel in \('whatsapp', 'instagram'\)\)/)
})

ok('security: bounded body read only after the admin check; raw phone length capped; no rows to a non-admin', () => {
  const route = strip(rd('app/api/admin/prospects/route.ts'))
  const post = route.slice(route.indexOf('export async function POST'))
  assert.ok(post.indexOf('requirePlatformAdmin()') < post.indexOf('request.text()'))
  assert.match(post, /if \(text\.length > BODY_MAX\) return NextResponse\.json\([^)]*\{ status: 413 \}/)
  assert.doesNotMatch(post, /request\.json\(\)/)
  assert.deepEqual(cleanProspectInput({ name: 'x', phone: '0'.repeat(41) }), { ok: false, error: 'מספר נייד לא תקין' })
  // the 404 for a non-admin carries nothing but "Not found"
  assert.match(route, /function notFound\(\) \{\s*return NextResponse\.json\(\{ error: 'Not found' \}, \{ status: 404 \}\)/)
})

ok('the admin page and the owner hub link to the screen', () => {
  assert.match(rd('app/dashboard/admin/AdminClient.tsx'), /href="\/dashboard\/admin\/outreach"/)
  assert.match(rd('app/dashboard/owner/page.tsx'), /'\/dashboard\/admin\/outreach'/)
})

await Promise.all(pending)
console.log(`${n} passed`)
