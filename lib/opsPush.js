// lib/opsPush.js
//
// SERVER ONLY. The push channel for raiseOpsAlert (lib/opsAlert.js, channel 4): a web push to the platform owner's own devices
// (the browsers she allowed notifications in, on her own business), opening the admin page. It does not go through WhatsApp,
// so "WhatsApp is down" can still reach her. Best-effort: lib/operatorPush.js never throws.
import { pushToOperator } from './operatorPush.js';
import { platformOwnerTenantIds } from './subscribersData.ts';

/** A push function for raiseOpsAlert({ push }), bound to a service-role client. */
export function opsPush(db) {
  return async ({ title, body }) => {
    const ids = await platformOwnerTenantIds(db);
    if (!ids.length) return { configured: false, devices: 0, sent: 0, dead: 0, failed: 0 };
    return pushToOperator(db, ids, { title, body, url: '/dashboard/admin', tag: `ops-${new Date().toISOString().slice(0, 13)}` });
  };
}
