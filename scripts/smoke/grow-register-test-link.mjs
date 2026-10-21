// A Grow merchant-registration (GetLink) link in Grow's TEST environment, for Grow's go-live check "onboard a fictitious dealer up to the
// ID-verification step". Refuses anything but the test key and the test address. No Kalmea database row is written.
//   node --env-file=.env.local scripts/smoke/grow-register-test-link.mjs <fictitious 9-digit business number> <her mobile 05XXXXXXXX>
// Grow texts the form link to that mobile, and the form has to be filled from that phone.
import { registerConfig, createLiveRegistration, GROW_REGISTER_TEST_URL } from '../../lib/grow/registration.ts';

const [businessNumber, phone] = process.argv.slice(2);
if (!/^\d{9}$/.test(businessNumber || '') || !/^05\d{8}$/.test(phone || '')) { console.error('usage: <9-digit business number> <05XXXXXXXX>'); process.exit(2); }
const env = { ...process.env, GROW_REGISTER_ENV: '' }; // test only, whatever the shell says
const cfg = registerConfig(env);
if (!cfg || cfg.url !== GROW_REGISTER_TEST_URL || cfg.isDirectDebit !== 1) { console.error('[register-test] the TEST registration key is not set'); process.exit(2); }
const r = await createLiveRegistration(cfg).createLink({ trackingCode: 'go-live-test', businessNumber, phone });
console.log(JSON.stringify(r.ok ? { ok: true, url: r.url, encryptedLead: `${r.encryptedLead.slice(0, 6)}…` } : r));
process.exit(r.ok ? 0 : 1);
