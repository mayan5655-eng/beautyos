// Remove the tenant that phone-setup.mjs made (exact tenant from the meta file; refuses the real one).
import fs from 'node:fs';
import { purgeTenant } from './admin-tools.mjs';
const m = JSON.parse(fs.readFileSync(process.argv[2] + '.meta.json', 'utf8'));
console.log('purged', m.email, await purgeTenant(m.tenantId, m.userId));
