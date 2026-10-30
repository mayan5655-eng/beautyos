// "+ הוסיפי שירות" in Settings saves: a new service row sends only the fields it has (2026-10-24 sweep).
// An undefined key still goes into supabase-js's columns= list and PostgREST writes NULL instead of the
// default; requires_deposit is NOT NULL, so every quick-added service failed with 23502.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const dash = fs.readFileSync(new URL('./app/beautyos.jsx', import.meta.url), 'utf8');
const commit = dash.slice(dash.indexOf('const commitServiceDraft = async (tid) => {'), dash.indexOf('// 3. Existing — update only what actually differs.'));
assert.ok(commit.includes('for (const k of SERVICE_FIELDS) if (k !== "active" && s[k] !== undefined) row[k] = s[k];'), 'undefined fields are left out of the insert');
// the same rule, applied to the quick-add draft shape
const SERVICE_FIELDS = ['name', 'price', 'duration', 'description', 'field', 'color', 'active', 'requires_deposit'];
const draft = { name: 'מסכת', price: 180, duration: 60, color: '#F4A7B9', active: true, field: 'cosmetics', _new: true };
const row: Record<string, unknown> = { tenant_id: 't', active: true };
for (const k of SERVICE_FIELDS) if (k !== 'active' && (draft as Record<string, unknown>)[k] !== undefined) row[k] = (draft as Record<string, unknown>)[k];
assert.ok(!('requires_deposit' in row) && !('description' in row), 'no key for a value it does not have');
console.log('test-service-quick-add: ok');
