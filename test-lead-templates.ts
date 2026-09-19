// test-lead-templates.ts
//
// Proves the bulk-send personalisation: the template keeps its placeholders
// until the send loop, and the send loop renders once per recipient. Plain
// node, no database, no network.
//
// The bug this guards against: {name} used to be substituted once at compose
// time, and a group send had no lead to substitute for, so every recipient got
// "לקוחה יקרה" while a single send from the drawer got her real name.

import {
  renderLeadTemplate,
  hasLeadPlaceholders,
  pickPreviewLead,
  DEFAULT_LEAD_TEMPLATES,
} from './lib/leads/templates.ts';

let passed = 0, failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; }
  else { failed++; console.error(`FAIL ${label}\n  expected ${e}\n  got      ${a}`); }
}

const settings = { business_name: 'קליניקת שירה' };
const tpl = 'היי {name}! כאן {clinic} 💕';

// ── renderLeadTemplate: one call, one recipient ────────────────────────────
eq(renderLeadTemplate(tpl, { name: 'רונית' }, settings), 'היי רונית! כאן קליניקת שירה 💕', 'name and clinic substituted');
eq(renderLeadTemplate(tpl, { name: '' }, settings), 'היי לקוחה יקרה! כאן קליניקת שירה 💕', 'empty name falls back');
eq(renderLeadTemplate(tpl, null, settings), 'היי לקוחה יקרה! כאן קליניקת שירה 💕', 'null lead falls back');
eq(renderLeadTemplate(tpl, { name: '  דנה  ' }, settings), 'היי דנה! כאן קליניקת שירה 💕', 'name is trimmed');
eq(renderLeadTemplate(tpl, { name: 'דנה' }, {}), 'היי דנה! כאן הקליניקה 💕', 'no business name falls back to the neutral clinic');
eq(renderLeadTemplate('{name} {name}', { name: 'מיכל' }, settings), 'מיכל מיכל', 'every occurrence is replaced');
eq(renderLeadTemplate('שלום, מחר בעשר', { name: 'מיכל' }, settings), 'שלום, מחר בעשר', 'a literal message passes through unchanged');
eq(renderLeadTemplate('', { name: 'מיכל' }, settings), '', 'empty text stays empty');

// ── The send loop: the same template, three recipients, three names ───────
// This is the shape of app/api/leads/send-bulk/route.js: the message arrives
// with its placeholders and is rendered inside the loop, per lead.
{
  const leads = [
    { id: '1', name: 'רונית', phone: '0501111111' },
    { id: '2', name: 'דנה', phone: '0502222222' },
    { id: '3', name: '', phone: '0503333333' },
  ];
  const sent = leads.map((l) => renderLeadTemplate(tpl, l, settings));
  eq(sent, [
    'היי רונית! כאן קליניקת שירה 💕',
    'היי דנה! כאן קליניקת שירה 💕',
    'היי לקוחה יקרה! כאן קליניקת שירה 💕',
  ], 'group send: each recipient gets her own name, the nameless one the fallback');
  eq(new Set(sent.slice(0, 2)).size, 2, 'two named recipients never get the same text');
}

// ── Every default template carries {name}, so every default is personalised ─
for (const [key, text] of Object.entries(DEFAULT_LEAD_TEMPLATES)) {
  eq(hasLeadPlaceholders(text), true, `default template "${key}" has a placeholder`);
  eq(renderLeadTemplate(text, { name: 'נועה' }, settings).includes('{'), false, `default template "${key}" renders with no brace left`);
}

// ── hasLeadPlaceholders: decides whether the composer shows a preview ──────
eq(hasLeadPlaceholders('היי {name}'), true, '{name} counts');
eq(hasLeadPlaceholders('מ{clinic}'), true, '{clinic} counts');
eq(hasLeadPlaceholders('היי {שם}'), false, 'an unknown placeholder does not count');
eq(hasLeadPlaceholders('שלום'), false, 'plain text has none');
eq(hasLeadPlaceholders(''), false, 'empty has none');
eq(hasLeadPlaceholders(null), false, 'null has none');

// ── pickPreviewLead: the first recipient who would actually get it ─────────
{
  const leads = [
    { id: 'a', name: 'ללא טלפון', phone: '' },
    { id: 'b', name: 'ראשונה', phone: '0501111111' },
    { id: 'c', name: 'שנייה', phone: '0502222222' },
  ];
  eq(pickPreviewLead(leads)?.id, 'b', 'skips the lead with no phone');
  eq(pickPreviewLead([leads[0]]), null, 'nobody reachable gives null');
  eq(pickPreviewLead([]), null, 'empty group gives null');
  eq(pickPreviewLead(null), null, 'null group gives null');
  eq(pickPreviewLead([{ id: 'x', name: 'לבד', phone: '0509999999' }])?.id, 'x', 'a single lead previews herself');
  // A group with nobody reachable previews with the neutral fallback rather
  // than crashing or showing braces.
  eq(renderLeadTemplate(tpl, pickPreviewLead([leads[0]]), settings), 'היי לקוחה יקרה! כאן קליניקת שירה 💕', 'null preview renders the fallback');
}

console.log(`test-lead-templates: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
