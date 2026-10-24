// The demo never opens WhatsApp, a call or an SMS (its clients have real-looking
// numbers; /demo promises nothing goes out). lib/demoOutbound.js.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isOutboundContactUrl } from './lib/demoOutbound.js';

for (const u of ['https://wa.me/972501001644?text=hi', 'https://api.whatsapp.com/send/?phone=972501001644', 'http://wa.me/x', 'whatsapp://send?text=a', 'tel:0501001644', 'sms:0501001644', ' https://web.whatsapp.com/']) {
  assert.ok(isOutboundContactUrl(u), `blocked: ${u}`);
}
for (const u of ['https://kalmea.app/demo-cosmetics', '/api/messages', 'https://www.facebook.com/', '', 'mailto:a@b.c', 'https://evil.example/wa.me/1']) {
  assert.ok(!isOutboundContactUrl(u), `allowed: ${u}`);
}
assert.ok(!isOutboundContactUrl(null as unknown as string));

const dash = fs.readFileSync(new URL('./app/beautyos.jsx', import.meta.url), 'utf8');
assert.match(dash, /if\(!isDemoTenant\) return;\s*return installDemoOutboundGuard\(/, 'the dashboard installs the guard for demo tenants only');

console.log('test-demo-outbound: ok');
