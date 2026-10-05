// test-no-live-env.js
//
// A test must never be able to touch production. This asserts that the process
// running the suite is holding PLACEHOLDER credentials for everything that
// spends money, sends messages or writes data - even on a machine (Vercel's
// build runs `npm test` first) where the real ones are present in the
// environment.
//
// Why it exists. scripts/run-tests.mjs used to build each test's environment as
// { ...FAKE_ENV, ...process.env }: the real variables won. Locally that was
// harmless (.env.local holds placeholders). On Vercel it handed every test the
// real Supabase URL and service-role key, so any test that reached the metering
// code without an injected database - the stubbed AI tests - quietly INSERTED
// rows into production ai_usage on every deploy: unattributed rows and rows for
// a made-up tenant, each with stub token counts and so "$0.00". They looked like
// uncapped usage that the dollar ceiling could not see. They were test residue,
// and the runner's own comment promised that could not happen.
//
// If this test fails, someone has put the real environment back in front of the
// tests. Fix the runner, not this file.
let passed = 0, failed = 0;
const ok = (label, cond) => { if (cond) passed++; else { failed++; console.log(`  FAIL  ${label}`); } };

ok('Supabase URL is the placeholder', process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://placeholder.supabase.co');
ok('Supabase service key is the placeholder', process.env.SUPABASE_SERVICE_ROLE_KEY === 'placeholder-service-key');
ok('Supabase anon key is the placeholder', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === 'placeholder-anon-key');
for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GREENAPI_ID_INSTANCE', 'GREENAPI_API_TOKEN', 'CRON_SECRET', 'FACEBOOK_APP_SECRET', 'NEXT_PUBLIC_SUPPORT_WHATSAPP', 'SENTRY_AUTH_TOKEN']) {
  ok(`${k} is empty - no test can spend, send or authenticate with it`, !process.env[k]);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
