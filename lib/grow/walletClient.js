// lib/grow/walletClient.js
//
// BROWSER ONLY, plain JavaScript on purpose: the payment page (app/pay/[token]/PayClient.jsx) imports it, and the Playwright sandbox
// test (scripts/smoke/grow-wallet.mjs) serves this exact file, so the code that opens Grow's wallet is the code that was tested.
// Grow's SDK (developers.grow.business > Growin Wallet SDK): load https://cdn.meshulam.co.il/sdk/gs.min.js, growPayment.init({ environment,
// version: 1, events }), then growPayment.renderPaymentOptions(authCode) with the authCode createPaymentProcess returned.

export const GROW_SDK_SRC = 'https://cdn.meshulam.co.il/sdk/gs.min.js';

function loadSdk(doc) {
  return new Promise((resolve, reject) => {
    if (doc.defaultView.growPayment) { resolve(); return; }
    const s = doc.createElement('script');
    s.src = GROW_SDK_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('sdk'));
    doc.head.appendChild(s);
  });
}

/** Load Grow's script as soon as the page opens, so it has fetched its own parts by the time she taps pay. */
export function preloadGrowSdk(win) {
  return loadSdk(win.document).catch(() => {});
}

/**
 * Opens the wallet. events: { onSuccess(info), onFailure(msg), onCancel(), onOpenChange(open) }. The money moves on Grow's side;
 * onSuccess only means "Grow says paid": the page then waits for OUR record (Grow's server callback) before it thanks the client.
 */
export async function openGrowWallet(win, { sdkEnv, authCode, events }) {
  await loadSdk(win.document);
  const ev = events || {};
  // The SDK fetches its own parts (stylesheet, form, config) after its script has loaded; asking for the wallet before that finishes
  // answers "SDK was not loaded as needed". That one answer is retried briefly; any other answer is the client's.
  let waits = 0;
  const ask = () => win.growPayment.renderPaymentOptions(authCode);
  const notReady = (r) => /not loaded/i.test(String((r && r.message) || r || '')) && waits < 16;
  win.growPayment.init({
    environment: sdkEnv === 'PRODUCTION' ? 'PRODUCTION' : 'DEV',
    version: 1,
    events: {
      onSuccess: (r) => ev.onSuccess && ev.onSuccess(r && r.data ? r.data : {}),
      onFailure: (r) => { if (notReady(r)) { waits += 1; setTimeout(ask, 500); return; } if (ev.onFailure) ev.onFailure((r && r.message) || '', r); },
      onError: (r) => { if (notReady(r)) { waits += 1; setTimeout(ask, 500); return; } if (ev.onFailure) ev.onFailure((r && r.message) || '', r); },
      onTimeout: () => ev.onFailure && ev.onFailure('timeout'),
      onWalletChange: (state) => ev.onOpenChange && ev.onOpenChange(state === 'open' || state === true),
      onPaymentCancel: () => ev.onCancel && ev.onCancel(),
    },
  });
  ask();
}
