// The owner's outreach list (2026-11-09, /dashboard/admin/outreach): template personalization and rules, paste parsing with
// phone normalization and dedupe, the status rules (never again to whoever declined or asked to stop, a warning under 14 days),
// the numbers at the top, the migration, and the access guard. Nothing is ever sent from here.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  PROSPECT_STATUSES, TREATMENTS, SOURCES, canSend, statusAfterSend, contactedRecently, parsePastedProspects, dedupeAgainst,
  cleanProspectInput, cleanInstagram, firstName, outreachCounts, sentToday, sortProspects, isMissingProspectsTable, DAILY_LIMIT_HE,
  MIGRATION_NEEDED_HE,
} from './lib/prospects.ts'
import type { Prospect } from './lib/prospects.ts'
import {
  WHATSAPP_TEMPLATES, INSTAGRAM_TEMPLATE, OPT_OUT_LINE, personalize, whatsappMessage, instagramMessage, templateKeyFor,
  prospectWaLink, instagramDmLink,
} from './lib/prospectTemplates.ts'

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '')
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]))
let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name) }

const NOW = new Date('2026-11-09T10:00:00Z')
const day = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()
const p = (id: string, o: Partial<Prospect> = {}): Prospect => ({
  id, name: `שם ${id}`, phone: null, instagram: null, city: null, treatment: 'other', source: 'whatsapp', notes: '', status: 'new',
  lastContactedAt: null, contactCount: 0, createdAt: day(30), signedUp: false, ...o,
})

// ── templates ────────────────────────────────────────────────────────────────
ok('every template: signed by מעיין from ביוטי פלייס, free month with no card, asks before a link, the opt-out line, no em dash', () => {
  for (const t of [...Object.values(WHATSAPP_TEMPLATES), INSTAGRAM_TEMPLATE]) {
    assert.match(t, /מעיין מביוטי פלייס/)
    assert.match(t, /חודש ניסיון חינם/)
    assert.match(t, /בלי כרטיס אשראי/)
    assert.match(t, /רוצה שאשלח לך קישור/)
    assert.ok(t.includes(OPT_OUT_LINE))
    assert.ok(OPT_OUT_LINE.startsWith('אם לא רלוונטי, תגידי לי ולא אפנה שוב'))
    assert.doesNotMatch(t, /—|–/)
    assert.doesNotMatch(t, /https?:\/\//, 'the first message never carries a link')
    assert.ok(t.includes('{name}'))
  }
  assert.equal(new Set(Object.values(WHATSAPP_TEMPLATES)).size, 5)
})

ok('the template follows the treatment type; hair removal and other get the general one', () => {
  assert.equal(templateKeyFor('brows'), 'brows')
  assert.equal(templateKeyFor('lashes'), 'lashes')
  assert.equal(templateKeyFor('face'), 'face')
  assert.equal(templateKeyFor('nails'), 'nails')
  assert.equal(templateKeyFor('hair_removal'), 'general')
  assert.equal(templateKeyFor('other'), 'general')
  assert.match(whatsappMessage('brows', 'נועה'), /גבות/)
  assert.match(whatsappMessage('lashes', 'נועה'), /ריסים/)
  assert.match(whatsappMessage('nails', 'נועה'), /ציפורניים/)
})

ok('personalized with her first name only; no name gives a clean greeting with no placeholder left', () => {
  assert.equal(firstName('נועה כהן'), 'נועה')
  assert.equal(firstName('  ד"ר מיכל לוי 🌸'), 'מיכל')
  assert.equal(firstName(''), '')
  assert.equal(firstName('🌸'), '')
  const m = whatsappMessage('face', 'נועה כהן')
  assert.ok(m.startsWith('היי נועה, מה שלומך?'))
  assert.doesNotMatch(m, /כהן|\{name\}/)
  const anon = whatsappMessage('face', '')
  assert.ok(anon.startsWith('היי, מה שלומך?'))
  assert.doesNotMatch(anon, /\{name\}|  /)
  assert.ok(instagramMessage('').startsWith('היי 🌸'))
  assert.ok(instagramMessage('דנה').startsWith('היי דנה 🌸'))
  assert.equal(personalize('{name}!', 'שירה'), 'שירה!')
})

ok('wa.me link: her number, the typed message, nothing else; Instagram opens the DM thread', () => {
  const l = prospectWaLink('972541234567', 'brows', 'נועה כהן')!
  assert.match(l, /^https:\/\/wa\.me\/972541234567\?text=/)
  assert.equal(decodeURIComponent(l.split('?text=')[1]), whatsappMessage('brows', 'נועה כהן'))
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

ok('dedupe: a phone already on the list (or earlier in the batch) is skipped; Instagram-only rows dedupe by handle', () => {
  const incoming = [
    { name: 'a', phone: '972501234567', instagram: null },
    { name: 'b', phone: '972521112233', instagram: null },
    { name: 'c', phone: '972521112233', instagram: null },
    { name: 'd', phone: null, instagram: 'noa.brows' },
    { name: 'e', phone: null, instagram: 'new.one' },
  ]
  const { fresh, duplicates } = dedupeAgainst(incoming, ['972501234567'], ['noa.brows'])
  assert.deepEqual(fresh.map((x) => x.name), ['b', 'e'])
  assert.deepEqual(duplicates.map((x) => x.name), ['a', 'c', 'd'])
})

ok('one prospect: Israeli mobile normalized, phone or Instagram required, unknown types fall back', () => {
  const r = cleanProspectInput({ name: ' נועה  כהן ', phone: '054-123-4567', instagram: 'https://instagram.com/Noa.B/', treatment: 'x', source: 'y' })
  assert.ok(r.ok)
  if (r.ok) assert.deepEqual(r.value, { name: 'נועה כהן', phone: '972541234567', instagram: 'noa.b', city: null, treatment: 'other', source: 'whatsapp', notes: '' })
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
  assert.ok(post.indexOf('requirePlatformAdmin()') < post.indexOf('request.json()'), 'the body is read only after the check')
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

ok('the admin page and the owner hub link to the screen', () => {
  assert.match(rd('app/dashboard/admin/AdminClient.tsx'), /href="\/dashboard\/admin\/outreach"/)
  assert.match(rd('app/dashboard/owner/page.tsx'), /'\/dashboard\/admin\/outreach'/)
})

console.log(`${n} passed`)
