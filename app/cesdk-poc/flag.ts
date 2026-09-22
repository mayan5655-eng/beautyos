// app/cesdk-poc/flag.ts
//
// The one switch for the CE.SDK proof of concept. Set NEXT_PUBLIC_CESDK_POC=1
// in .env.local only - never in Vercel - and the reels tab grows a "POC" card.
// Everything the flag turns on lives in this folder; see README.md for the
// four touch points outside it and how to delete the whole thing.
export const CESDK_POC = process.env.NEXT_PUBLIC_CESDK_POC === '1';

// CE.SDK licence keys are meant to ship to the browser (they are bound to a
// domain), so the public prefix is correct. Empty -> the engine runs in
// evaluation mode and every export carries an IMG.LY watermark.
export const CESDK_LICENSE = process.env.NEXT_PUBLIC_CESDK_LICENSE || '';

export const CESDK_VERSION = '1.82.1';
export const CESDK_CDN = `https://cdn.img.ly/packages/imgly/cesdk-engine/${CESDK_VERSION}`;
