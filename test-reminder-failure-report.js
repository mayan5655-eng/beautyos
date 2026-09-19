// test-reminder-failure-report.js
//
// Proves lib/reminders/failureReport.js with a fake sender: who gets told when
// a reminder fails, who does not, and that nothing here can take the reminder
// run down with it. Plain node, no database, no network.

import {
  groupReminderResults,
  formatOwnerReport,
  formatOperatorReport,
  reportReminderFailures,
  STATUS_FAILED,
  STATUS_NO_PHONE,
  TYPE_OWNER,
  TYPE_OPERATOR,
} from './lib/reminders/failureReport.js';

let passed = 0, failed = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; }
  else { failed++; console.error(`FAIL ${label}\n  expected ${e}\n  got      ${a}`); }
}
function ok(cond, label) { eq(!!cond, true, label); }

const DATE = '2026-09-21';
const quiet = { warn() {}, error() {} };

// The shape send-reminders pushes, one row per appointment.
const results = [
  { name: 'רונית', status: 'נשלח', tenantId: 'A', time: '10:00' },
  { name: 'דנה', status: STATUS_FAILED, tenantId: 'A', time: '14:30' },
  { name: 'מיכל', status: STATUS_NO_PHONE, tenantId: 'A', time: '16:00' },
  { name: 'נועה', status: 'נשלח', tenantId: 'B', time: '09:00' },
  { name: 'שירה', status: STATUS_FAILED, tenantId: 'C', time: '11:00' },
  { name: 'יעל', status: STATUS_FAILED, tenantId: 'C', time: '12:00' },
  { name: 'תמר', status: 'מושהה (השהיית אוטומציות)', tenantId: 'D', time: '13:00' },
  { name: 'ללא עסק', status: STATUS_FAILED, time: '13:00' },
];

// ── Grouping ───────────────────────────────────────────────────────────────
{
  const g = groupReminderResults(results);
  eq([...g.keys()].sort(), ['A', 'C'], 'only tenants with a failure or a missing phone are grouped');
  eq(g.get('A').failed, [{ name: 'דנה', time: '14:30' }], 'A: one failed send');
  eq(g.get('A').noPhone, [{ name: 'מיכל', time: '16:00' }], 'A: one missing phone');
  eq(g.get('C').failed.length, 2, 'C: two failed sends');
  eq(g.get('C').noPhone, [], 'C: no missing phones');
  eq(groupReminderResults([]).size, 0, 'empty run groups nothing');
  eq(groupReminderResults(null).size, 0, 'null run groups nothing');
  eq(groupReminderResults([{ name: '', status: STATUS_FAILED, tenantId: 'Z' }]).get('Z').failed, [{ name: 'לקוחה', time: '' }], 'a nameless row gets a neutral name');
}

// ── The owner's message ────────────────────────────────────────────────────
{
  eq(formatOwnerReport({ date: DATE, failed: [], noPhone: [] }), null, 'nothing to report means no message, not an all-clear');
  const one = formatOwnerReport({ date: DATE, failed: [{ name: 'דנה', time: '14:30' }], noPhone: [] });
  ok(one.includes('תזכורת אחת לא נשלחה'), 'singular wording for one failure');
  ok(one.includes('• דנה — 14:30'), 'the failed client and her time are named');
  ok(one.includes('ידנית'), 'tells her to send by hand');
  ok(!one.includes('ללא מספר'), 'no missing-phone section when there are none');
  const two = formatOwnerReport({ date: DATE, failed: [{ name: 'א', time: '1' }, { name: 'ב', time: '2' }], noPhone: [{ name: 'ג', time: '' }] });
  ok(two.includes('2 תזכורות לא נשלחו'), 'plural wording for two failures');
  ok(two.includes('תור אחד ללא מספר טלפון'), 'singular missing-phone wording');
  ok(two.includes('• ג\n'), 'a row with no time has no dash');
  ok(!two.includes('\n\n\n'), 'no double blank lines');
  const phoneOnly = formatOwnerReport({ date: DATE, failed: [], noPhone: [{ name: 'ג', time: '9:00' }] });
  ok(phoneOnly && !phoneOnly.includes('לא נשלח'), 'missing phones alone do not claim a send failed');
}

