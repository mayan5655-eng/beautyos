// lib/ai/models.ts
//
// Which model writes what she reads. One place, so the decision is reviewable and
// a change is one line plus the guard in test-ai-models.ts.
//
// The principle (decided 2026-10-05, with the person who pays the bill): where a
// cosmetician JUDGES the output - her captions, her reel script, the advice she
// acts on, the picture brief behind her post - use the strongest model that stays
// well inside budget. Where nobody reads the output - voice intent, lead scoring,
// header mapping - stay on the cheap one. Realistic spend per tenant went from
// about $1.20 to about $3.00 a month for the text calls; see the commit message.
//
//   writer  Claude Opus 5.5    $4 / $20 per MTok   what she judges hardest
//   ideas   Claude Sonnet 5.5  $2 / $10 per MTok   lists of ideas - same price as
//                                                  the Sonnet 5 it replaces, newer
//   cheap   Claude Haiku 4.5   $1 / $5  per MTok   mechanical, high-volume, unread
//
// What the newer models need from the call (all enforced by test-ai-models.ts):
//   * thinking is always on, and counts against max_tokens - budgets must leave
//     room for it, or the JSON a route expects is cut off mid-object;
//   * so a call takes tens of seconds - the route needs an explicit maxDuration;
//   * no temperature/top_p/top_k, no thinking:{type:'disabled'}, no budget_tokens,
//     no forced tool_choice, no assistant prefill - all 400;
//   * set effort explicitly: Opus 5.5 defaults to medium, Sonnet 5.5 to high.
//   * every model here must be in MODEL_RATES (lib/ai/usage.ts) or its calls are
//     recorded unpriced and the dollar ceiling can only guess.

export const MODELS = {
  writer: 'claude-opus-5-5',
  ideas: 'claude-sonnet-5-5',
  cheap: 'claude-haiku-4-5',
} as const;

/**
 * Thinking depth per role. `medium` is Opus 5.5's own default and is strong for
 * writing; it is spelled out so a later default change cannot move cost or
 * latency unnoticed. Raise `writer` to 'high' to spend more on quality.
 */
export const EFFORT = {
  writer: 'medium',
  ideas: 'medium',
  // A chat answer she is waiting on. At medium the advisor took 26 s on production
  // (measured 2026-10-05) - too long to stare at a spinner; the extra thinking
  // buys little on a question about her own numbers. Raise it if answers feel thin.
  advisor: 'low',
} as const;
