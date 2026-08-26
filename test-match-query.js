// test-match-query.js
//
// Tests for the shared leads/clients search matcher. Run with plain node:
//
//     node test-match-query.js
//
// NO DATABASE. NO NETWORK.
//
// ── The cases that matter are drawn from real rows ────────────────────────
// These four are actual values from production, and between them they are the
// whole reason this module exists:
//
//   name="ניסיון "               phone="0542845655"     created in the app
//   name="Sigal Hakak Ben-Yacov"  phone="972526666306"   imported
//   name="מעין"                   phone=null
//   name="drgtdr0505889775"       phone=""
//
// Two phone formats in one table, Latin and Hebrew names side by side, and two
// rows with no usable phone at all. The old `phone?.includes(q)` matcher failed
// every interesting case here.

import {
  matchesQuery,
  phoneMatches,
  textMatches,
  digitsOnly,
  nationalDigits,
} from './lib/search/matchQuery.ts';

const OUT = console.log.bind(console);
let passed = 0, failed = 0;
const eq = (l, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) passed++; else { failed++; OUT(`  FAIL  ${l}\n        got  ${a}\n        want ${b}`); }
};
const ok = (l, c) => { if (c) passed++; else { failed++; OUT(`  FAIL  ${l}`); } };
const no = (l, c) => { if (!c) passed++; else { failed++; OUT(`  FAIL  ${l} (expected NO match)`); } };
const group = (n) => OUT(`\n── ${n} ${'─'.repeat(Math.max(0, 56 - n.length))}`);

// The real rows.
const IMPORTED = { name: 'Sigal Hakak Ben-Yacov', phone: '972526666306' };
const MANUAL   = { name: 'ניסיון ',               phone: '0542845655' };
const NOPHONE  = { name: 'מעין',                  phone: null };
const EMPTY    = { name: 'drgtdr0505889775',      phone: '' };
const lead = (r, q) => matchesQuery(q, { text: [r.name], phones: [r.phone] });

OUT('='.repeat(64));
OUT('search matcher — leads & clients');
OUT('='.repeat(64));

// ── 1. normalisation ───────────────────────────────────────────────────────
group('digit normalisation');
{
  eq('strips separators', digitsOnly('054-284-5655'), '0542845655');
  eq('strips +', digitsOnly('+972-52-666-6306'), '972526666306');
  eq('strips spaces and parens', digitsOnly('(052) 666 6306'), '0526666306');
  eq('null', digitsOnly(null), '');
  eq('no digits at all', digitsOnly('דנה כהן'), '');

  eq('972 stripped', nationalDigits('972526666306'), '526666306');
  eq('leading 0 stripped', nationalDigits('0542845655'), '542845655');
  eq('+972 stripped', nationalDigits('+972 52-666-6306'), '526666306');
  eq('already national', nationalDigits('526666306'), '526666306');
  eq('the two formats reduce to the SAME thing',
    nationalDigits('0526666306'), nationalDigits('972526666306'));
  eq('empty in, empty out', nationalDigits(''), '');
}

// ── 2. THE BUG: finding an imported lead by its local number ───────────────
group('imported lead, searched the way she would type it');
{
  ok('0526666306 finds the E.164 row', lead(IMPORTED, '0526666306'));
  ok('052-666-6306 with dashes', lead(IMPORTED, '052-666-6306'));
  ok('+972 form', lead(IMPORTED, '+972526666306'));
  ok('as stored, verbatim', lead(IMPORTED, '972526666306'));
  ok('052 prefix', lead(IMPORTED, '052'));
  ok('6666306 — last digits off a caller ID', lead(IMPORTED, '6666306'));
  ok('526666306 national form', lead(IMPORTED, '526666306'));

  // This is precisely what was broken before.
  const oldMatcher = (r, q) => !!(r.phone && r.phone.includes(q));
  no('the OLD matcher could not find it by 0526666306', oldMatcher(IMPORTED, '0526666306'));
  ok('the new one can', lead(IMPORTED, '0526666306'));
}

group('manual lead still works, and the two do not collide');
{
  ok('0542845655 finds the local row', lead(MANUAL, '0542845655'));
  ok('054 prefix', lead(MANUAL, '054'));
  ok('972542845655 finds it too', lead(MANUAL, '972542845655'));
  no('052 must NOT match the 054 lead', lead(MANUAL, '052'));
  no('the imported number must not match the manual lead', lead(MANUAL, '0526666306'));
  no('the manual number must not match the imported lead', lead(IMPORTED, '0542845655'));
}

