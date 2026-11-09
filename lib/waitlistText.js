// lib/waitlistText.js
//
// The smart waitlist's two client messages (lib/waitlistOffers.js sends them). Kept apart from the server module so the browser can
// show her the EXACT offer before she turns the feature on (app/AutomationSuggestCard.jsx): one source for the preview and the send.

import { fmtTime } from "./apptTime.ts";
import { MARKETING_FOOTER } from "./marketingConsent.js";

export const niceDate = (date) => { const [, m, d] = String(date).split("-"); return d && m ? `${d}/${m}` : String(date); };

export function offerMessage({ name, clinic, service, date, minute, url }) {
  return (
    `שלום${name ? ` ${name}` : ""}! 🌸\n` +
    `כאן ${clinic}. את ברשימת ההמתנה שלנו, והתפנה תור${service ? ` ל${service}` : ""} ב-${niceDate(date)} בשעה ${fmtTime(minute)}.\n` +
    `רוצה אותו? אפשר לתפוס כאן, והראשונה שלוחצת מקבלת:\n${url}\n\n${MARKETING_FOOTER}`
  );
}

export function takenMessage({ name, clinic, service, date, minute }) {
  return (
    `שלום${name ? ` ${name}` : ""} 🌸\n` +
    `התור${service ? ` ל${service}` : ""} ב-${niceDate(date)} בשעה ${fmtTime(minute)} כבר נתפס, מישהי הקדימה אותך הפעם.\n` +
    `את נשארת ברשימת ההמתנה של ${clinic}, ונעדכן אותך כשיתפנה עוד תור.`
  );
}
