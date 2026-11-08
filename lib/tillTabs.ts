// lib/tillTabs.ts
//
// The till (קופה) screen in simple tabs: payments always, gift vouchers and products only while that feature is on for her.
// One tab alone shows no tab bar at all (app/beautyos.jsx), so a business with vouchers and products off sees the till as before.

export type TillTabKey = 'pay' | 'vouchers' | 'products';
export type TillTab = { k: TillTabKey; l: string };

export function tillTabsOf(on: { vouchers?: boolean; products?: boolean }): TillTab[] {
  const tabs: TillTab[] = [{ k: 'pay', l: 'תשלומים' }];
  if (on.vouchers) tabs.push({ k: 'vouchers', l: 'שוברי מתנה' });
  if (on.products) tabs.push({ k: 'products', l: 'מוצרים' });
  return tabs;
}

/** The tab to show: the one she chose while it still exists, otherwise payments (a feature switched off never leaves her on an empty tab). */
export function activeTillTab(chosen: string, tabs: TillTab[]): TillTabKey {
  return tabs.some((t) => t.k === chosen) ? (chosen as TillTabKey) : 'pay';
}
