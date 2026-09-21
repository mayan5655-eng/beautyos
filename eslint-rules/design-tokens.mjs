// eslint-rules/design-tokens.mjs
//
// Refuses a raw number where a design token exists.
//
// The token file (app/globals.css) was good and almost nothing used it: 27
// distinct inline font sizes, 25 radii and 26 shadow recipes against eight,
// seven and seven tokens. scripts/tokenize-styles.mjs collapsed them once;
// this rule is what stops them creeping back one screen at a time.
//
// Flags, inside any object literal (which is how every inline style here is
// written):
//   fontSize: <number> | "<n>px"          -> use var(--t-*)
//   borderRadius: <number other than 0> | "<n>px"  -> use var(--r-*)
//   boxShadow: any string or template that is not var(--shadow-*) or "none"
//              (an `inset` shadow is a border and is allowed)
//
// Not flagged: "50%", multi-value radius strings ("16px 16px 4px 16px"),
// variables, expressions - only literals a person typed.

const TYPE_HINT = 'fontSize must be a type token: var(--t-xs|sm|md|lg|xl|2xl|3xl|hero). See app/globals.css.';
const RADIUS_HINT = 'borderRadius must be a radius token: var(--r-xs|sm|md|lg|xl|2xl|full), or 0. See app/globals.css.';
const SHADOW_HINT = 'boxShadow must be a shadow token: var(--shadow-xs|sm|md|lg|xl|glow|accent), or none. See app/globals.css.';

function keyName(prop) {
  if (prop.key.type === 'Identifier') return prop.key.name;
  if (prop.key.type === 'Literal') return String(prop.key.value);
  return null;
}

// A value may be a ternary (`sel ? a : b`) or a logical fallback (`a || b`);
// every branch is a value in its own right and is checked the same way.
function leaves(node) {
  if (!node) return [];
  if (node.type === 'ConditionalExpression') return [...leaves(node.consequent), ...leaves(node.alternate)];
  if (node.type === 'LogicalExpression') return [...leaves(node.left), ...leaves(node.right)];
  return [node];
}

export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'Inline styles use the declared design tokens for type, radius and shadow.' },
    schema: [],
    messages: { type: TYPE_HINT, radius: RADIUS_HINT, shadow: SHADOW_HINT },
  },
  create(context) {
    return {
      Property(node) {
        const name = keyName(node);
        if (!name) return;

        for (const v of leaves(node.value)) {
          if (name === 'fontSize') {
            if (v.type === 'Literal' && typeof v.value === 'number') context.report({ node: v, messageId: 'type' });
            if (v.type === 'Literal' && typeof v.value === 'string' && /^\d+(\.\d+)?px$/.test(v.value)) context.report({ node: v, messageId: 'type' });
          } else if (name === 'borderRadius') {
            if (v.type === 'Literal' && typeof v.value === 'number' && v.value !== 0) context.report({ node: v, messageId: 'radius' });
            if (v.type === 'Literal' && typeof v.value === 'string' && /^\d+(\.\d+)?px$/.test(v.value)) context.report({ node: v, messageId: 'radius' });
          } else if (name === 'boxShadow') {
            if (v.type === 'Literal' && typeof v.value === 'string') {
              const s = v.value.trim();
              if (s === 'none' || s.startsWith('var(--shadow-') || /inset/.test(s)) continue;
              context.report({ node: v, messageId: 'shadow' });
            } else if (v.type === 'TemplateLiteral') {
              const raw = v.quasis.map((q) => q.value.raw).join('${}');
              if (/inset/.test(raw)) continue;
              context.report({ node: v, messageId: 'shadow' });
            }
          }
        }
      },
    };
  },
};
