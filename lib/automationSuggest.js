// lib/automationSuggest.js
//
// The "want me to do this for you?" card on the Today screen (app/AutomationSuggestCard.jsx) for two automations that are OFF by
// default because they message her clients in her name: the smart waitlist offer and the "time for the next treatment" nudge.
// Nothing is turned on here: the card asks, shows the exact message a client would get, and only her tap on "להפעיל" stores her
// switch as true (the same key the Settings switch writes).
//
// A suggestion is shown only when:
//   - the platform flag allows the feature (feature_flags.<flag> !== false);
//   - her switch was never stored (undefined). A stored false means she turned it off in Settings: we do not ask again;
//   - she has not dismissed this suggestion (automations.automation_suggest_dismissed.<key> === true hides it for good).
// Pure: no React, no network, so test-waitlist-rebook.ts checks it with plain objects.

import { waitlistOffersVisible } from './waitlistFlag.js';
import { rebookVisible, rebookText } from './reminders/rebookPlan.js';
import { offerMessage } from './waitlistText.js';
import { clinicName } from './clinicName.ts';

export const DISMISS_KEY = 'automation_suggest_dismissed';
const SAMPLE_CLIENT = 'רונית';

const asObj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/** A date a few days from `now`, 'YYYY-MM-DD', for the sample offer. */
function sampleDate(now) {
  const d = new Date(now.getTime() + 3 * 86400000);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

/**
 * @param {object} settings  her settings row (automations, business_name, tenant_id)
 * @param {object} [o] { services: her service rows (for a real treatment name in the sample), origin: the app's URL, now }
 * @returns {Array<{ key: 'waitlist'|'rebook', switchKey: string, question: string, body: string, preview: string }>}
 */
export function automationSuggestions(settings, { services = [], origin = '', now = new Date() } = {}) {
  const a = asObj(settings?.automations);
  const dismissed = asObj(a[DISMISS_KEY]);
  const clinic = clinicName(settings);
  const active = (services || []).filter((s) => s && s.active !== false && String(s.name || '').trim());
  const svc = String(active[0]?.name || 'טיפול פנים').trim();
  const out = [];
  if (waitlistOffersVisible(settings) && a.waitlist_offers === undefined && dismissed.waitlist !== true) {
    out.push({
      key: 'waitlist',
      switchKey: 'waitlist_offers',
      question: 'להציע אוטומטית תורים שהתפנו לרשימת ההמתנה?',
      body: 'כשמתבטל תור, מי שמחכה והתור מתאים לה מקבלת הצעה בוואטסאפ, והראשונה שלוחצת מקבלת אותו. לא בשבת ובלילה, ואת רואה מה קרה.',
      preview: offerMessage({ name: SAMPLE_CLIENT, clinic, service: svc, date: sampleDate(now), minute: 14 * 60, url: `${origin}/claim/…` }),
    });
  }
  if (rebookVisible(settings) && a.rebook_enabled === undefined && dismissed.rebook !== true) {
    out.push({
      key: 'rebook',
      switchKey: 'rebook_enabled',
      question: 'לשלוח ללקוחות תזכורת כשמגיע הזמן לטיפול הבא?',
      body: 'ללקוחה שאין לה תור עתידי, כשעבר הזמן שמתאים לטיפול שלה. רק למי שהסכימה לקבל הודעות, ולא יותר מפעם ב-3 שבועות.',
      preview: rebookText({ name: SAMPLE_CLIENT, businessName: clinic, service: svc, daysSince: 21, url: `${origin}/book?t=${settings?.tenant_id || ''}` }),
    });
  }
  return out;
}
