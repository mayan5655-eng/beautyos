// Every screen of the system has its own link (2026-10-30): the address names the screen, refresh stays on it, and a signed-out visitor
// comes back to it after signing in.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { screenFromSearch, searchForScreen, sameScreen, viewOf, loginPathForScreen } from './lib/screenLink.ts';
import { safeNext } from './lib/safeNext.ts';

let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };
const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');

ok('a tab link reads back as that screen, and every nav tab in the app is known', () => {
  const src = rd('app/beautyos.jsx');
  const block = src.slice(src.indexOf('const NAV_ITEMS = ['), src.indexOf('].filter(item => isTabVisible(settings, item.id));', src.indexOf('const NAV_ITEMS = [')));
  const ids = [...block.matchAll(/id:"([a-z]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 14, `found ${ids.length}`);
  for (const id of ids) assert.equal(screenFromSearch(`?tab=${id}`).tab, id);
});

ok('no parameter and an unknown tab are היום, and היום writes no parameter', () => {
  assert.deepEqual(screenFromSearch(''), { tab: 'dashboard', section: null, view: null });
  assert.equal(screenFromSearch('?tab=nothing').tab, 'dashboard');
  assert.equal(searchForScreen('?tab=calendar', { tab: 'dashboard', section: null, view: null }), '');
});

ok('settings is a panel with a group, and an unknown group opens the first one', () => {
  assert.deepEqual(screenFromSearch('?tab=settings&section=booking'), { tab: null, section: 'booking', view: null });
  assert.equal(screenFromSearch('?tab=settings').section, 'business');
  assert.equal(screenFromSearch('?tab=settings&section=x').section, 'business');
  assert.equal(searchForScreen('', { tab: 'calendar', section: 'page', view: null }), '?tab=settings&section=page');
});

ok('a view only counts on the screen it belongs to', () => {
  assert.equal(screenFromSearch('?tab=whatsapp&view=log').view, 'log');
  assert.equal(screenFromSearch('?tab=campaigns&view=reels').view, 'reels');
  assert.equal(screenFromSearch('?tab=calendar&view=log').view, null);
  assert.equal(searchForScreen('', { tab: 'whatsapp', section: null, view: 'log' }), '?tab=whatsapp&view=log');
});

ok('the three switches map to a view', () => {
  const s = { waView: 'send', marketingView: 'posts', aiPostsView: 'studio' };
  assert.equal(viewOf('whatsapp', s), null);
  assert.equal(viewOf('whatsapp', { ...s, waView: 'log' }), 'log');
  assert.equal(viewOf('campaigns', s), null);
  assert.equal(viewOf('campaigns', { ...s, marketingView: 'campaigns' }), 'campaigns');
  assert.equal(viewOf('campaigns', { ...s, aiPostsView: 'reels' }), 'reels');
  assert.equal(viewOf('calendar', { ...s, waView: 'log' }), null);
});

ok('other parameters on the address survive', () => {
  assert.equal(searchForScreen('?fb_success=true&tab=leads', { tab: 'calendar', section: null, view: null }), '?fb_success=true&tab=calendar');
  assert.equal(searchForScreen('?import=1&tab=leads', { tab: 'dashboard', section: null, view: null }), '?import=1');
});

ok('sameScreen tells screens apart', () => {
  assert.ok(sameScreen(screenFromSearch('?tab=calendar&utm=1'), { tab: 'calendar', section: null, view: null }));
  assert.ok(!sameScreen(screenFromSearch('?tab=whatsapp&view=log'), { tab: 'whatsapp', section: null, view: null }));
  assert.ok(!sameScreen(screenFromSearch('?tab=settings&section=page'), { tab: 'calendar', section: null, view: null }));
  assert.ok(sameScreen(screenFromSearch('?tab=settings&section=page'), { tab: 'calendar', section: 'page', view: null }));
});

ok('signed out, a screen link goes through login and passes safeNext; other addresses are left alone', () => {
  const to = loginPathForScreen('/dashboard', '?tab=settings&section=booking');
  assert.equal(to, '/login?next=%2Fdashboard%3Ftab%3Dsettings%26section%3Dbooking');
  assert.equal(safeNext(new URLSearchParams(to!.split('?')[1]).get('next')), '/dashboard?tab=settings&section=booking');
  assert.equal(loginPathForScreen('/', '?tab=calendar'), '/login?next=%2Fdashboard%3Ftab%3Dcalendar');
  assert.equal(loginPathForScreen('/dashboard', ''), null);
  assert.equal(loginPathForScreen('/dashboard/owner', '?tab=calendar'), null);
  assert.match(rd('lib/supabase/middleware.ts'), /loginPathForScreen\(/);
});

ok('the address is read only after the data loaded, and the write hook runs before the read one', () => {
  const src = rd('app/beautyos.jsx');
  const w = src.indexOf('[activeTab, showSettings, settingsGroup, waView, marketingView, aiPostsView]');
  const r = src.indexOf('if (loading || screenLinkReady.current) return;');
  assert.ok(w > 0 && r > w);
  assert.ok(r < src.indexOf('if(loading) return ('), 'the hooks sit before the loading return');
});

console.log(`\n${n} passed`);
