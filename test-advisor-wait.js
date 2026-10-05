// test-advisor-wait.js
//
// What the advisor's waiting bubble says, and that it stays honest.
//
// The advisor thinks for several seconds before the first word (measured: ~9 s
// on production), and a static "thinking..." for that long reads as stuck. The
// bubble now changes as the wait goes on, and shows how long it has been. The
// rule for the wording is the product's own: say only what is true. The model
// IS reading her numbers (the snapshot of her appointments, clients, revenue
// is in its prompt) and then writing an answer - so the lines say that, and
// nothing else. No progress bar, no percentage, no counts of rows "analysed",
// nothing that would be a made-up measure of work. Past a certain point the
// line says plainly that this is taking longer than usual.
import { advisorWaitLine, ADVISOR_WAIT_STAGES } from './lib/advisorWait.js';
import fs from 'node:fs';

let passed = 0, failed = 0;
const ok = (label, cond) => { if (cond) passed++; else { failed++; console.log(`  FAIL  ${label}`); } };

const at = (s) => advisorWaitLine(s);

ok('it starts by saying what is happening, not just "thinking"', /המספרים|הנתונים/.test(at(0)));
ok('it changes after a few seconds', at(0) !== at(7));
ok('it changes again later', at(7) !== at(15));
ok('and says plainly when it is taking longer than usual', /יותר מהרגיל|יותר זמן/.test(at(40)));
ok('every stage is a different line', new Set([0, 6, 14, 30].map(at)).size === 4);
ok('the stages come in time order', ADVISOR_WAIT_STAGES.every((s, i, a) => i === 0 || s.from > a[i - 1].from));
ok('the seconds are shown once it has been a while (it is a clock, not a promise)', /\b9\b/.test(at(9)) || /9/.test(at(9)));
ok('negative or junk input does not break it', typeof at(-3) === 'string' && typeof at(NaN) === 'string' && at(-3).length > 0);

// Honesty guard: nothing that claims measurable work or a result.
const everyLine = [0, 3, 6, 10, 14, 20, 30, 60].map(at).join('\n');
ok('no percentages', !/%/.test(everyLine));
ok('no invented counts of rows / records / customers analysed', !/\d+\s*(לקוחות|תורים|רשומות|שורות)/.test(everyLine));
ok('no "almost done" style promise', !/כמעט סיימתי|כמעט סיימנו|עוד שנייה/.test(everyLine));

// It is actually wired into the dashboard.
const ui = fs.readFileSync('app/beautyos.jsx', 'utf8');
ok('the dashboard uses it', ui.includes('advisorWaitLine('));
ok('the wait is clocked while the answer is pending', ui.includes('advisorWaitSec'));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
