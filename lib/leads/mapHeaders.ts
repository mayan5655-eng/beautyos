// lib/leads/mapHeaders.ts
//
// Proposes a mapping from the columns of an arbitrary CSV onto the lead fields
// this app writes. Stage 1 of the importer: it proposes, it never writes.
//
// ── Two differences from lib/ai/scoreLeads.ts, both deliberate ──────────────
// 1. STRUCTURED OUTPUTS, not fence-stripping. scoreLeads does
//        text.replace(/```json|```/g, '').trim()  then JSON.parse
//    which is a guess about how the model wrapped its answer. Here the response
//    format is constrained by a schema, so the result is parseable by
//    construction and a malformed answer is the API's problem, not ours.
// 2. A REAL FALLBACK. scoreLeads returns an invented mid-range score when the
//    call fails, which is a plausible-looking answer nobody asked for. Here a
//    failure falls back to header-name matching and SAYS it did, via
//    `source: 'fallback'`, so the preview can show lower confidence rather than
//    pretend the model agreed.
//
// The Claude client is injected so the fallback can actually be tested rather
// than merely written - see test-leads-csv-import.ts.

import Anthropic from '@anthropic-ai/sdk';
import { trackedCreate } from '../ai/usage.ts';

/** The lead fields this importer can fill. Nothing else is writable. */
export const TARGET_FIELDS = [
  'name',
  'phone',
  'email',
  'source',
  'notes',
  'service_interest',
] as const;

export type TargetField = (typeof TARGET_FIELDS)[number];

export interface FieldMapping {
  csvColumn: string | null;
  confidence: number;
  reason: string;
}

export interface MappingProposal {
  /** Where the proposal came from, so the UI can show it honestly. */
  source: 'ai' | 'fallback';
  /** Present only when source is 'fallback'. */
  fallbackReason?: string;
  mapping: Record<TargetField, FieldMapping>;
  unmappedColumns: string[];
}

export interface ProposeOptions {
  /** Injected for testing. Defaults to a real client built from the env. */
  client?: Pick<Anthropic, 'messages'>;
  model?: string;
  /**
   * Metering only - the mapping itself is unchanged. Optional so the existing
   * tests, which inject a fake client and never touch a database, keep working.
   */
  tenantId?: string | null;
}

// Header matching. Runs when Claude is unavailable, and is also what the schema
// below is trying to beat. Hebrew first, since these files are Hebrew.
const HEADER_PATTERNS: Record<TargetField, RegExp> = {
  name: /^(שם|שם מלא|שם הלקוחה|שם לקוח|לקוחה|full ?name|name|first ?name|customer)$/i,
  phone: /(טלפון|נייד|פלאפון|סלולרי|מספר|phone|mobile|cell|tel|whats)/i,
  email: /(אימייל|מייל|דוא"ל|דואל|email|e-?mail)/i,
  source: /(מקור|מאיפה|ערוץ|source|channel|utm|campaign)/i,
  notes: /(הערה|הערות|תיאור|פירוט|note|notes|comment|remark|message)/i,
  service_interest: /(טיפול|שירות|מתעניינת|עניין|service|treatment|interest)/i,
};

export function fallbackMapping(headers: string[], reason: string): MappingProposal {
  const mapping = {} as Record<TargetField, FieldMapping>;
  const used = new Set<string>();

  for (const field of TARGET_FIELDS) {
    const pattern = HEADER_PATTERNS[field];
    // Exact-ish match first, then a looser contains, so "שם" does not steal
    // "שם הטיפול" when a better column exists.
    const hit =
      headers.find((h) => !used.has(h) && pattern.test(h.trim())) ?? null;
    if (hit) used.add(hit);
    mapping[field] = hit
      ? { csvColumn: hit, confidence: 0.5, reason: 'התאמה לפי שם העמודה בלבד' }
      : { csvColumn: null, confidence: 0, reason: 'לא נמצאה עמודה מתאימה' };
  }

  return {
    source: 'fallback',
    fallbackReason: reason,
    mapping,
    unmappedColumns: headers.filter((h) => !used.has(h)),
  };
}

const MAPPING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['mapping', 'unmappedColumns'],
  properties: {
    mapping: {
      type: 'object',
      additionalProperties: false,
      required: [...TARGET_FIELDS],
      properties: Object.fromEntries(
        TARGET_FIELDS.map((f) => [
          f,
          {
            type: 'object',
            additionalProperties: false,
            required: ['csvColumn', 'confidence', 'reason'],
            properties: {
              csvColumn: {
                type: ['string', 'null'],
                description: 'Exact header text from the CSV, or null if no column fits.',
              },
              // No minimum/maximum: the structured-output schema subset rejects
              // them on 'number' with
              //   "For 'number' type, properties maximum, minimum are not supported"
              // and the whole request 400s. Verified against the live API. The
              // range is enforced by clamp01() below instead, which this code
              // already did anyway.
              confidence: { type: 'number' },
              reason: { type: 'string', description: 'One short sentence, in Hebrew.' },
            },
          },
        ])
      ),
    },
    unmappedColumns: { type: 'array', items: { type: 'string' } },
  },
} as const;

