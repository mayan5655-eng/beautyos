// lib/ai/postGenerator.ts
//
// Free-form generation, capped: she types what she wants and gets two or
// three finished posts to pick from, each an ordinary design she can edit.
//
//   brief ──▶ Claude (this file: pick templates, write the words, describe
//             the picture) ──▶ OpenAI image per option (the route)
//             ──▶ designs rows (the route) ──▶ options on screen
//
// The cap is on GENERATIONS - one brief, one Claude call - not on the images
// inside it: 9 a month per tenant by default (MONTHLY_CALL_CAPS), an env
// override for the platform (AI_CAP_DESIGNS_GENERATE) and a per-tenant
// override in settings.ai_generation_cap that only the service role writes.
// Templates never count: the gallery stays open at the cap and after it.

import Anthropic from '@anthropic-ai/sdk';
import { trackedCreate } from './usage.ts';
import { getCallCapStatus, type CapStatus } from './callCaps.ts';
import { buildBusinessContext, parseClaudeJSON, type BusinessProfile } from './marketingAI.ts';
import type { Template } from '../design/contract.ts';
import type { Fillable } from '../design/reel.ts';
import { sanitizeValues } from '../design/design.ts';
import { fillableVariables } from './creativeDirector.ts';

export const GENERATE_MODEL = 'claude-sonnet-5';
export const GENERATE_CALL_SITE = 'designs/generate';
export const GENERATE_IMAGE_CALL_SITE = 'designs/generate-image';
export const OPTIONS_PER_GENERATION = 3;

const clean = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

export type PostOption = {
  templateKey: string;
  templateVersion: number;
  /** Why this template, in her words. */
  angle: string;
  values: Record<string, string>;
  /** English description of the picture for the image model; empty when the template has no AI slot. */
  imageSubject: string;
};

export type PostPlan = {
  options: PostOption[];
  copy: { text: string; hashtags: string[] };
};

/**
 * Templates the generator may pick from for a brief: the newest of each key
 * in the wanted format, never one that needs a client photo with consent,
 * never one that reads her saved reviews unless she has some.
 */
export function candidateTemplates<T extends Fillable>(all: T[], format: 'feed45' | 'story' | 'reel', hasReviews: boolean): T[] {
  return all.filter((t) => t.format === format
    && !t.slots.some((s) => s.consent)
    && (hasReviews || !t.variables.some((v) => v.source === 'review_text')));
}

/** The picture slot the generator fills, when the template allows an AI picture. */
export const aiSlotOf = (t: Fillable) => t.slots.find((s) => s.sources.includes('ai')) || null;

export function buildGeneratePrompt(profile: BusinessProfile, brief: string, candidates: Fillable[]): string {
  const catalogue = candidates.map((t) => {
    const vars = fillableVariables(t).map((v) => `"${v.key}" (${v.label}${v.kind === 'price' ? ', מחיר' : v.kind === 'cta' ? ', קריאה לפעולה' : ''}${v.maxLength ? `, עד ${v.maxLength} תווים` : ''})`).join(', ');
    const slot = aiSlotOf(t);
    const desc = (t as Template).description || '';
    const holiday = (t as Template).holiday;
    return `- key "${t.key}": ${t.name}. ${desc}${holiday ? ` (חג: ${holiday})` : ''}. שדות: ${vars}.${slot ? ` תמונת AI: ${slot.aiHint || 'תמונה אחת מתאימה'}` : ' בלי תמונת AI.'}`;
  }).join('\n');

  return `את קריאייטיב דיירקטורית לעסקי יופי בישראל. קוסמטיקאית כתבה בקשה קצרה לפוסט, ואת בונה ממנה ${OPTIONS_PER_GENERATION} אפשרויות שונות זו מזו - כל אחת תבנית מהקטלוג, הטקסטים שנכנסים לשדות שלה, ותיאור התמונה שתצולם עבורה. היא תבחר אחת ותערוך.

== העסק ==
${buildBusinessContext(profile)}

== הבקשה שלה ==
"${brief}"

== הקטלוג (רק מפתחות מכאן) ==
${catalogue}

== כללים ==
- ${OPTIONS_PER_GENERATION} אפשרויות, כל אחת עם זווית אחרת (למשל: מבצע ישיר, תועלת ללקוחה, רגש/עונה). שתי אפשרויות יכולות לחלוק תבנית רק אם הזווית שונה באמת.
- עברית טבעית, בגוף שני נקבה, בלי סימני קריאה מיותרים, בלי אימוג'י. מחיר רק אם היא כתבה מחיר. אל תמציאי טיפולים, מחירים או הבטחות רפואיות.
- מלאי כל שדה של התבנית שבחרת, בתוך מגבלת התווים. ערכי "cta" קצרים (עד 4 מילים).
- "imageSubject": תיאור באנגלית של התמונה בלבד - סצנה, אור, צבעוניות, קומפוזיציה עם מרחב שקט בחלק התחתון. ללא טקסט, ללא לוגו, ללא מחיר, ללא אנשים מזוהים. אם לתבנית אין תמונת AI - מחרוזת ריקה.
- "copy": טקסט לפוסט עצמו (עד 90 מילים) ו-3 עד 6 האשטגים בעברית ובאנגלית.

החזירי JSON בלבד, בלי הסברים:
{
  "options": [
    { "templateKey": "...", "angle": "משפט אחד על הזווית", "values": { "field": "value" }, "imageSubject": "..." }
  ],
  "copy": { "text": "...", "hashtags": ["#..."] }
}`;
}

