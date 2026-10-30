// Client import: the same person in 972 and 05 form is one client; a leftover text column is kept as notes;
// the preview counts clients that already exist (2026-10-24 sweep).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { importPhoneKey, guessColumns, IMPORT_FIELDS } from './lib/importMapping.js';

assert.equal(importPhoneKey('972500000005'), '0500000005', 'an online booking (972…) …');
assert.equal(importPhoneKey('050-000-0005'), '0500000005', '… and a pasted 05… are the same person');
assert.equal(importPhoneKey('+972 50 000 0005'), '0500000005');
assert.equal(importPhoneKey(''), '');
assert.equal(importPhoneKey('97212'), '97212', 'too short to be an Israeli 972 number: left alone');

// No header: name, phone, then free text -> the text is a note, not dropped.
const rows = [['שירה מיובאת', '0500000011', 'אלרגיה ללטקס'], ['נגה מיובאת', '050-000-0012', '']];
assert.deepEqual(guessColumns(rows, false), ['name', 'phone', 'notes']);
// A header we do not recognise still means "she labelled it": left as not imported.
assert.deepEqual(guessColumns([['שם', 'טלפון', 'משהו'], ['דנה', '0501234567', 'x']], true), ['name', 'phone', 'ignore']);
assert.equal(IMPORT_FIELDS[0].label, 'לא לייבא', 'the option speaks her language, not "התעלם"');

const dash = fs.readFileSync(new URL('./app/beautyos.jsx', import.meta.url), 'utf8');
assert.ok(!/replace\(\/\\D\/g,""\)\)\.filter\(Boolean\)/.test(dash.slice(dash.indexOf('const importContacts'), dash.indexOf('const importContacts') + 3000)), 'the client import compares with importPhoneKey');
assert.ok(dash.includes('const existingClientCount = importTarget!=="clients" ? 0'), 'the preview counts existing clients');
assert.ok(dash.includes('{built.rows.length-existingClientCount} {importSpec.unit} ייווצרו'), 'and says how many will really be created');
console.log('test-import-dupes-notes: ok');