const SYSTEM = `You map columns of a CSV of sales leads onto a fixed set of fields for an Israeli beauty-clinic CRM.

The sample values you are shown are MASKED on purpose: digits are replaced with 9, Hebrew letters with א, Latin letters with x or X. Punctuation, length and script are preserved. Infer each column's meaning from its header and from the SHAPE of its values. Do not try to read the values as real data - they are not.

Rules:
- csvColumn must be the exact header text, copied verbatim, or null.
- Never map two fields to the same column.
- Prefer null over a bad guess. A wrong phone column is worse than no phone column.
- A 9-or-10 digit value beginning 99 or 9999 is almost certainly a phone.
- reason must be one short sentence in Hebrew.`;

export async function proposeMapping(
  headers: string[],
  maskedSamples: string[][],
  options: ProposeOptions = {}
): Promise<MappingProposal> {
  const model = options.model ?? 'claude-haiku-4-5';

  let client = options.client;
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      return fallbackMapping(headers, 'ANTHROPIC_API_KEY is not configured');
    }
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  const table = [
    headers.join(' | '),
    headers.map(() => '---').join(' | '),
    ...maskedSamples.map((r) => r.join(' | ')),
  ].join('\n');

  try {
    const response = await trackedCreate(client, {
      model,
      max_tokens: 2048,
      system: SYSTEM,
      output_config: { format: { type: 'json_schema', schema: MAPPING_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: `Columns and masked sample rows:\n\n${table}\n\nMap them onto: ${TARGET_FIELDS.join(', ')}.`,
        },
      ],
    } as Anthropic.MessageCreateParamsNonStreaming,
      { tenantId: options.tenantId || null, callSite: 'leads/map-headers' });

    const block = response.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') {
      return fallbackMapping(headers, 'Claude returned no text block');
    }
    const parsed = JSON.parse(block.text) as {
      mapping: Record<TargetField, FieldMapping>;
      unmappedColumns: string[];
    };

    // Trust the schema for shape, but not for truth: a hallucinated column name
    // would poison the import silently, so every mapped column must actually
    // exist in the file.
    const cleaned = {} as Record<TargetField, FieldMapping>;
    for (const field of TARGET_FIELDS) {
      const proposed = parsed.mapping?.[field];
      const col = proposed?.csvColumn ?? null;
      cleaned[field] =
        col && headers.includes(col)
          ? {
              csvColumn: col,
              confidence: clamp01(proposed.confidence),
              reason: String(proposed.reason ?? ''),
            }
          : { csvColumn: null, confidence: 0, reason: col ? 'העמודה שהוצעה לא קיימת בקובץ' : String(proposed?.reason ?? 'לא נמצאה עמודה מתאימה') };
    }

    const used = new Set(Object.values(cleaned).map((m) => m.csvColumn).filter(Boolean) as string[]);
    return {
      source: 'ai',
      mapping: cleaned,
      unmappedColumns: headers.filter((h) => !used.has(h)),
    };
  } catch (err: unknown) {
    // Typed first, so a 401 and a 429 are distinguishable in the log.
    let reason = 'Claude call failed';
    if (err instanceof Anthropic.AuthenticationError) reason = 'Claude authentication failed';
    else if (err instanceof Anthropic.RateLimitError) reason = 'Claude rate limit reached';
    else if (err instanceof Anthropic.APIError) reason = `Claude API error ${err.status}`;
    else if (err instanceof Error) reason = err.message;
    console.error('[mapHeaders] falling back to header matching:', reason);
    return fallbackMapping(headers, reason);
  }
}

function clamp01(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}
