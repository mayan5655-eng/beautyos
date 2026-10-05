// lib/advisorWait.js
//
// The line shown in the advisor's waiting bubble, as a function of how long she
// has been waiting. Pure, so it is testable (test-advisor-wait.js) and the
// wording lives in one place.
//
// Why it changes at all. The advisor thinks before it writes - about 9 seconds
// to the first word on production - and a line that never moves for that long
// looks like a hang. So the line moves, and shows the seconds, which is a clock
// and not a promise.
//
// Why it says what it says. Only what is true. The model really is reading her
// numbers (a snapshot of her appointments, clients and revenue is in its prompt)
// and then composing an answer; the lines say exactly that. There is no
// progress bar, no percentage, no count of anything "analysed" - any of those
// would be an invented measure of work. Past 25 seconds it says plainly that
// this is taking longer than usual, rather than looking busy.

export const ADVISOR_WAIT_STAGES = [
  { from: 0, text: 'היועצת קוראת את המספרים של העסק שלך…' },
  { from: 5, text: 'עוברת על התורים, הלקוחות וההכנסות לפני שהיא עונה…' },
  { from: 12, text: 'עדיין חושבת איך לענות לך הכי טוב. עוד רגע.' },
  { from: 25, text: 'זה לוקח יותר מהרגיל. התשובה בדרך, אפשר להישאר כאן.' },
];

/** The line for `sec` seconds of waiting. Junk input is treated as the start. */
export function advisorWaitLine(sec) {
  const s = Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0;
  let stage = ADVISOR_WAIT_STAGES[0];
  for (const st of ADVISOR_WAIT_STAGES) if (s >= st.from) stage = st;
  // The clock appears only once it has been a few seconds - at 0-2 s a counter is noise.
  return s >= 3 ? `${stage.text} (${s} שנ׳)` : stage.text;
}