// ── 3. case ────────────────────────────────────────────────────────────────
group('case-insensitive names');
{
  ok('lowercase finds a Latin name', lead(IMPORTED, 'sigal'));
  ok('uppercase', lead(IMPORTED, 'SIGAL'));
  ok('mixed', lead(IMPORTED, 'SiGaL'));
  ok('a later word', lead(IMPORTED, 'yacov'));
  ok('hyphenated part', lead(IMPORTED, 'ben-yacov'));
  ok('Hebrew still works', lead(MANUAL, 'ניסיון'));
  ok('Hebrew with trailing space in the STORED value', lead(MANUAL, 'ניסי'));

  const oldName = (r, q) => !!(r.name && r.name.includes(q));
  no('the OLD matcher missed "sigal"', oldName(IMPORTED, 'sigal'));
  ok('the new one finds it', lead(IMPORTED, 'sigal'));
}

// ── 4. multi-term ──────────────────────────────────────────────────────────
group('all terms must match');
{
  ok('two words, in order', lead(IMPORTED, 'sigal hakak'));
  ok('two words, OUT of order', lead(IMPORTED, 'hakak sigal'));
  ok('name term + phone term together', lead(IMPORTED, 'sigal 052'));
  no('one good term, one bad', lead(IMPORTED, 'sigal cohen'));
  no('right name, wrong number', lead(IMPORTED, 'sigal 054'));
  ok('extra whitespace is ignored', lead(IMPORTED, '   sigal    hakak   '));
}

// ── 5. empty and missing ───────────────────────────────────────────────────
group('empty query and missing fields');
{
  ok('empty query matches everything', lead(IMPORTED, ''));
  ok('whitespace-only query matches everything', lead(IMPORTED, '   '));
  ok('null query matches everything', lead(IMPORTED, null));
  ok('undefined query matches everything', lead(IMPORTED, undefined));

  ok('a row with a null phone is still findable by name', lead(NOPHONE, 'מעין'));
  no('a row with a null phone matches no phone query', lead(NOPHONE, '052'));
  ok('a row with an empty phone is findable by name', lead(EMPTY, 'drgtdr'));

  // The junk row's NAME contains digits. Searching a number should not find it
  // by accident through the text field.
  no('digits in a name do not satisfy a phone-shaped query via phone match',
    phoneMatches(EMPTY.phone, '0505889775'));
  ok('but searching that literal string still finds it by name',
    lead(EMPTY, '0505889775'));

  eq('no fields at all -> no match for a real term', matchesQuery('x', {}), false);
  eq('no fields, empty query -> still matches', matchesQuery('', {}), true);
}

// ── 6. unit level ──────────────────────────────────────────────────────────
group('units');
{
  no('phoneMatches with an empty term', phoneMatches('0541234567', ''));
  no('phoneMatches with a non-numeric term', phoneMatches('0541234567', 'abc'));
  no('phoneMatches against a null stored value', phoneMatches(null, '052'));
  ok('phoneMatches on a landline, stored verbatim', phoneMatches('03-1234567', '031234567'));
  ok('phoneMatches finds a landline by prefix', phoneMatches('03-1234567', '03'));

  no('textMatches with an empty term', textMatches('anything', ''));
  no('textMatches against null', textMatches(null, 'x'));
  ok('textMatches is case-insensitive', textMatches('DaNa', 'dana'));

  // Terms arrive already lowercased from matchesQuery; textMatches does not
  // lowercase the term itself, and this pins that contract.
  no('textMatches expects an already-lowercased term', textMatches('dana', 'DANA'));
}

// ── 7. a realistic list ────────────────────────────────────────────────────
group('filtering a mixed list');
{
  const rows = [IMPORTED, MANUAL, NOPHONE, EMPTY];
  const find = (q) => rows.filter((r) => lead(r, q)).map((r) => r.name);
  eq('052 finds only the imported one', find('052'), ['Sigal Hakak Ben-Yacov']);
  eq('054 finds only the manual one', find('054'), ['ניסיון ']);
  eq('empty query returns all', find('').length, 4);
  eq('a term nobody matches returns none', find('zzzz'), []);
}

OUT('\n' + '='.repeat(64));
OUT(`  passed ${passed}   failed ${failed}`);
OUT('='.repeat(64));
if (failed > 0) process.exit(1);
