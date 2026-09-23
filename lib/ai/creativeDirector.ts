// lib/ai/creativeDirector.ts
//
// The Creative Director: one server-side engine that turns her brief
// ("טיפול פנים קלאסי במבצע 249 ₪") into (a) the words a template needs,
// (b) the post copy around it, and (c) three creative directions, each with
// a professional brief for the image model. It reads the same business
// profile every marketing prompt reads (lib/ai/loadBusinessProfile), obeys
// the same GROUNDING_RULES (no invented treatments, prices, claims), and is
// metered through trackedCreate like every Claude call.
//
// AI is ONE way to fill a template. The output is plain values keyed by the
// template's own variables; the fill form treats them exactly like typed
// text, and she can change every word.
//
// The picture never carries typography. imagePromptForDirection() goes
// through lib/ai/imagePrompt, which strips digits from the offer and closes
// every prompt with the ban on text, prices, logos, CTAs and watermarks.

import Anthropic from '@anthropic-ai/sdk';
import { trackedCreate } from './usage.ts';
import { GROUNDING_RULES, buildBusinessContext, parseClaudeJSON, type BusinessProfile } from './marketingAI.ts';
import { composeImagePrompt, type ImageFormat, type NegativeSpace } from './imagePrompt.ts';
import type { Template } from '../design/contract.ts';

export const DIRECTOR_MODEL = 'claude-sonnet-5';
export const DIRECTOR_CALL_SITE = 'creatives/direct';

export type Direction = {
  name: string;
  concept: string;
  composition: string;
  negativeSpace: NegativeSpace;
  palette: string[];
  /** English description of the picture, no text in it. */
  imageSubject: string;
};

export type DirectorOutput = {
  values: Record<string, string>;
  copy: { text: string; hashtags: string[] };
  directions: Direction[];
};

/** The look the director refuses by default, in the image model's language. */
export const DIRECTOR_AVOID =
  'generic stock-photo look, generic spa imagery, random pink flowers, plastic or over-smoothed skin, ' +
  'obvious AI look, cluttered composition, exaggerated retouching';

const clean = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/** Which of the template's variables the director may fill: what she would type herself. */
export function fillableVariables(template: Template) {
  return template.variables.filter((v) => v.source === 'user' || v.source === 'static');
}

