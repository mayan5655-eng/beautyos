// lib/ai/aiErrorResponse.ts
//
// One mapping from "the AI call was refused or failed" to an HTTP status and a sentence she can read.
// designs/ai-fill and designs/generate already did this inline; the marketing routes (reel, groups,
// shooting-list) used to turn every one of these into a bare 500 with whatever message the error had, or
// - for groups - into an empty list that looked like "no suggestions". Same classes, same statuses:
//
//   demo tenant            403   it may not spend
//   cap used up            429   her monthly allowance; the message says when it renews
//   cap counter unreadable 503   fails closed, says so
//   provider refusing      503   credit, key, outage: not her request, not her fault
//   ungrounded claims      422   nothing was produced; the message says how to fix the profile
//
// Anything else returns null: the caller keeps its own generic failure.

import { AiCapExceededError, AiCapUnavailableError, AiProviderUnavailableError, DemoBlockedError } from './callCaps.ts';
import { UngroundedClaimsError } from './claimsGuard.ts';

export type MappedAiError = { status: number; message: string };

export function mapAiError(e: unknown): MappedAiError | null {
  if (e instanceof DemoBlockedError) return { status: 403, message: e.message };
  if (e instanceof AiCapUnavailableError) return { status: 503, message: e.message };
  if (e instanceof AiCapExceededError) return { status: 429, message: e.message };
  if (e instanceof AiProviderUnavailableError) return { status: 503, message: e.message };
  if (e instanceof UngroundedClaimsError) return { status: 422, message: e.message };
  return null;
}

/** True for the errors a swallowing catch must NOT swallow: the caller has to see them to explain them. */
export const isAiRefusal = (e: unknown): boolean => mapAiError(e) !== null;
