// lib/og/visualRtl.ts
//
// Hebrew for a renderer that does not do bidirectional text.
//
// next/og's renderer (satori) lays glyphs out left to right in the order of the string.
// Given "קביעת תור אונליין" it draws "ויילנוא רות תעיבק" - found on real output, 2026-10-05,
// on the first link-preview image. So for Hebrew we hand it the text already in VISUAL
// order: the line is cut into segments (Hebrew/neutral text vs left-to-right runs), the
// segment order is reversed, Hebrew segments are reversed character by character, and
// left-to-right runs are left alone.
//
// A left-to-right run is a Latin word plus whatever Latin words and numbers follow it
// ("Beauty 24", "Dr. Cohen"), or a number on its own ("1,200"). Numbers separated by a
// space are separate runs, as in the Unicode algorithm: "20 30" in a Hebrew line reads 30 20.
// The first version split "Beauty 24" into two runs and drew "24 Beauty" - caught by looking
// at the rendered image, not by the code.
//
// The same lesson as the video work in this repo: never leave a Hebrew paragraph to
// auto-wrap. rtlLines() breaks it into lines itself, and each line is ordered on its own.

const HEB = /[֐-׿]/;
const MIRROR: Record<string, string> = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<', '«': '»', '»': '«' };
const LTR_RUN = /[A-Za-z][A-Za-z0-9]*(?:[ .,:/'’&+-]+[A-Za-z0-9]+)*|[0-9]+(?:[.,:/-][0-9]+)*/g;

// A letter with its combining marks (niqqud, cantillation, dagesh) is ONE unit. Reversing character by character
// put each mark BEFORE its letter, and in a left-to-right layout a combining mark attaches to the letter that
// comes first - so every vowel landed on its neighbour (computed 2026-10-06 for "שָׁלוֹם": the holam that belongs to
// the vav ended up on the final mem). Reversing whole clusters keeps each mark on its letter.
const CLUSTER = /\P{M}\p{M}*/gu;
function reverseClusters(text: string): string {
  return (text.match(CLUSTER) || [])
    .reverse()
    .map((cluster) => { const base = [...cluster][0]; return MIRROR[base] ? MIRROR[base] + cluster.slice(base.length) : cluster; })
    .join('');
}

/** One line of text, in the order a left-to-right renderer must draw it. Text without Hebrew is returned as is. */
export function visualRtl(line: string): string {
  if (!HEB.test(line)) return line;
  const segs: { text: string; ltr: boolean }[] = [];
  let at = 0;
  for (const m of line.matchAll(LTR_RUN)) {
    if (m.index! > at) segs.push({ text: line.slice(at, m.index), ltr: false });
    segs.push({ text: m[0], ltr: true });
    at = m.index! + m[0].length;
  }
  if (at < line.length) segs.push({ text: line.slice(at), ltr: false });
  return segs
    .reverse()
    .map((s) => (s.ltr ? s.text : reverseClusters(s.text)))
    .join('');
}

/**
 * Break `text` into at most `maxLines` lines of about `maxChars`, at word boundaries, and put each in
 * visual order. Line 1 is the first line to READ (drawn on top, flush right). If the text does not fit,
 * whole words are dropped from the end and the last line ends with "…".
 */
export function rtlLines(text: string, maxChars: number, maxLines = 2): string[] {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  let used = 0;
  for (; used < words.length; used++) {
    const w = words[used];
    const next = cur ? cur + ' ' + w : w;
    if (next.length <= maxChars) { cur = next; continue; }
    if (lines.length < maxLines - 1 && cur) { lines.push(cur); cur = w; continue; }
    break; // the last line is full
  }
  if (cur) lines.push(cur);
  if (used < words.length && lines.length) {
    // more words than fit: drop whole words from the last line until "…" fits
    let last = lines[lines.length - 1].split(' ');
    while (last.length > 1 && (last.join(' ') + ' …').length > maxChars) last.pop();
    lines[lines.length - 1] = last.join(' ') + ' …';
  }
  if (lines.length && lines[lines.length - 1].length > maxChars + 6) {
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, maxChars + 5).trimEnd() + '…'; // one very long word
  }
  return lines.map(visualRtl);
}
