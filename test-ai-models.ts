// The model choices, and the three ways an upgrade quietly goes wrong.
//
// Which model writes what she reads is a product decision (lib/ai/models.ts).
// This file is the guard around it, because moving a call to a stronger model
// breaks in ways that look like success:
//
//   1. UNPRICED - a model missing from MODEL_RATES records cost_usd NULL, which
//      the dollar ceiling can only guess at (it assumes $0.05). A stronger model
//      costs more per call, so the guess is too LOW exactly when it matters.
//   2. TRUNCATED - the newer models think before they answer, and the thinking
//      counts against max_tokens. A budget sized for the old model (3,000 tokens)
//      gets eaten by thinking, the JSON the route expects is cut off mid-object,
//      and she sees "the AI could not do that" for a request that was fine.
//   3. TIMED OUT - the same thinking makes a call take tens of seconds. A route
//      with no maxDuration inherits the platform default (10-15 s), and the
//      request dies mid-thought with nothing recorded.
//   4. REJECTED - Opus 5.5 / Sonnet 5.5 return 400 for temperature/top_p/top_k,
//      for thinking:{type:'disabled'} or budget_tokens, for tool_choice any/tool
//      and for an assistant prefill. Nothing here sends them; this keeps it so.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MODEL_RATES } from './lib/ai/usage.ts';
import { MODELS, EFFORT } from './lib/ai/models.ts';

const code = (f: string) => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const walk = (dir: string, out: string[] = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(e.name)) out.push(p);
  }
  return out;
};
const sources = [...walk('app/api'), ...walk('lib/ai'), ...walk('lib/leads')];

// 1. every model the code can send has a price -------------------------------
const used = new Set<string>();
for (const f of sources) for (const m of code(f).matchAll(/['"`](claude-[a-z0-9.-]+)['"`]/g)) used.add(m[1]);
for (const m of Object.values(MODELS)) used.add(m);
for (const m of used) assert.ok(MODEL_RATES[m], `model "${m}" is used but has no entry in MODEL_RATES - its calls would be recorded unpriced`);
assert.equal(MODEL_RATES['claude-opus-5-5'].input, 4);
assert.equal(MODEL_RATES['claude-opus-5-5'].output, 20);
assert.equal(MODEL_RATES['claude-sonnet-5-5'].output, 10);

// 2 & 3. call sites on the thinking models: output budget, effort, time limit ----
// [file, expected model, route file that must declare maxDuration (or null)]
const SITES: [string, string, string | null][] = [
  ['lib/ai/postGenerator.ts', MODELS.writer, 'app/api/designs/generate/route.ts'],
  ['lib/ai/creativeDirector.ts', MODELS.writer, 'app/api/designs/ai-fill/route.ts'],
  ['app/api/marketing/reel/route.ts', MODELS.writer, 'app/api/marketing/reel/route.ts'],
  ['app/api/advisor/route.ts', MODELS.writer, 'app/api/advisor/route.ts'],
  ['lib/ai/marketingAI.ts', MODELS.ideas, 'app/api/marketing/groups/route.ts'],
  ['app/api/marketing/shooting-list/route.ts', MODELS.ideas, 'app/api/marketing/shooting-list/route.ts'],
];
for (const [file, model, route] of SITES) {
  const src = code(file);
  assert.ok(src.includes('MODELS.') , `${file} takes its model from lib/ai/models.ts, not a string literal`);
  assert.ok(!/model:\s*['"`]claude-/.test(src), `${file} must not hard-code a model`);
  const tokens = [...src.matchAll(/max_tokens:\s*([0-9_]+)/g)].map((m) => Number(m[1].replace(/_/g, '')));
  assert.ok(tokens.length > 0 && tokens.every((n) => n >= 8000), `${file}: max_tokens ${tokens} is too small once the model thinks first (need >= 8000)`);
  assert.ok(/output_config:\s*\{[^}]*effort:/.test(src), `${file} sets output_config.effort explicitly (Opus 5.5 defaults to medium, Sonnet 5.5 to high)`);
  if (route) {
    const m = /export const maxDuration\s*=\s*([0-9]+)/.exec(code(route));
    assert.ok(m && Number(m[1]) >= 60, `${route} needs maxDuration >= 60: a thinking model can take 20+ s and the platform default is 10-15 s`);
  }
  void model;
}
assert.equal(MODELS.writer, 'claude-opus-5-5');
assert.equal(MODELS.ideas, 'claude-sonnet-5-5');
assert.ok(['low', 'medium', 'high', 'xhigh', 'max'].includes(EFFORT.writer));

// 4. nothing sends what these models reject -------------------------------------
for (const f of sources) {
  const src = code(f);
  assert.ok(!/\b(temperature|top_p|top_k)\s*:/.test(src), `${f} sends a sampling parameter (400 on Opus 5.5 / Sonnet 5.5)`);
  assert.ok(!/thinking:\s*\{\s*type:\s*['"]disabled['"]/.test(src), `${f} disables thinking (400 on Opus 5.5 / Sonnet 5.5)`);
  assert.ok(!/budget_tokens/.test(src), `${f} uses budget_tokens (removed on the current models)`);
  assert.ok(!/tool_choice:\s*\{\s*type:\s*['"](any|tool)['"]/.test(src), `${f} forces tool use (400 on Opus 5.5 / Sonnet 5.5)`);
}

// The cheap mechanical calls stay on the cheap model: nobody reads them.
for (const f of ['app/api/voice-intent/route.ts', 'lib/ai/scoreLeads.ts', 'lib/leads/mapHeaders.ts']) {
  assert.ok(!/MODELS\.(writer|ideas)/.test(code(f)), `${f} is a mechanical call and stays on the cheap model`);
}

console.log('ai models: ok');
