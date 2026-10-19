// lib/calendarFeed.ts
//
// SERVER ONLY. Her Kalmea diary in her phone's own calendar (Google / Apple /
// Outlook), as a subscribed feed: one link she adds once, and every
// appointment, move and cancellation appears there by itself. Cosmeticians
// live in their phone calendar; keeping two diaries in step by hand is the
// kind of daily chore this product exists to remove.
//
// The link is a capability: anyone holding it can read her diary (client
// names and treatments, never phone numbers). So:
//   token = <tenantId>.<nonce>.<hmac(tenantId:nonce)>
// The nonce lives in settings.automations.calendar_feed_nonce (protected: only
// app/api/calendar-feed/link writes it). "Reset the link" rotates the nonce,
// and every old link stops working at once. No expiry: a calendar app polls
// the same URL for years, and an expiring feed would silently go stale.

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { signingSecret } from './linkSecret.ts';

const SECRET_ENV = 'CONFIRM_LINK_SECRET';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sig = (tenantId: string, nonce: string, secret = signingSecret(SECRET_ENV)) =>
  createHmac('sha256', secret).update(`calfeed:${tenantId}:${nonce}`).digest('base64url').slice(0, 32);

export function newFeedNonce(): string {
  return randomBytes(12).toString('hex');
}

export function feedToken(tenantId: string, nonce: string, secret?: string): string {
  return `${tenantId}.${nonce}.${sig(tenantId, nonce, secret)}`;
}

/** { tenantId, nonce } when the signature is right; null otherwise. The caller still checks the nonce is current. */
export function parseFeedToken(token: string, secret?: string): { tenantId: string; nonce: string } | null {
  const t = String(token || '').replace(/\.ics$/i, '');
  const [tenantId, nonce, s, ...rest] = t.split('.');
  if (rest.length || !UUID.test(tenantId || '') || !/^[0-9a-f]{24}$/.test(nonce || '') || !s) return null;
  const want = Buffer.from(sig(tenantId, nonce, secret));
  const got = Buffer.from(s);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return { tenantId, nonce };
}

/** https and webcal forms. webcal:// opens "subscribe" straight away on an iPhone. */
export function feedUrls(origin: string, token: string): { https: string; webcal: string; google: string } {
  const https = `${origin.replace(/\/+$/, '')}/api/calendar-feed/${token}.ics`;
  const webcal = https.replace(/^https?:\/\//, 'webcal://');
  return { https, webcal, google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}` };
}
