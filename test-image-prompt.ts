// The Creative Director contract: whatever the spec says, the picture is
// asked for with no typography, the negative space follows the choice, and
// an offer's digits never reach the model.
import assert from 'node:assert/strict';
import { composeImagePrompt, FORMAT_SIZES, HARD_CONSTRAINTS, MAX_PROMPT_CHARS, stripDigits } from './lib/ai/imagePrompt.ts';
import { IMAGE_QUALITIES, DEFAULT_IMAGE_MODEL } from './lib/ai/openaiImages.ts';
import { MODEL_RATES, computeCost } from './lib/ai/usage.ts';
import { MONTHLY_CALL_CAPS } from './lib/ai/callCaps.ts';
import { RATE_POLICIES } from './lib/rateLimit.ts';

// Sizes: the 4:5 feed default and only sizes the model documents as valid
// (multiples of 16, ratio between 1:3 and 3:1).
assert.equal(FORMAT_SIZES.feed45, '1024x1280');
for (const s of Object.values(FORMAT_SIZES)) {
  const [w, h] = s.split('x').map(Number);
  assert.ok(w % 16 === 0 && h % 16 === 0, `${s} is a multiple of 16`);
  const ratio = w / h;
  assert.ok(ratio >= 1 / 3 && ratio <= 3, `${s} ratio in range`);
}

// The hard constraint is always the last thing the model reads.
const p = composeImagePrompt({ request: 'טיפול פנים קלאסי', offer: 'במבצע 249 ₪', direction: { negativeSpace: 'bottom' } });
assert.ok(p.endsWith(HARD_CONSTRAINTS), 'constraints close the prompt');
assert.ok(/no text/i.test(p) && /no logos/i.test(p) && /no watermarks/i.test(p) && /no price/i.test(p), 'typography banned');
assert.ok(/bottom third/.test(p), 'negative space follows the choice');
assert.ok(!/249/.test(p), 'the price digits never reach the model');
assert.equal(stripDigits('במבצע 249 ₪ עד 30.9'), 'במבצע ₪ עד');

const top = composeImagePrompt({ request: 'x', direction: { negativeSpace: 'top' } });
assert.ok(/top third/.test(top) && !/bottom third/.test(top));
const none = composeImagePrompt({ request: 'x', direction: { negativeSpace: 'none' } });
assert.ok(!/third of the frame/.test(none));

// Brand kit and variation reach the prompt.
const v = composeImagePrompt({ request: 'x', brandKit: { primaryColor: '#C9A24B', visualStyle: 'luxury', avoid: 'red lipstick' }, variation: { index: 2, hint: 'closer crop' } });
assert.ok(/#C9A24B/.test(v) && /luxury/.test(v) && /red lipstick/.test(v) && /Variation 3/.test(v) && /closer crop/.test(v));

// A runaway spec is cut, but never the constraints.
const long = composeImagePrompt({ request: 'א'.repeat(6000) });
assert.ok(long.length <= MAX_PROMPT_CHARS && long.endsWith(HARD_CONSTRAINTS));

// Money: the default model is priced, so cost never lands as null.
assert.equal(DEFAULT_IMAGE_MODEL, 'gpt-image-2.5-sunburst');
assert.ok(MODEL_RATES[DEFAULT_IMAGE_MODEL], 'default image model has a rate');
const cost = computeCost(DEFAULT_IMAGE_MODEL, 500, 4160);
assert.ok(cost !== null && cost > 0.1 && cost < 0.2, `a high 1024x1280 image costs about 13 cents (${cost})`);
assert.ok(IMAGE_QUALITIES.includes('xhigh') && IMAGE_QUALITIES.includes('max'));

// Guards exist by name.
assert.ok(MONTHLY_CALL_CAPS['creatives/test-image'] > 0);
assert.ok(RATE_POLICIES['creatives'].perTenant.limit > 0);

// The key stays on the server: no file that can reach the browser names it,
// and only lib/ai/openaiImages.ts reads it.
import fs from 'node:fs';
import path from 'node:path';
function walk(dir: string, out: string[] = []): string[] {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) { if (n !== 'node_modules' && n !== '.next') walk(p, out); }
    else if (/\.(jsx?|tsx?|mjs)$/.test(n)) out.push(p);
  }
  return out;
}
const readers = [...walk('app'), ...walk('lib')].filter((f) => /OPENAI_API_KEY/.test(fs.readFileSync(f, 'utf8')));
assert.deepEqual(readers.map((f) => f.replace(/\\/g, '/')), ['lib/ai/openaiImages.ts'], 'only the server module reads the key');
const clientFiles = walk('app').filter((f) => !/[\\/]api[\\/]/.test(f) && /openaiImages|OPENAI_/.test(fs.readFileSync(f, 'utf8')));
assert.deepEqual(clientFiles, [], 'no client-side file touches the OpenAI module');

console.log('image prompt: ok');
