// lib/protocolBook/bidi.ts — split text so numbers can be isolated left-to-right inside Hebrew/Arabic (app/dashboard/protocol-book/Bidi.jsx).
// "3–5", "20%–30%", "SPF 30+": the dash, % and + are neutral, and in a right-to-left line they flip the range ("5–3").
const NUM = /(\d[\d.,]*%?(?:\s?[–-]\s?\d[\d.,]*%?)?\+?)/g;

export type BidiPart = { t: string; num?: true };

export function bidiParts(text: unknown): BidiPart[] {
  const s = String(text ?? '');
  const out: BidiPart[] = [];
  let last = 0;
  for (const m of s.matchAll(NUM)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ t: s.slice(last, i) });
    out.push({ t: m[0], num: true });
    last = i + m[0].length;
  }
  if (last < s.length) out.push({ t: s.slice(last) });
  return out;
}
