// test-cron-auth.js
//
// Who can run the all-tenant crons.
//
// lib/cronAuth.js used to accept ANY request that carried an `x-vercel-cron`
// header, on the belief that Vercel strips it from outside traffic. It does not:
// on 2026-10-05 an unauthenticated request with `x-vercel-cron: 1` (and even
// `x-vercel-cron: 0`) was answered 200 by production's send-smart-reminders. The
// same guard fronts the live all-tenant reminder blast, the evening summary, the
// receipt retry, the invariants job and the demo reset - so anyone on the
// internet could have triggered WhatsApp messages to every tenant's clients.
//
// The only thing that proves a caller is Vercel's cron is the secret it presents
// (`Authorization: Bearer <CRON_SECRET>`, which Vercel sends on every cron
// invocation when the project has CRON_SECRET set - production does). A header
// anyone can type proves nothing.
import fs from 'node:fs';
import { isAuthorizedCron } from './lib/cronAuth.js';

let passed = 0, failed = 0;
const ok = (label, cond) => { if (cond) passed++; else { failed++; console.log(`  FAIL  ${label}`); } };
const req = (headers) => new Request('https://example.test/api/x', { headers });

const SECRET = 'a-long-random-test-secret';
process.env.CRON_SECRET = SECRET;

ok('no credentials: refused', !isAuthorizedCron(req({})));
ok('x-vercel-cron: 1 alone is NOT enough', !isAuthorizedCron(req({ 'x-vercel-cron': '1' })));
ok('x-vercel-cron: 0 is not either', !isAuthorizedCron(req({ 'x-vercel-cron': '0' })));
ok('x-vercel-cron with a wrong bearer: refused', !isAuthorizedCron(req({ 'x-vercel-cron': '1', authorization: 'Bearer nope' })));
ok('the user-agent Vercel uses proves nothing', !isAuthorizedCron(req({ 'user-agent': 'vercel-cron/1.0' })));
ok('the right bearer secret: allowed', isAuthorizedCron(req({ authorization: `Bearer ${SECRET}` })));
ok('the right x-cron-secret: allowed', isAuthorizedCron(req({ 'x-cron-secret': SECRET })));
ok('a wrong bearer: refused', !isAuthorizedCron(req({ authorization: 'Bearer wrong' })));
ok('a bearer of the wrong length: refused', !isAuthorizedCron(req({ authorization: `Bearer ${SECRET}x` })));
ok('a prefix of the secret: refused', !isAuthorizedCron(req({ authorization: `Bearer ${SECRET.slice(0, -1)}` })));
ok('the secret without the Bearer scheme: refused', !isAuthorizedCron(req({ authorization: SECRET })));

// Fail closed: no configured secret means nobody is authorised - not "everybody
// with the header", and not "everybody who sends an empty secret".
delete process.env.CRON_SECRET;
ok('no CRON_SECRET configured: x-vercel-cron still refused', !isAuthorizedCron(req({ 'x-vercel-cron': '1' })));
ok('no CRON_SECRET configured: an empty bearer is refused', !isAuthorizedCron(req({ authorization: 'Bearer ' })));
ok('no CRON_SECRET configured: undefined-looking bearer is refused', !isAuthorizedCron(req({ authorization: 'Bearer undefined' })));
process.env.CRON_SECRET = '';
ok('an empty CRON_SECRET authorises nothing', !isAuthorizedCron(req({ authorization: 'Bearer ' })) && !isAuthorizedCron(req({ 'x-cron-secret': '' })));
ok('no request object: refused', !isAuthorizedCron(null) && !isAuthorizedCron({}));

// Nothing else in the app may trust that header either.
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(e.name)) out.push(p);
  }
  return out;
};
const code = (f) => fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const trusting = [...walk('app'), ...walk('lib'), 'proxy.ts'].filter((f) => /x-vercel-cron/i.test(code(f)));
ok(`no code path grants access on x-vercel-cron (found: ${trusting.join(', ') || 'none'})`, trusting.length === 0);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
