// lib/ai/marketingAI.ts: the shared business-context builder and the
// business_fields persona label every marketing prompt threads through it.
import assert from 'node:assert/strict';
import { buildBusinessContext, personaLabel, GROUNDING_RULES } from './lib/ai/marketingAI.ts';

// ── personaLabel ─────────────────────────────────────────────────────────────
assert.equal(personaLabel(), 'קוסמטיקאית', 'unset reads as the long-standing default');
assert.equal(personaLabel([]), 'קוסמטיקאית', 'empty reads the same as unset');
assert.equal(personaLabel(['cosmetics']), 'קוסמטיקאית');
assert.equal(personaLabel(['nails']), 'מניקוריסטית');
assert.equal(personaLabel(['cosmetics', 'nails']), 'קוסמטיקאית ומניקוריסטית');

// ── buildBusinessContext: the persona label threads through, everything else is unchanged ──
assert.equal(
  buildBusinessContext({ therapist_name: 'מאיה' }),
  'שם הקוסמטיקאית: מאיה',
  'no fields set: byte-identical to the hardcoded string every prompt used before business_fields existed'
);
assert.equal(buildBusinessContext({ therapist_name: 'מאיה', fields: ['nails'] }), 'שם המניקוריסטית: מאיה');
assert.equal(
  buildBusinessContext({}),
  'אין מידע על העסק - יש לתת המלצות כלליות לקוסמטיקאית בישראל.',
  'the empty-profile fallback is also unchanged for the default field'
);
assert.equal(
  buildBusinessContext({ fields: ['nails'] }),
  'אין מידע על העסק - יש לתת המלצות כלליות למניקוריסטית בישראל.'
);

// GROUNDING_RULES stays a single unconditional constant — the Botox/filler
// ban costs a nails-only business nothing, so it is never gated by field.
assert.match(GROUNDING_RULES, /בוטוקס/);
assert.match(GROUNDING_RULES, /כללי דיוק/);

console.log('marketing ai: ok');
