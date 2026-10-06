// The shared frame of the public pages: what a client's page is built from.
//
// The rule (2026-10-06): on a page that belongs to a business, HER logo, colour and name are the most prominent things on it,
// and Kalmea is the small mark at the bottom, never competing. One quiet flower per page. Kalmea's own pages (404, error)
// are Kalmea's: no "powered by", and no business accent.
//
// This RENDERS the real components (testkit/render.mjs) and reads the HTML. The pages' loaded states are shown by
// screenshots (before/after at 430 px in the Stage 4 report) because they need a live API; here: the frame, and the first
// state each client page renders before its data arrives.
import assert from 'node:assert/strict';
import { importApp, renderApp } from './testkit/render.mjs';

const chrome = await importApp('app/PublicChrome.tsx');
const { PublicPage, BusinessHeader, LineIcon, PoweredBy } = chrome;
import React from 'react';
const h = React.createElement;
const count = (html: string, re: RegExp) => (html.match(re) || []).length;

// ── a business's page ───────────────────────────────────────────────────────────────────────────────
const her = renderApp(PublicPage, { primary: '#3E7C8C' }, ) as string;
const herPage = renderApp(() => h(PublicPage, { primary: '#3E7C8C' }, h('p', null, 'תוכן')));
assert.equal(count(herPage, /<main\b/g), 0, 'no nested <main>: the layout supplies the one landmark');
assert.equal(count(herPage, /pub-wm/g), 1, 'one watermark per page');
assert.ok(/--pc:#3E7C8C/i.test(herPage), 'her colour is applied as the page accent (--pc)');
assert.ok(herPage.includes('dir="rtl"'), 'right to left');
assert.ok(herPage.includes('pub-powered') && /alt="Kalmea"/.test(herPage), 'Kalmea is there, as the small mark');
const mark = /<img[^>]*alt="Kalmea"[^>]*>/.exec(herPage)![0];
assert.ok(/width="66"/.test(mark), 'and it is small (66 px wide)');
assert.ok(herPage.indexOf('תוכן') < herPage.indexOf('pub-powered'), 'at the bottom, after her content');
assert.ok(!/--brand-accent/.test(herPage.split('pub-main')[0]), "Kalmea's green is not painted over her page");
void her;

// ── Kalmea's own page ───────────────────────────────────────────────────────────────────────────────
const own = renderApp(() => h(PublicPage, { owner: 'kalmea' }, h('p', null, 'x')));
assert.equal(count(own, /pub-wm/g), 1, 'one watermark here too');
assert.ok(!own.includes('pub-powered') && !own.includes('מופעל על ידי'), 'no "powered by" on Kalmea\'s own page');
assert.ok(!/--pc:/.test(own), 'and no business accent');

// ── her logo and name come first, large, in that order ──────────────────────────────────────────────
const header = renderApp(() => h(BusinessHeader, { logoUrl: 'https://x.test/logo.png', name: 'סטודיו נועה' }));
assert.ok(header.indexOf('<img') >= 0 && header.indexOf('<img') < header.indexOf('סטודיו נועה'), 'her logo, then her name');
assert.ok(/class="pub-biz-name"/.test(header), 'the name is the page headline style (Frank Ruhl, 26px)');
assert.ok(/alt="סטודיו נועה"/.test(header), 'the logo carries her name as alt text');
const nameOnly = renderApp(() => h(BusinessHeader, { name: 'סטודיו נועה' }));
assert.ok(!nameOnly.includes('<img') && nameOnly.includes('סטודיו נועה'), 'no logo: her name alone, no empty image');
assert.equal(renderApp(() => h(BusinessHeader, {})), '', 'neither: nothing, no empty gap');

// ── the line icon on an empty state ─────────────────────────────────────────────────────────────────
const icon = renderApp(() => h(LineIcon, { src: '/brand-icons/icon-question.png' }));
assert.ok(icon.includes('/brand-icons/icon-question.png') && icon.includes('pub-icon') && icon.includes('aria-hidden'), 'decorative line icon');
assert.ok(renderApp(() => h(PoweredBy)).includes('מופעל על ידי'));

// ── the pages: first state each renders (before its link is checked) ───────────────────────────────
const confirm = (await importApp('app/confirm/page.jsx')).default;
const confirmHtml = renderApp(confirm);
// (a Suspense fallback or the content: either way it is inside the shared frame)
assert.ok(/pub-page/.test(confirmHtml) && count(confirmHtml, /pub-wm/g) === 1, 'confirm/cancel renders inside the shared frame with one watermark');

const review = (await importApp('app/review/page.jsx')).default;
const reviewHtml = renderApp(review);
assert.ok(/pub-page/.test(reviewHtml) && count(reviewHtml, /<main\b/g) === 0 && !reviewHtml.includes('pub-powered'), 'review before its link is checked: Kalmea\'s frame (there is no business yet)');

const claim = (await importApp('app/claim/[token]/page.tsx')).default;
const claimHtml = renderApp(claim);
assert.ok(/pub-page/.test(claimHtml) && claimHtml.includes('pub-powered'), 'claim: the shared frame, with the small Kalmea mark');

const nf = (await importApp('app/not-found.tsx')).default;
const nfHtml = renderApp(nf);
assert.ok(nfHtml.includes('הדף לא נמצא') && !nfHtml.includes('pub-powered') && count(nfHtml, /pub-wm/g) === 1, '404: Kalmea\'s page, one watermark, a way back');
assert.ok(/href="\/"/.test(nfHtml), 'with a link home');

const bnf = (await importApp('app/[slug]/not-found.tsx')).default;
assert.ok(renderApp(bnf).includes('לא מצאנו עסק בכתובת הזו'), 'no-such-business 404 keeps her words');

console.log('public chrome: ok');
