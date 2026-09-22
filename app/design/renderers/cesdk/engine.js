'use client';

// app/design/renderers/cesdk/engine.js
//
// The only file that names the vendor's CDN, version and licence variable.
// Loaded once, at first use, from IMG.LY's CDN, so there is no npm
// dependency. Absent licence = evaluation mode (watermarked export).

export const CESDK_VERSION = '1.82.1';
export const CESDK_CDN = `https://cdn.img.ly/packages/imgly/cesdk-engine/${CESDK_VERSION}`;
export const CESDK_LICENSE = process.env.NEXT_PUBLIC_CESDK_LICENSE || '';

let modulePromise = null;

export function loadCreativeEngine() {
  if (!modulePromise) {
    modulePromise = import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${CESDK_CDN}/index.js`).then((m) => m.default);
  }
  return modulePromise;
}

export async function initEngine(options = {}) {
  const CreativeEngine = await loadCreativeEngine();
  return CreativeEngine.init({ license: CESDK_LICENSE || undefined, baseURL: `${CESDK_CDN}/assets`, ...options });
}
