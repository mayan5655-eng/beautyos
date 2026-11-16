'use client';

// app/privacy/AdConsentReset.tsx
// Withdraws (or re-opens) the Meta Pixel consent given on the landing / signup bar (app/MetaPixel.tsx). Clears this
// browser's choice and Meta's own first-party cookie, so the bar asks again on the next visit.
import { useState } from 'react';
import { saveAdConsent } from '@/lib/metaPixel';

export default function AdConsentReset() {
  const [done, setDone] = useState(false);
  const reset = () => {
    saveAdConsent(null);
    try { document.cookie = '_fbp=; Max-Age=0; path=/; domain=.' + location.hostname.replace(/^www\./, ''); document.cookie = '_fbp=; Max-Age=0; path=/'; } catch { /* nothing to clear */ }
    setDone(true);
  };
  return done
    ? <span role="status">ההסכמה בוטלה. בביקור הבא נשאל שוב.</span>
    : <button type="button" onClick={reset} style={{ font: 'inherit', fontWeight: 600, color: 'inherit', background: 'none', border: 'none', padding: 0, textDecoration: 'underline', cursor: 'pointer' }}>לביטול ההסכמה למדידת מודעות בדפדפן הזה</button>;
}
