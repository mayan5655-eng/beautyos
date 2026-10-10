// The marketing routes (reel, groups, shooting-list) map an AI refusal to a status and a sentence.
// Before lib/ai/aiErrorResponse.ts they answered a bare 500 (or, for groups, an empty list that looked
// like "no suggestions"). Same classes, same statuses as designs/ai-fill.
import assert from 'node:assert/strict';
import { mapAiError, isAiRefusal } from './lib/ai/aiErrorResponse.ts';
import { AiCapExceededError, AiCapUnavailableError, AiProviderUnavailableError, DemoBlockedError } from './lib/ai/callCaps.ts';
import { UngroundedClaimsError } from './lib/ai/claimsGuard.ts';

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

ok('cap used up is 429 and keeps the warm message', () => {
  const e = new AiCapExceededError('marketing/groups', 150, 150, 'calls');
  const m = mapAiError(e);
  assert.equal(m?.status, 429);
  assert.equal(m?.message, e.message);
});
ok('unreadable counter is 503', () => assert.equal(mapAiError(new AiCapUnavailableError('marketing/reel'))?.status, 503));
ok('provider refusing is 503', () => assert.equal(mapAiError(new AiProviderUnavailableError('marketing/reel'))?.status, 503));
ok('demo tenant is 403', () => assert.equal(mapAiError(new DemoBlockedError('marketing/groups'))?.status, 403));
ok('ungrounded claims is 422', () => {
  const e = new UngroundedClaimsError(['x']);
  assert.equal(mapAiError(e)?.status, 422);
});
ok('anything else is not mapped', () => {
  assert.equal(mapAiError(new Error('boom')), null);
  assert.equal(mapAiError('nope'), null);
  assert.equal(isAiRefusal(new Error('boom')), false);
  assert.equal(isAiRefusal(new DemoBlockedError('x')), true);
});

console.log(`${n} passed`);
