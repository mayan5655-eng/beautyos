// lib/skinScanView.ts
//
// What the public skin-scan page (app/skin-scan/page.jsx) DRAWS from a report. Pure, client-safe, tested in
// test-skin-scan-page.ts.
//
// The rule this file exists to keep: every mark on the results view comes from a field the model actually returned.
// Nothing here invents a number, a score or a finding:
//   * zones      - read from the concern text. The prompt restricts places on the face to a fixed list of five
//                  (מצח, אף, לחיים, סנטר, אזור העיניים), so a plain match is reliable. A concern naming none gets no marker.
//   * levels     - `concern_levels`, an ADDITIVE field (2026-11-04). Reports from before it, or an answer that
//                  left it out or wrote something else, simply show no severity meter. Never guessed from the text.
//   * ingredients - the Latin words already inside a routine step (the prompt asks for ingredient names in Latin
//                  letters: niacinamide, SPF 30). Highlighted as chips, never added.

import { INVALID_LINK_HE, isTenantId } from './skinScanGuard.ts';

export { INVALID_LINK_HE, isTenantId };

export type ZoneKey = 'forehead' | 'nose' | 'cheeks' | 'chin' | 'eyes';

/** Marker positions are a percentage of the FACE OVAL the capture guide asked her to fill, not a face detection. */
export const ZONES: { key: ZoneKey; he: string; points: [number, number][] }[] = [
  { key: 'forehead', he: 'מצח', points: [[50, 21]] },
  { key: 'eyes', he: 'אזור העיניים', points: [[35, 43], [65, 43]] },
  { key: 'nose', he: 'אף', points: [[50, 54]] },
  { key: 'cheeks', he: 'לחיים', points: [[28, 62], [72, 62]] },
  { key: 'chin', he: 'סנטר', points: [[50, 85]] },
];

// Hebrew prefixes that can glue onto a word: ב, ה, ו, כ, ל, מ, ש (up to two, "ובלחיים").
const P = '(?:^|[^\\u0590-\\u05FF])[בהוכלמש]{0,2}';
const END = '(?=$|[^\\u0590-\\u05FF])';
const ZONE_RE: Record<ZoneKey, RegExp> = {
  forehead: new RegExp(`${P}מצח${END}`),
  // "אף" alone: never inside אפור / אפשר / אפילו.
  nose: new RegExp(`${P}(?:אף|אפים)${END}`),
  cheeks: new RegExp(`${P}(?:לחיים|לחי|לחיי)${END}`),
  chin: new RegExp(`${P}סנטר${END}`),
  eyes: new RegExp(`${P}(?:עיניים|העיניים|עין|עיני)${END}`),
};

/** The zones a line of report text names, in the fixed order above. */
export function zonesOf(text: unknown): ZoneKey[] {
  const s = typeof text === 'string' ? text : '';
  if (!s) return [];
  return ZONES.map((z) => z.key).filter((k) => ZONE_RE[k].test(s));
}

export const LEVELS = ['קל', 'בינוני', 'בולט'] as const;
export type Level = { label: (typeof LEVELS)[number]; value: 1 | 2 | 3 };

/** The severity the model gave concern i, or null when it gave none we recognise (old report, partial answer). */
export function levelOf(report: unknown, i: number): Level | null {
  const r = report && typeof report === 'object' ? (report as Record<string, unknown>) : {};
  const list = r.concern_levels;
  if (!Array.isArray(list)) return null;
  const raw = typeof list[i] === 'string' ? (list[i] as string).trim() : '';
  const at = (LEVELS as readonly string[]).indexOf(raw);
  return at < 0 ? null : { label: LEVELS[at], value: (at + 1) as 1 | 2 | 3 };
}

/** Latin ingredient names already written in a routine step ("סרום niacinamide 5%" -> ["niacinamide 5%"]). */
export function ingredientsOf(step: unknown): string[] {
  const s = typeof step === 'string' ? step : '';
  const found = s.match(/[A-Za-z][A-Za-z\-]*(?: +[A-Za-z][A-Za-z\-]*)*(?: *\d+(?:\.\d+)?%?)?/g) || [];
  const out: string[] = [];
  for (const f of found) {
    const t = f.trim();
    if (t.length >= 2 && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out.slice(0, 3);
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const strList = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

export type ConcernView = { text: string; zones: ZoneKey[]; level: Level | null };
export type ReportView = {
  score: number | null;
  skinType: string;
  summary: string;
  concerns: ConcernView[];
  treatment: string;
  matchedService: string;
  morning: string[];
  evening: string[];
  /** Zones named anywhere in the concerns, each with the 1-based number of the first concern naming it. */
  zoneMarks: { key: ZoneKey; he: string; n: number; points: [number, number][] }[];
};

/** Everything the results view needs, from whatever subset of the report arrived. Never throws. */
export function viewOfReport(report: unknown): ReportView {
  const r = report && typeof report === 'object' && !Array.isArray(report) ? (report as Record<string, unknown>) : {};
  const n = Number(r.score);
  const concerns = strList(r.concerns).map((text, i) => ({ text, zones: zonesOf(text), level: levelOf(r, i) }));
  const zoneMarks: ReportView['zoneMarks'] = [];
  concerns.forEach((c, i) => {
    for (const k of c.zones) {
      if (zoneMarks.some((z) => z.key === k)) continue;
      const z = ZONES.find((x) => x.key === k)!;
      zoneMarks.push({ key: k, he: z.he, n: i + 1, points: z.points });
    }
  });
  return {
    score: r.score === null || r.score === undefined || r.score === '' || !Number.isFinite(n) ? null : Math.round(Math.max(0, Math.min(100, n))),
    skinType: str(r.skin_type),
    summary: str(r.summary),
    concerns,
    treatment: str(r.clinical_treatment),
    matchedService: str(r.matched_service),
    morning: strList(r.routine_morning),
    evening: strList(r.routine_evening),
    zoneMarks,
  };
}

/** What a refused scan should look like on the page, from the route's own flags. The message is always the route's. */
export function refusalOf(data: unknown): 'link' | 'quota' | 'unavailable' | 'paused' | null {
  const d = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  if (d.success) return null;
  if (d.quotaExceeded) return 'quota';
  if (d.scannerUnavailable) return 'unavailable';
  if (d.code === 'business_paused') return 'paused';
  if (d.error === INVALID_LINK_HE) return 'link';
  return null;
}
