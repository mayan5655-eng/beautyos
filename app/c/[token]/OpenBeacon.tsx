'use client';

// Tells the server "she opened it", once per browser session, after the page has loaded (so a link-preview crawler, which runs
// no script, is never counted). Sends the token and nothing else. A failure is ignored: the page is for the client, not for us.
import { useEffect } from 'react';

export default function OpenBeacon({ token }: { token: string }) {
  useEffect(() => {
    const key = `kp:${token.slice(0, 22)}`;
    try { if (window.sessionStorage.getItem(key)) return; } catch { /* storage blocked: count it anyway, the server is cheap */ }
    fetch('/api/client-page/open', {
      method: 'POST', keepalive: true, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token }),
    }).then(() => { try { window.sessionStorage.setItem(key, '1'); } catch { /* ignore */ } }).catch(() => {});
  }, [token]);
  return null;
}
