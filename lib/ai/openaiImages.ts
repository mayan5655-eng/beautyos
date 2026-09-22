// lib/ai/openaiImages.ts
//
// The ONLY place in the codebase that talks to OpenAI, and the only place that
// reads OPENAI_API_KEY. Server-side by construction: this module uses
// process.env and Buffer and is imported by route handlers alone. Nothing here
// is ever bundled for the browser, and the key never appears in a response,
// a log line or an error message.
//
// One request = one image. Every image is metered into ai_usage through the
// same recordUsage as the Anthropic calls, priced per token from MODEL_RATES,
// so the monthly caps in lib/ai/callCaps.ts and the cost queries on ai_usage
// see images and text side by side.
//
// Plain fetch, no SDK: the endpoint takes one JSON body and returns one JSON
// body, and a dependency is one more thing to remove if this direction is
// abandoned.

import { recordUsage } from './usage.ts';
import { FORMAT_SIZES, type ImageFormat } from './imagePrompt.ts';

const ENDPOINT = 'https://api.openai.com/v1/images/generations';

/** The qualities the gpt-image-2.5 family accepts. */
export const IMAGE_QUALITIES = ['low', 'medium', 'high', 'xhigh', 'max', 'auto'] as const;
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];

/**
 * Sunburst by default: this stage measures the best quality we can get for a
 * beauty campaign. OPENAI_IMAGE_MODEL switches to gpt-image-2.5-flare for a
 * fast/draft comparison without a code change.
 */
export const DEFAULT_IMAGE_MODEL = 'gpt-image-2.5-sunburst';
export const DEFAULT_IMAGE_QUALITY: ImageQuality = 'high';

export function imageModel(): string {
  return String(process.env.OPENAI_IMAGE_MODEL || '').trim() || DEFAULT_IMAGE_MODEL;
}
export function imageQuality(): ImageQuality {
  const q = String(process.env.OPENAI_IMAGE_QUALITY || '').trim() as ImageQuality;
  return (IMAGE_QUALITIES as readonly string[]).includes(q) ? q : DEFAULT_IMAGE_QUALITY;
}

export type GenerateImageInput = {
  prompt: string;
  format?: ImageFormat;
  quality?: ImageQuality;
  model?: string;
  /** Who is spending. null = unattributed, still metered. */
  tenantId: string | null;
  /** Which feature spent it, e.g. 'creatives/test-image'. Keys the monthly cap. */
  callSite: string;
};

export type GeneratedImage = {
  png: Buffer;
  model: string;
  size: string;
  quality: ImageQuality;
  /** Wall time of the API call, milliseconds. */
  ms: number;
  usage: { inputTokens: number; outputTokens: number };
  /** From MODEL_RATES; null when the model is unpriced (logged loudly). */
  costUsd: number | null;
};

export class OpenAIImageError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'OpenAIImageError';
    this.status = status;
  }
}

/**
 * Generate ONE image. Throws OpenAIImageError on an API refusal (the status
 * and OpenAI's message, never the key or the full prompt). Metering is
 * best-effort and never throws.
 */
export async function generateImage(input: GenerateImageInput): Promise<GeneratedImage> {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) throw new OpenAIImageError(500, 'OPENAI_API_KEY is not set on the server');

  const model = String(input.model || imageModel());
  const quality = input.quality || imageQuality();
  const size = FORMAT_SIZES[input.format || 'feed45'];

  const body = {
    model,
    prompt: input.prompt,
    n: 1,
    size,
    quality,
    background: 'opaque',
    output_format: 'png',
    moderation: 'auto',
  };

  const started = Date.now();
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const ms = Date.now() - started;

  const json = (await res.json().catch(() => null)) as
    | { data?: { b64_json?: string }[]; usage?: { input_tokens?: number; output_tokens?: number }; error?: { message?: string; type?: string; code?: string } }
    | null;

  if (!res.ok) {
    const msg = json?.error?.message || `HTTP ${res.status}`;
    console.error(`[openai-images] ${model} ${size} ${quality} failed after ${ms}ms: ${res.status} ${msg.slice(0, 300)}`);
    throw new OpenAIImageError(res.status, msg.slice(0, 300));
  }

  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new OpenAIImageError(502, 'OpenAI returned no image data');

  const usage = {
    inputTokens: Number(json?.usage?.input_tokens) || 0,
    outputTokens: Number(json?.usage?.output_tokens) || 0,
  };
  const metered = await recordUsage({ tenantId: input.tenantId, callSite: input.callSite, model, usage });

  return {
    png: Buffer.from(b64, 'base64'),
    model,
    size,
    quality,
    ms,
    usage,
    costUsd: metered.costUsd ?? null,
  };
}
