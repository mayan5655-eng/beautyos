// lib/design/fitText.ts
//
// How a text layer picks its size: start at the template's size and shrink
// only as far as needed so the text sits inside its box and inside its
// line budget. The measurement is injected, so the DOM renderer measures a
// real element and a test measures a model - the rule is the same.
//
// This replaced -webkit-line-clamp. With the clamp, a wrapped caption's
// scrollHeight sat a few pixels above its clientHeight whatever the size,
// so the old loop shrank every multi-line caption to the floor and the
// exporter, which does not know the clamp, drew the lines the box then
// could not hold.

export type Measure = (px: number) => { width: number; height: number };

export type FitInput = {
  basePx: number;
  lineHeight: number;
  /** 0 = as many lines as the box holds. */
  maxLines: number;
  boxWidth: number;
  boxHeight: number;
  /** Content size at a given font size: what the element scrolls to. */
  measure: Measure;
  /** Never below this fraction of the base size. */
  floor?: number;
  /** Shrink step, as a fraction. */
  step?: number;
};

export type FitResult = { px: number; lines: number; fits: boolean };

/** Lines the content occupies at this size, from its height. */
export const lineCount = (contentHeight: number, px: number, lineHeight: number) => Math.max(1, Math.round(contentHeight / (px * lineHeight)));

export function fitText(input: FitInput): FitResult {
  const { basePx, lineHeight, maxLines, boxWidth, boxHeight, measure } = input;
  const floor = basePx * (input.floor ?? 0.5);
  const step = input.step ?? 0.93;
  let px = basePx;
  for (let guard = 0; guard < 40; guard++) {
    const m = measure(px);
    const lines = lineCount(m.height, px, lineHeight);
    // One pixel of slack: sub-pixel line boxes must not count as overflow.
    const fits = m.height <= boxHeight + 1 && m.width <= boxWidth + 1 && (!maxLines || lines <= maxLines);
    if (fits) return { px, lines, fits: true };
    const next = px * step;
    if (next < floor) return { px, lines, fits: false };
    px = next;
  }
  return { px, lines: lineCount(measure(px).height, px, lineHeight), fits: false };
}
