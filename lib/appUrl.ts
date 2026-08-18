// lib/appUrl.ts
//
// One resolver for the app's own public base URL.
//
// Why a shared module rather than a fallback in each caller: the Facebook OAuth
// flow sends redirect_uri twice - once in /oauth/start when sending the user to
// Facebook, and again in /oauth/callback when exchanging the code for a token -
// and Facebook rejects the exchange unless the two strings are byte-identical.
// Two independently-written fallbacks are two chances for them to drift, and
// the failure would only appear at the last step of a flow that looked fine.
//
// The literal is the production deployment, matching what send-reminders,
// send-reminder-manual and whatsapp-webhook already fall back to.
const FALLBACK = 'https://beautyos-theta.vercel.app';

export const APP_URL: string = (process.env.NEXT_PUBLIC_APP_URL || FALLBACK).replace(/\/+$/, '');

/** Whether the configured value came from the environment or the fallback. */
export const APP_URL_IS_CONFIGURED: boolean = !!process.env.NEXT_PUBLIC_APP_URL;
