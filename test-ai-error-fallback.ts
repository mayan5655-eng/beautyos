// An AI failure we do not recognise must reach her as one short Hebrew line, never as the SDK's raw English. The advisor and
// the voice commands are the two routes that used to pass err.message straight through.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AI_BUSY_FALLBACK_HE, userMessageForAiError } from './lib/ai/aiErrorResponse.ts';
import { AiCapExceededError, AiCapUnavailableError, AiProviderUnavailableError, DemoBlockedError, isProviderUnavailable } from './lib/ai/callCaps.ts';

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

const sdk = (status: number, body: string) => Object.assign(new Error(`${status} ${body}`), { status });
const RAW_ERRORS: Error[] = [
  sdk(529, '{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"},"request_id":"req_011CTx"}'),
  sdk(429, '{"type":"error","error":{"type":"rate_limit_error","message":"This request would exceed your organization\'s rate limit"}}'),
  sdk(500, '{"type":"error","error":{"type":"api_error","message":"Internal server error"}}'),
  new Error('Request timed out.'),
  new Error('Connection error.'),
  new Error('fetch failed'),
  new Error('terminated'),
  new Error(''),
  Object.assign(new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"max_tokens: 99999 > 8192"}}'), { status: 400 }),
  new Error('שגיאה בקריאה {"type":"error"} request_id req_1'), // Hebrew start but provider JSON inside: still raw
];

ok('an unrecognised provider error becomes the Hebrew fallback and never contains the raw English', () => {
  assert.equal(AI_BUSY_FALLBACK_HE, 'יש עומס רגעי, נסי שוב עוד רגע');
  for (const e of RAW_ERRORS) {
    const m = userMessageForAiError(e);
    assert.equal(m, AI_BUSY_FALLBACK_HE, e.message);
    assert.doesNotMatch(m, /[A-Za-z]{3,}/);
    assert.ok(!m.includes(e.message) || e.message === '');
  }
  for (const odd of ['plain string', null, undefined, 42, { message: 'Overloaded' }]) {
    assert.equal(userMessageForAiError(odd), AI_BUSY_FALLBACK_HE);
  }
});

ok('credit-too-low and invalid-key keep being detected as before, and their Hebrew message is unchanged', () => {
  assert.equal(isProviderUnavailable(sdk(400, '{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing"}}')), true);
  assert.equal(isProviderUnavailable(sdk(401, '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}')), true);
  // an overloaded error is NOT one of them: it is exactly what the fallback is for
  assert.equal(isProviderUnavailable(sdk(529, '{"type":"error","error":{"type":"overloaded_error"}}')), false);
  const provider = new AiProviderUnavailableError('advisor');
  assert.equal(userMessageForAiError(provider), provider.message);
  assert.match(provider.message, /ה-AI לא זמין כרגע בצד שלנו/);
});

ok('our own refusals keep their exact Hebrew message (caps, counter unreadable, demo)', () => {
  for (const e of [new AiCapExceededError('advisor', 400, 400), new AiCapUnavailableError('advisor'), new DemoBlockedError('voice-intent')]) {
    assert.equal(userMessageForAiError(e), e.message);
    assert.notEqual(userMessageForAiError(e), AI_BUSY_FALLBACK_HE);
  }
});

ok('a Hebrew message the route wrote itself is kept (for example "לא התקבלה תשובה")', () => {
  assert.equal(userMessageForAiError(new Error('לא התקבלה תשובה')), 'לא התקבלה תשובה');
});

ok('advisor: both error paths (the stream and the outer catch) use the helper, and none sends err.message', () => {
  const a = rd('app/api/advisor/route.ts');
  assert.match(a, /import \{ userMessageForAiError \} from '@\/lib\/ai\/aiErrorResponse'/);
  assert.match(a, /controller\.enqueue\(line\(\{ t: 'error', error: userMessageForAiError\(err\) \}\)\)/);
  assert.match(a, /console\.error\('Error in \/api\/advisor:', err\)\s*\n\s*return NextResponse\.json\(\{ error: userMessageForAiError\(err\) \}, \{ status: 500 \}\)/);
  assert.match(a, /console\.error\('Error streaming \/api\/advisor:', err\)/); // the full error still goes to the server log
  assert.doesNotMatch(a, /error: err\??\.message \|\| 'שגיאה'/);
});

ok('voice commands: the catch uses the helper, logs the full error first, never sends err.message', () => {
  const v = rd('app/api/voice-intent/route.ts');
  assert.match(v, /import \{ userMessageForAiError \} from '@\/lib\/ai\/aiErrorResponse'/);
  assert.match(v, /console\.error\('Error in \/api\/voice-intent:', err\)\s*\n\s*return NextResponse\.json\(\{ error: userMessageForAiError\(err\) \}, \{ status: 500 \}\)/);
  assert.doesNotMatch(v, /error: err\??\.message/);
});

ok('nothing about caps, the usage counter or alerting was touched', () => {
  const h = rd('lib/ai/aiErrorResponse.ts');
  assert.doesNotMatch(h, /checkAiAllowance|raiseOpsAlert|recordUsage|trackedCreate/);
  assert.match(rd('lib/ai/callCaps.ts'), /failing CLOSED/);
});

console.log(`${n} passed`);