export function buildDirectorPrompt(profile: BusinessProfile, template: Template, brief: string): string {
  const vars = fillableVariables(template)
    .map((v) => `  "${v.key}": "${v.label}${v.kind === 'price' ? ' (מחיר, למשל ₪249)' : v.kind === 'cta' ? ' (קריאה לפעולה קצרה)' : ''}${v.maxLength ? `, עד ${v.maxLength} תווים` : ''}"`)
    .join(',\n');
  return `את קריאייטיב דיירקטורית ומנהלת קמפיינים בכירה לעסקי יופי בישראל. קוסמטיקאית כתבה בקשה קצרה, ואת בונה ממנה פוסט שלם: הטקסטים שנכנסים לתבנית עיצוב, הטקסט לפוסט עצמו, ושלושה כיוונים ויזואליים לצלמת.

== פרטי העסק ==
${buildBusinessContext(profile)}

== הבקשה שלה ==
${clean(brief)}

== התבנית שהיא בחרה ==
${template.name}: ${template.description}
${GROUNDING_RULES}

== כללי הוויזואל (מחייבים) ==
- התמונה עצמה לעולם לא מכילה טקסט, מספרים, מחיר, לוגו או כפתור. כל אלה נכנסים אחר כך כשכבת עיצוב.
- תיאור התמונה (imageSubject) נכתב באנגלית, כמו בריף לצלמת אופנה: נושא, סט, אור, עדשה, רגש. עור אמיתי עם מרקם.
- להימנע כברירת מחדל מ: מראה סטוק גנרי, ספא גנרי, פרחים ורודים אקראיים, עור פלסטיק, מראה AI מוגזם, קומפוזיציה עמוסה.
- negativeSpace: איפה נשאר מקום נקי לכותרת, "top" או "bottom".

== המשימה ==
החזירי JSON בלבד, בלי markdown, בלי טקסט לפני או אחרי:
{
  "values": {
${vars}
  },
  "copy": {
    "text": "טקסט הפוסט המלא בעברית, 3-6 שורות, בטון של העסק, בלי אימוג'י מיותרים",
    "hashtags": ["#האשטג1", "#האשטג2", "#האשטג3", "#האשטג4", "#האשטג5"]
  },
  "directions": [
    { "name": "שם קצר לכיוון", "concept": "הרעיון במשפט אחד בעברית", "composition": "framing, subject, light, lens - in English", "negativeSpace": "bottom", "palette": ["#hex", "#hex"], "imageSubject": "the picture, in English, no text anywhere in it" },
    { ... כיוון שני, שונה באמת מהראשון ... },
    { ... כיוון שלישי ... }
  ]
}
ערכים ב-values בעברית, קצרים, מדויקים לתבנית. מחיר רק אם הופיע בבקשה או ברשימת השירותים.`;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Strict shape check. Throws on anything the UI could not use safely. */
export function parseDirectorOutput(template: Template, text: string): DirectorOutput {
  const raw = parseClaudeJSON<Record<string, unknown>>(text);
  if (!raw || typeof raw !== 'object') throw new Error('director: not an object');

  const allowed = new Map(fillableVariables(template).map((v) => [v.key, v]));
  const values: Record<string, string> = {};
  const rv = raw.values && typeof raw.values === 'object' ? (raw.values as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(rv)) {
    const def = allowed.get(k);
    if (!def) continue;
    let s = clean(v);
    if (def.maxLength && s.length > def.maxLength) s = s.slice(0, def.maxLength).trim();
    if (s) values[k] = s;
  }

  const rc = raw.copy && typeof raw.copy === 'object' ? (raw.copy as Record<string, unknown>) : {};
  const copy = {
    text: String(rc.text ?? '').trim().slice(0, 1200),
    hashtags: (Array.isArray(rc.hashtags) ? rc.hashtags : []).map(clean).filter((h) => /^#\S{1,40}$/.test(h)).slice(0, 8),
  };

  const rd = Array.isArray(raw.directions) ? raw.directions : [];
  const directions: Direction[] = [];
  for (const d of rd) {
    if (!d || typeof d !== 'object') continue;
    const o = d as Record<string, unknown>;
    const imageSubject = clean(o.imageSubject).slice(0, 800);
    if (!imageSubject) continue;
    directions.push({
      name: clean(o.name).slice(0, 40) || `כיוון ${directions.length + 1}`,
      concept: clean(o.concept).slice(0, 240),
      composition: clean(o.composition).slice(0, 400),
      negativeSpace: o.negativeSpace === 'top' ? 'top' : 'bottom',
      palette: (Array.isArray(o.palette) ? o.palette : []).map(clean).filter((h) => HEX.test(h)).slice(0, 3),
      imageSubject,
    });
    if (directions.length === 3) break;
  }
  if (!directions.length) throw new Error('director: no usable direction');
  return { values, copy, directions };
}

const anthropic = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

/** One Claude call: brief -> values, copy, directions. Throws on refusal or bad output. */
export async function directFill(profile: BusinessProfile, template: Template, brief: string, tenantId: string | null): Promise<DirectorOutput> {
  const message = await trackedCreate(anthropic(), {
    model: DIRECTOR_MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: buildDirectorPrompt(profile, template, brief) }],
  }, { tenantId, callSite: DIRECTOR_CALL_SITE });
  const block = message.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') throw new Error('director: no text from Claude');
  return parseDirectorOutput(template, block.text);
}

/** The image model's prompt for one direction, through the typography ban. */
export function imagePromptForDirection(
  direction: Direction,
  ctx: { request: string; service?: string | null; offer?: string | null; businessName?: string | null; primaryColor?: string | null; secondaryColor?: string | null; visualStyle?: string | null; format: ImageFormat; variation?: number },
): string {
  return composeImagePrompt({
    request: direction.imageSubject,
    service: ctx.service ?? null,
    offer: ctx.offer ?? null,
    brandKit: {
      businessName: ctx.businessName ?? null,
      primaryColor: ctx.primaryColor ?? null,
      secondaryColor: ctx.secondaryColor ?? null,
      visualStyle: ctx.visualStyle ?? null,
      avoid: DIRECTOR_AVOID,
    },
    direction: { name: direction.name, concept: direction.concept, composition: direction.composition, negativeSpace: direction.negativeSpace, palette: direction.palette },
    format: ctx.format,
    variation: ctx.variation && ctx.variation > 0 ? { index: ctx.variation } : null,
  });
}
