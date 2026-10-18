// The pasted-list import helpers, moved out of app/beautyos.jsx into lib/importMapping.js unchanged. These pin the behaviour the comments in that
// file describe, so the move (and any later change) cannot quietly alter what an import does with a cosmetician's list.
import assert from 'node:assert/strict';
import fs from 'node:fs';
// @ts-ignore: plain .js module
import { parseImportGrid, detectHeaderRow, guessColumns, buildImportRows, IMPORT_SPEC } from './lib/importMapping.js';

// a paste with a header row
const withHeader = parseImportGrid('שם\tטלפון\tהערות\nדנה כהן\t054-123-4567\tאוהבת קפה\nמיכל לוי\t0529876543\t');
assert.equal(withHeader.width, 3);
assert.equal(detectHeaderRow(withHeader.rows), true);
assert.deepEqual(guessColumns(withHeader.rows, true).slice(0, 2), ['name', 'phone']);
const built = buildImportRows(withHeader, ['name', 'phone', 'notes'], true) as { rows: Array<Record<string, string | undefined>>; noName: number };
assert.equal(built.rows.length, 2);
assert.equal(built.rows[0].name, 'דנה כהן');
assert.equal(built.rows[0].phone, '0541234567', 'a phone keeps only digits (and +)');
assert.equal(built.rows[1].notes, undefined, 'an empty cell is not written');

// no header: the columns are guessed from what the cells look like
const bare = parseImportGrid('דנה כהן\t0541234567\nמיכל לוי\t0529876543');
assert.equal(detectHeaderRow(bare.rows), false);
assert.deepEqual(guessColumns(bare.rows, false).slice(0, 2), ['name', 'phone']);

// a client who has a phone but no name keeps her empty first cell (trimming used to eat it and import the phone AS the name)
const noName = parseImportGrid('\t0541234567\nרונית\t0521112222');
assert.equal(noName.rows[0][0], '');
assert.equal(buildImportRows(noName, ['name', 'phone'], false).noName, 1);

// a service called "טיפול פנים" with a price is data, not a header
assert.equal(detectHeaderRow([['טיפול פנים', '250']]), false);

// the table the import screen reads
for (const kind of ['clients', 'services', 'appts']) {
  const spec = (IMPORT_SPEC as Record<string, { fields: unknown[]; guess: unknown; requires: string[]; unit: string }>)[kind];
  assert.ok(spec && Array.isArray(spec.fields) && typeof spec.guess === 'function' && spec.requires.length > 0 && spec.unit, `IMPORT_SPEC.${kind} is complete`);
}

// and the dashboard still gets them from here, not from a second copy
const dash = fs.readFileSync('app/beautyos.jsx', 'utf8');
assert.ok(dash.includes('from "@/lib/importMapping"'), 'the dashboard imports the helpers');
assert.ok(!/const (guessColumns|buildImportRows|parseImportGrid|IMPORT_SPEC) =/.test(dash), 'and no longer defines its own copies');

console.log('import mapping: ok');
