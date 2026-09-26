import assert from 'node:assert/strict';
import { consentComplete, publishBlockers, cleanPublicResults, resultsForService, groupResults, groupKeyForService } from './lib/results.js';

// Consent: who, when and the confirmation - all three.
const ok = { consentName: 'דנה', consentGivenOn: '2026-09-20', consentConfirmed: true };
assert.equal(consentComplete(ok), true);
assert.equal(consentComplete({ ...ok, consentName: '  ' }), false, 'no name');
assert.equal(consentComplete({ ...ok, consentGivenOn: '' }), false, 'no date');
assert.equal(consentComplete({ ...ok, consentGivenOn: '20/09/2026' }), false, 'not a date');
assert.equal(consentComplete({ ...ok, consentConfirmed: false }), false, 'not confirmed');
assert.equal(consentComplete(null), false);

// The button says WHY it is disabled.
assert.deepEqual(publishBlockers({ afterUrl: 'u', serviceName: 'אקנה', ...ok }), []);
assert.deepEqual(publishBlockers({}), ['תמונת אחרי', 'הטיפול', 'שם הלקוחה', 'מתי הסכימה', 'הסכמת הלקוחה']);
assert.deepEqual(publishBlockers({ afterUrl: 'u', serviceName: 'x', consentName: 'ד', consentGivenOn: '2026-01-01' }), ['הסכמת הלקוחה']);

// Public rows: an after photo is the minimum; a before is optional.
const rows = cleanPublicResults([
  { id: 'a', service_id: 's1', service_name: 'טיפול באקנה', before_url: 'b1', after_url: 'a1', caption: ' שבוע 6 ', sessions: 4 },
  { id: 'b', service_id: null, service_name: 'פילינג', before_url: null, after_url: 'a2', caption: '', sessions: null },
  { id: 'c', service_id: 's1', service_name: 'x', before_url: 'b', after_url: '  ' },
  null,
]);
assert.equal(rows.length, 2, 'no after photo, not a result');
assert.equal(rows[0].caption, 'שבוע 6');
assert.equal(rows[0].sessions, 4);
assert.equal(rows[1].before, '', 'after-only is allowed');
assert.equal(rows[1].sessions, null);

// Matching: by id when the result has one (survives a rename), else by name.
const services = [{ id: 's1', name: 'אקנה - שם חדש' }, { id: 's2', name: 'פילינג' }];
assert.equal(resultsForService(rows, services[0]).length, 1, 'id match survives a renamed service');
assert.equal(resultsForService(rows, services[1]).length, 1, 'name match when there is no id');

// Groups follow the menu order; a deleted service's results are not lost.
const withOrphan = [...rows, ...cleanPublicResults([{ id: 'd', service_id: 'gone', service_name: 'עיסוי', after_url: 'a4' }])];
const groups = groupResults(withOrphan, services);
assert.deepEqual(groups.map((g) => g.name), ['אקנה - שם חדש', 'פילינג', 'עיסוי']);
assert.equal(groupKeyForService(groups, services[0]), 'svc-s1');
assert.equal(groupKeyForService(groups, { id: 's9', name: 'לא קיים' }), null, 'no results, no link');
console.log('results: ok');
