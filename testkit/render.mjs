// testkit/render.mjs
//
// importApp('app/design/DesignStudio.jsx') -> the real module; renderApp(Component, props) -> static HTML.
// See testkit/jsxLoader.mjs for what it does and why. Server-render only: effects do not run, so a component
// shows its INITIAL state, which is exactly what "what does she see first" asks.

import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let registered = false;

export async function importApp(rel) {
  if (!registered) { register('./jsxLoader.mjs', import.meta.url); registered = true; }
  return import(pathToFileURL(path.join(ROOT, rel)).href);
}

export function renderApp(Component, props = {}) {
  return renderToStaticMarkup(React.createElement(Component, props));
}

/** A tiny DOM-less reader: the text and attributes inside the first element matching `marker`. */
export function between(html, openMarker) {
  const i = html.indexOf(openMarker);
  if (i < 0) return null;
  const start = html.lastIndexOf('<', i);
  const tag = /^<([a-z0-9]+)/i.exec(html.slice(start))[1];
  let depth = 0, pos = start;
  const re = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, 'gi');
  re.lastIndex = start;
  for (let m; (m = re.exec(html)); ) {
    if (m[2] === '/') continue;
    depth += m[1] ? -1 : 1;
    pos = re.lastIndex;
    if (depth === 0) return { html: html.slice(start, pos), before: html.slice(0, start), after: html.slice(pos) };
  }
  return null;
}

export const textOf = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
export const buttonsOf = (html) => [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) => textOf(m[1])).filter(Boolean);
