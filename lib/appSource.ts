// lib/appSource.ts
// Source-level tests read "the app shell". app/beautyos.jsx used to be one file; screens that are not part of the first
// paint now live in app/tab-*.jsx (loaded on demand). The tests care about the text, not the file, so they read both
// through this one function and nothing about what they check had to change.
import { readFileSync, readdirSync } from 'node:fs';

export function readAppSource(): string {
  const norm = (s: string) => s.split('\r\n').join('\n');
  const main = norm(readFileSync('app/beautyos.jsx', 'utf8'));
  const parts = readdirSync('app')
    .filter((f) => /^tab-.*\.jsx$/.test(f))
    .sort()
    .map((f) => norm(readFileSync(`app/${f}`, 'utf8')));
  return [main, ...parts].join('\n');
}