// ── The operator's line ────────────────────────────────────────────────────
{
  const g = groupReminderResults(results);
  const line = formatOperatorReport({ date: DATE, byTenant: g });
  ok(line.includes('3 לא נשלחו'), 'counts every failed send across tenants');
  ok(line.includes('2 עסקים'), 'counts the tenants that had one');
  const phoneOnly = groupReminderResults([{ name: 'x', status: STATUS_NO_PHONE, tenantId: 'A' }]);
  eq(formatOperatorReport({ date: DATE, byTenant: phoneOnly }), null, 'a missing phone is not an outage');
  const single = groupReminderResults([{ name: 'x', status: STATUS_FAILED, tenantId: 'A' }]);
  ok(formatOperatorReport({ date: DATE, byTenant: single }).includes('עסק אחד'), 'singular tenant wording');
}

// ── Sending: who gets a message ────────────────────────────────────────────
{
  const sent = [];
  const send = async (phone, text, opts) => { sent.push({ phone, text, opts }); return { ok: true }; };
  const settingsByTenant = {
    A: { business_phone: '050-1111111' },
    B: { business_phone: '050-2222222' },
    C: { business_phone: '' },          // never gave a number
  };
  const summary = await reportReminderFailures({ results, date: DATE, settingsByTenant, send, operatorPhone: '0509999999', log: quiet });

  const owners = sent.filter((s) => s.opts.type === TYPE_OWNER);
  eq(owners.length, 1, 'exactly one owner message: A had failures, B was clean, C has no number');
  eq(owners[0].phone, '050-1111111', 'sent to A\'s business_phone as stored');
  eq(owners[0].opts.tenantId, 'A', 'logged under A\'s tenant');
  ok(owners[0].text.includes('דנה'), 'A\'s message names the failed client');
  ok(!owners[0].text.includes('שירה'), 'A\'s message never names C\'s client');

  const ops = sent.filter((s) => s.opts.type === TYPE_OPERATOR);
  eq(ops.length, 1, 'one operator line');
  eq(ops[0].phone, '0509999999', 'to the operator number');
  eq(ops[0].opts.tenantId, undefined, 'operator line is not attributed to a tenant');

  eq(summary.owners, [{ tenantId: 'A', status: 'sent' }, { tenantId: 'C', status: 'no_owner_phone' }], 'summary says who was told and who could not be');
  eq(summary.operator, 'sent', 'summary records the operator send');
}

// ── Nothing failed: nobody is messaged ─────────────────────────────────────
{
  const sent = [];
  const send = async (...a) => { sent.push(a); return { ok: true }; };
  const clean = [{ name: 'x', status: 'נשלח', tenantId: 'A' }];
  const summary = await reportReminderFailures({ results: clean, date: DATE, settingsByTenant: { A: { business_phone: '0501111111' } }, send, operatorPhone: '0509999999', log: quiet });
  eq(sent.length, 0, 'a clean run sends nothing at all');
  eq(summary, { owners: [], operator: null }, 'and says so');
}

// ── No operator number: owners still told, operator recorded as unreachable ─
{
  const sent = [];
  const send = async (phone, text, opts) => { sent.push(opts.type); return { ok: true }; };
  const summary = await reportReminderFailures({ results, date: DATE, settingsByTenant: { A: { business_phone: '0501111111' } }, send, operatorPhone: '', log: quiet });
  eq(sent, [TYPE_OWNER], 'owner message goes out without an operator number');
  eq(summary.operator, 'no_operator_phone', 'operator marked unreachable, not failed');
}

// ── A sender that throws or refuses never escapes ──────────────────────────
{
  const send = async (phone, text, opts) => {
    if (opts.type === TYPE_OWNER) throw new Error('GreenAPI down');
    return { ok: false };
  };
  let threw = false;
  let summary;
  try {
    summary = await reportReminderFailures({ results, date: DATE, settingsByTenant: { A: { business_phone: '0501111111' } }, send, operatorPhone: '0509999999', log: quiet });
  } catch { threw = true; }
  eq(threw, false, 'a throwing sender is contained');
  eq(summary.owners, [{ tenantId: 'A', status: 'failed' }, { tenantId: 'C', status: 'no_owner_phone' }], 'the throw is recorded as a failed owner send');
  eq(summary.operator, 'failed', 'a refused operator send is recorded as failed');
}

// ── An unusable owner number is treated as none ────────────────────────────
{
  const sent = [];
  const send = async (phone, text, opts) => { sent.push(opts.type); return { ok: true }; };
  const summary = await reportReminderFailures({ results, date: DATE, settingsByTenant: { A: { business_phone: 'abc' } }, send, operatorPhone: '', log: quiet });
  eq(sent, [], 'junk business_phone: no owner send attempted');
  eq(summary.owners[0], { tenantId: 'A', status: 'no_owner_phone' }, 'recorded as no owner phone');
}

console.log(`test-reminder-failure-report: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
