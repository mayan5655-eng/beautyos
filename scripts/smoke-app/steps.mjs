// scripts/smoke-app/steps.mjs — what the browser run opens and presses. One step = one fresh load of a screen, then clicks.
// A click names the words on the button (the first VISIBLE match is pressed) or a CSS selector.
const TABS = ['dashboard', 'insights', 'calendar', 'clients', 'leads', 'cashier', 'tax', 'whatsapp', 'campaigns', 'community', 'packages', 'protocols', 'advisor', 'help'];
const SECTIONS = ['business', 'page', 'booking', 'payments', 'messages', 'clients', 'connections', 'advanced'];
const c = (name, tab, ...clicks) => ({ name, goto: `?tab=${tab}`, clicks: clicks.map((x) => (typeof x === 'string' ? { text: x } : x)) });

export const STEPS = [
  ...TABS.map((t) => ({ name: `tab-${t}`, goto: `?tab=${t}` })),
  ...SECTIONS.map((s) => ({ name: `settings-${s}`, goto: `?tab=settings&section=${s}` })),
  c('dash-more', 'dashboard', { text: 'עוד', exact: true }),
  c('dash-newlead', 'dashboard', 'פנייה חדשה'),
  c('dash-help', 'dashboard', 'תקועה?'),
  c('dash-pay', 'dashboard', 'רישום תשלום'),
  c('dash-remind', 'dashboard', 'תזכורת בוואטסאפ'),
  c('dash-settings', 'dashboard', { sel: 'button[aria-label*="הגדרות"]' }),
  c('cal-new', 'calendar', '✦ תור חדש'),
  c('cal-personal', 'calendar', 'אירוע אישי'),
  c('cal-week', 'calendar', { text: 'שבוע', exact: true }),
  c('cal-waitlist', 'calendar', 'רשימת המתנה'),
  c('cal-appt', 'calendar', 'דנה כהן'),
  c('cal-free', 'calendar', '+ פנוי'),
  c('cal-next-day', 'calendar', { sel: 'button[aria-label*="הבא"]' }),
  c('cli-card', 'clients', 'דנה כהן'),
  c('cli-card-2', 'clients', 'מיכל לוי'),
  c('cli-new', 'clients', '✦ לקוחה חדשה'),
  c('cli-import', 'clients', 'ייבוא לקוחות'),
  c('cli-lapsed', 'clients', 'מזמן לא הגיעו'),
  c('cli-msg', 'clients', '✆ הודעה'),
  c('lead-card', 'leads', 'ליד בדיקה'),
  c('lead-new', 'leads', '✦ פנייה חדשה'),
  c('lead-import', 'leads', 'ייבוא פניות'),
  c('lead-convert', 'leads', 'המר ✓'),
  c('cash-new', 'cashier', '✦ תשלום חדש'),
  c('cash-quick', 'cashier', '₪ קופה'),
  c('cash-vouchers', 'cashier', 'שוברי מתנה'),
  c('cash-products', 'cashier', { text: 'מוצרים', exact: true }),
  c('cash-receipt', 'cashier', { text: 'אישורי תשלום', exact: true }),
  c('wa-log', 'whatsapp', 'יומן הודעות'),
  c('wa-send', 'whatsapp', { text: 'שלחי', exact: true }),
  c('wa-bulk', 'whatsapp', '✆ שליחה מרוכזת'),
  c('tax-status', 'tax', 'לבחירת סטטוס עוסק'),
  c('adv-ask', 'advisor', 'איך אחזיר לקוחות רדומות?'),
];
