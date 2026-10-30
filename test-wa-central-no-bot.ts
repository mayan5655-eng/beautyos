// test-wa-central-no-bot.ts
//
// Owner's decision 2026-10-23 (overnight review item ד): no automatic AI replies on the central number, and a client who
// writes "הסר" is removed AND hears back - automatically when sending works, otherwise as an item in the business's manual queue.
// Source checks: both webhooks build a live Supabase client and an AI client at import time.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WA_TYPE_LABELS } from './lib/waStatusLabel.js';

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');

// GreenAPI webhook (today's central number).
const gw = rd('app/api/whatsapp-webhook/route.js');
const centralGate = gw.indexOf('botOff: "central"');
assert.ok(centralGate > 0, 'the central number has its own "no bot" exit');
assert.ok(/process\.env\.CENTRAL_BOT_ENABLED !== "1"/.test(gw), 'off unless CENTRAL_BOT_ENABLED=1 (a flag, nothing deleted)');
assert.ok(centralGate < gw.indexOf('await shouldBotReply(tenantId)'), 'decided before the tenant switch is read');
assert.ok(centralGate < gw.indexOf('await generateReply('), 'and before any AI call');
assert.ok(gw.indexOf('if (isOptOutReply(text)) {') < centralGate, '"הסר" is handled before the bot exit, so it still works');
assert.ok(/type: "marketing_optout_ack"/.test(gw), 'the acknowledgement goes through sendWhatsApp');

// The acknowledgement is a utility type now: sent for real when auto-send is on, the manual queue otherwise or on failure.
const wa = rd('lib/whatsapp.js');
const utility = wa.match(/const UTILITY_TYPES = new Set\(\[([^\]]*)\]\)/);
assert.ok(utility && /"marketing_optout_ack"/.test(utility[1]), 'marketing_optout_ack is a utility type');
assert.ok(!/"ai_agent_reply"/.test(utility![1]), 'bot replies stay manual');
assert.ok(!/"auto_winback"|"lead_bulk"/.test(utility![1]), 'outreach stays manual');

// Cloud webhook: still no bot, and a failed acknowledgement becomes a manual-queue item.
const cw = rd('app/api/wa-cloud/webhook/route.ts');
assert.ok(!/anthropic|trackedCreate|generateReply/i.test(cw), 'the Cloud webhook has no AI path');
assert.ok(/status: 'pending_manual'/.test(cw) && /message_type: 'marketing_optout_ack'/.test(cw), 'a failed ack is queued for her');

// The queue says what the item is.
assert.equal((WA_TYPE_LABELS as Record<string, string>).marketing_optout_ack, 'אישור הסרה מהרשימה');

console.log('wa central no bot: all checks passed');
