// The content calendar (2026-10-21): her own posts with her own picture, pictures made Instagram-ready (JPEG, 4:5 to
// 1.91:1, never cropped), the month grid, and the lines the routes must not cross.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fitForInstagram, MIN_RATIO, MAX_RATIO, MAX_WIDTH } from './lib/content/media.ts';

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

ok('pictures: inside Instagram ratios as they are; too tall or too wide get margins, never cropping; at most 1440 wide', () => {
  const square = fitForInstagram(1080, 1080);
  assert.deepEqual([square.W, square.H, square.x, square.y], [1080, 1080, 0, 0]);
  const story = fitForInstagram(1080, 1920); // 9:16, taller than 4:5
  assert.ok(Math.abs(story.W / story.H - MIN_RATIO) < 0.01);
  assert.equal(story.dh, story.H, 'full height kept');
  assert.ok(story.x > 0, 'margins left and right');
  const pano = fitForInstagram(4000, 1000); // 4:1, wider than 1.91
  assert.ok(Math.abs(pano.W / pano.H - MAX_RATIO) < 0.01);
  assert.equal(pano.W, MAX_WIDTH);
  assert.ok(pano.y > 0, 'margins above and below');
  const big = fitForInstagram(4032, 3024);
  assert.equal(big.W, MAX_WIDTH);
});

const items = strip(rd('app/api/content/items/route.ts'));
const plan = strip(rd('app/api/content/plan/route.ts'));
const ui = rd('app/design/ContentPlan.jsx');
const media = rd('app/design/contentMedia.js');

ok('her own post: created on her session, behind an active plan, texts required, the week plan reused or made manual', () => {
  const post = items.slice(items.indexOf('export async function POST'));
  assert.match(post, /auth\.getUser\(\)/);
  assert.match(post, /requireActiveTenant\(supabase\)/);
  assert.match(post, /צריך לכתוב טקסט לפחות לרשת אחת/);
  assert.match(post, /generated_by: 'manual'/);
  assert.match(post, /template_key: null/);
  assert.doesNotMatch(post, /admin\(\)/, 'no service role to create a post');
});

ok('the picture: JPEG or PNG in HER folder, named after the post; an approval keeps the picture the post already has', () => {
  assert.match(items, /\\\.\(png\|jpe\?g\)\$/);
  assert.match(items, /b\.media_path\.startsWith\(`\$\{cur\.data\.tenant_id\}\/content\/\$\{id\}_`\)/);
  assert.match(items, /let mediaPath: string \| null = \(\(cur\.data as \{ media_path\?: string \| null \}\)\.media_path\) \|\| null;/);
  assert.match(media, /'image\/jpeg', 0\.9/);
  assert.match(media, /\$\{tenantId\}\/content\/\$\{itemId\}_\$\{Date\.now\(\)\}\.jpg/);
  // template cards are drawn through the same JPEG path
  assert.match(ui, /return uploadPostPicture\(blob, tenantId, itemId\);/);
});

ok('the calendar reads a date range of her own posts; pictures are shown through short-lived server-signed links', () => {
  assert.match(plan, /\.eq\('tenant_id', tenantId\)\.neq\('status', 'skipped'\)/);
  assert.match(plan, /createSignedUrls\(withMedia\.map/);
  assert.match(plan, /r\.media_path\.startsWith\(`\$\{tenantId\}\/`\)/);
  assert.match(ui, /\/api\/content\/plan\?from=\$\{grid\.from\}&to=\$\{grid\.to\}/);
  assert.match(ui, /data-testid="content-calendar"/);
  assert.match(ui, /data-testid="content-composer"/);
  assert.match(ui, /onDrop=/);
});

ok('the month grid starts on Sunday and ends on Saturday', () => {
  // the grid logic, re-run here exactly as in the component (it is a client file importing the browser client)
  const src = ui.slice(ui.indexOf('export function monthGrid'), ui.indexOf('const itemState'));
  const ymdLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // eslint-disable-next-line no-new-func
  const monthGrid = new Function('ymdLocal', `${src.replace('export function', 'function')}; return monthGrid;`)(ymdLocal);
  const g = monthGrid(2026, 9); // October 2026: Thursday the 1st
  assert.equal(g.days[0].getDay(), 0);
  assert.equal(g.days[g.days.length - 1].getDay(), 6);
  assert.equal(g.days.length % 7, 0);
  assert.equal(g.from, '2026-09-27');
  assert.equal(g.to, '2026-10-31');
});

console.log(`${n} passed`);
