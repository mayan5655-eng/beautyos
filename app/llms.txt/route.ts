// app/llms.txt/route.ts
//
// /llms.txt - the plain-Markdown summary some AI crawlers and agents look for
// (llmstxt.org): an H1, a one-line description, and links to the pages worth
// reading. Lighthouse's experimental "Agentic Browsing" category checks for it.
//
// Only what is true and public: the landing page, the demo, signup and the two
// legal pages. A tenant's booking page (/<slug>) is deliberately not listed -
// those belong to individual businesses, and a client's booking link is for the
// client. There is no ai-catalog.json to go with this: that file lists
// machine-callable resources (APIs, MCP servers) an agent could use, and Kalmea
// publishes none, so a catalog would be an empty promise.

import { APP_URL } from '@/lib/appUrl';

export const dynamic = 'force-static';

export function GET() {
  const body = `# Kalmea (קלמיה)

> Kalmea is a Hebrew-language, right-to-left business app for independent beauty professionals - cosmeticians and nail technicians - in Israel. Calendar, clients, payments and ready-made marketing content in one place. The first month is free.

The product is for the business owner. Her clients book through a personal page of her own, which is not listed here.

## Public pages

- [Home](${APP_URL}/): what Kalmea is, what it replaces and what it costs to run a small beauty business without it
- [Demo](${APP_URL}/demo): a walk-through of the app with sample data, for cosmetics and for nails
- [Sign up](${APP_URL}/signup): start the free first month
- [Terms of use](${APP_URL}/terms): the terms of service, in Hebrew and English
- [Privacy policy](${APP_URL}/privacy): how personal data is handled, in Hebrew and English
`;
  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}