/** Claude's answer, validated against the catalogue: unknown keys dropped, values sanitised, 2-3 options or an error. */
export function parseGeneratePlan(text: string, candidates: Fillable[]): PostPlan {
  const raw = parseClaudeJSON<Record<string, unknown>>(text);
  const byKey = new Map(candidates.map((t) => [t.key, t]));
  const options: PostOption[] = [];
  for (const o of Array.isArray(raw.options) ? raw.options : []) {
    if (!o || typeof o !== 'object') continue;
    const r = o as Record<string, unknown>;
    const t = byKey.get(clean(r.templateKey));
    if (!t) continue;
    const values = sanitizeValues(t, r.values);
    const slot = aiSlotOf(t);
    options.push({ templateKey: t.key, templateVersion: t.version, angle: clean(r.angle).slice(0, 120), values, imageSubject: slot ? clean(r.imageSubject).slice(0, 600) : '' });
    if (options.length >= OPTIONS_PER_GENERATION) break;
  }
  if (options.length < 2) throw new Error(`generate: only ${options.length} usable option(s) from Claude`);
  const copyRaw = raw.copy && typeof raw.copy === 'object' ? (raw.copy as Record<string, unknown>) : {};
  const hashtags = (Array.isArray(copyRaw.hashtags) ? copyRaw.hashtags : []).map(clean).filter((h) => /^#\S{1,40}$/.test(h)).slice(0, 8);
  return { options, copy: { text: clean(copyRaw.text).slice(0, 900), hashtags } };
}

const anthropic = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

/** One Claude call: brief -> a plan of 2-3 options. Metered as GENERATE_CALL_SITE; that is what the cap counts. */
export async function planPost(profile: BusinessProfile, brief: string, candidates: Fillable[], tenantId: string | null): Promise<PostPlan> {
  const message = await trackedCreate(anthropic(), {
    model: GENERATE_MODEL,
    max_tokens: 3000,
    messages: [{ role: 'user', content: buildGeneratePrompt(profile, brief, candidates) }],
  }, { tenantId, callSite: GENERATE_CALL_SITE });
  const block = message.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') throw new Error('generate: no text from Claude');
  return parseGeneratePlan(block.text, candidates);
}

export type GenerationAllowance = { used: number; cap: number; remaining: number; exceeded: boolean };

/**
 * This month's allowance for a tenant. The per-tenant override wins over the
 * platform number; the count comes from ai_usage like every other cap. A
 * count that cannot be read fails open, as all spend controls here do.
 */
export async function generationAllowance(tenantId: string, tenantCap: unknown, opts: { status?: CapStatus } = {}): Promise<GenerationAllowance> {
  const status = opts.status || await getCallCapStatus(tenantId, GENERATE_CALL_SITE);
  const override = Number(tenantCap);
  const cap = Number.isFinite(override) && override >= 0 && tenantCap !== null && tenantCap !== undefined ? Math.floor(override) : (status.cap ?? 0);
  const used = status.unknown ? 0 : status.used;
  return { used, cap, remaining: Math.max(0, cap - used), exceeded: !status.unknown && used >= cap };
}
