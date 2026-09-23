# The launch library: 50 templates in the studio look

Every template here is a short definition in `lib/design/templates/cream/*.ts`;
the builder in `lib/design/templates/cream.ts` turns each one into a feed
4:5 and a story 9:16 template (keys `<slug>-feed` / `<slug>-story`). All 50
fill from her settings: logo, accent colour, business name, phone and
Instagram handle in the strip, her gallery for the photo, and every text is
editable in the fill form. Status: **all 50 are built** (the five marked ✔ were the review set).

Layouts the builder knows:

| layout | what it is | used by |
|---|---|---|
| `top` | one rounded photo block over cream, text below | most templates |
| `bleed` | full photo with a cream rise from the bottom | gift card, bridal, pampering, night, seasons |
| `pair` | two client photos side by side, labelled, consent required | before/after |
| `quote` | her saved review as a big quote with stars and name | testimonial |

Sources of the photo: **gallery** = her own uploads; **AI** = the image
route with the template's `aiHint`; **client** = a client's photo with
recorded consent; **product** = a product shot she uploads.

## Evergreen (20)

| # | key | name | category | layout | photo | price | deco | fill needs |
|---|---|---|---|---|---|---|---|---|
| 1 ✔ | `offer` | מבצע | offer | top | gallery / AI | ✔ | – | headline, price |
| 2 ✔ | `before-after` | לפני / אחרי | before_after | pair | client ×2 | – | – | two consented photos |
| 3 ✔ | `review` | לקוחה מספרת | review | quote | gallery / AI | – | – | a saved review |
| 4 | `tip` (feed v2) | טיפ לעור | tip | top | gallery / AI | – | leaf | headline |
| 5 | `package` | חבילת טיפולים | offer | top | gallery / AI | ✔ | – | headline, price |
| 6 | `acne` | טיפול באקנה | treatment | top | gallery / AI | – | – | headline |
| 7 | `pigmentation` | פיגמנטציה | treatment | top | gallery / AI | – | – | headline |
| 8 | `anti-aging` | אנטי אייג'ינג | treatment | top | gallery / AI | – | – | headline |
| 9 | `peel` | פילינג | treatment | top | gallery / AI | – | – | headline |
| 10 | `laser` | לייזר | treatment | top | gallery / AI | – | – | headline |
| 11 | `new-dates` | נפתחו תאריכים | announce | top | gallery / AI | – | sparkle | headline, dates line |
| 12 | `products` | מוצרים | treatment | top | product | ✔ (optional) | – | product photo |
| 13 | `routine` | שגרת טיפוח | tip | top | gallery / AI | – | leaf | headline, 3 short lines |
| 14 | `self-care` | זמן לעצמך | tip | bleed | gallery / AI | – | – | headline |
| 15 | `new-client` | מבצע ללקוחה חדשה | offer | top | gallery / AI | ✔ | – | headline, price |
| 16 | `slot-opened` | התפנה תור | announce | top | gallery / AI | – | – | day + hour line |
| 17 | `facial` | טיפול פנים | treatment | top | gallery / AI | – | – | headline |
| 18 | `pampering` | פינוק | treatment | bleed | gallery / AI | – | – | headline |
| 19 | `glow` | זוהר | treatment | top | gallery / AI | – | sparkle | headline |
| 20 | `pro-peel` | פילינג מקצועי | treatment | top | gallery / AI | ✔ (optional) | – | headline |

## Holidays and seasons (15)

The `holiday` key opens the template's window (see `lib/design/holidays.ts`):
the studio shows "ראש השנה בעוד 12 ימים, תרצי פוסט?" from `lead` days before
the date until `span` days after, then goes quiet. Hebrew dates come from
the runtime's Hebrew calendar, so the table never goes stale.

| # | key | name | `holiday` | window opens | deco | photo |
|---|---|---|---|---|---|---|
| 21 ✔ | `rosh-hashana` | ראש השנה | rosh_hashana | 21 days before 1 Tishrei | pomegranate | AI / gallery |
| 22 | `yom-kippur` | יום כיפור | yom_kippur | 10 days before 10 Tishrei | candle | AI / gallery |
| 23 | `sukkot` | סוכות | sukkot | 14 days before 15 Tishrei | leaf | AI / gallery |
| 24 | `hanukkah` | חנוכה | hanukkah | 21 days before 25 Kislev | candle | AI / gallery |
| 25 | `tu-bishvat` | ט"ו בשבט | tu_bishvat | 14 days before 15 Shevat | leaf | AI / gallery |
| 26 | `purim` | פורים | purim | 21 days before 14 Adar (II) | sparkle | AI / gallery |
| 27 | `pesach` | פסח | pesach | 21 days before 15 Nisan | leaf | AI / gallery |
| 28 | `independence` | יום העצמאות | yom_haatzmaut | 14 days before 5 Iyar (shifted off Fri/Sat/Mon) | sparkle | AI / gallery |
| 29 | `shavuot` | שבועות | shavuot | 14 days before 6 Sivan | leaf | AI / gallery |
| 30 | `womens-day` | יום האישה | womens_day | 14 days before March 8 | sparkle | AI / gallery |
| 31 | `summer` | קיץ | summer | June 15, open 60 days | wave | AI / gallery (bleed) |
| 32 | `autumn` | סתיו | autumn | October 15, open 45 days | leaf | AI / gallery (bleed) |
| 33 | `winter` | חורף | winter | December 1, open 60 days | – | AI / gallery (bleed) |
| 34 | `spring` | אביב | spring | March 21, open 45 days | leaf | AI / gallery (bleed) |
| 35 | `birthday` | יום הולדת | – (no window: per client) | – | ribbon | AI / gallery |

## Closers (15)

| # | key | name | category | layout | price | deco | fill needs |
|---|---|---|---|---|---|---|---|
| 36 | `duo` | מבצע לשתיים | offer | top | ✔ | – | headline, price |
| 37 | `bridal` | כלות | treatment | bleed | – | ribbon | headline |
| 38 | `night` | טיפול לילה | treatment | bleed | – | – | headline |
| 39 ✔ | `gift-card` | שובר מתנה | offer | bleed | ✔ (amount) | ribbon | amount |
| 40 | `massage` | עיסוי פנים | treatment | top | – | – | headline |
| 41 | `dermapen` | דרמפן | treatment | top | – | – | headline |
| 42 | `serums` | סרומים | treatment | top | product | – | product photo |
| 43 | `faq` | שאלה ותשובה | tip | top | – | – | question, answer |
| 44 | `info` | כדאי לדעת | tip | top | – | – | headline, 3 short lines |
| 45 | `myths` | מיתוס או אמת | tip | top | – | – | myth, truth |
| 46 | `natural-look` | מראה טבעי | treatment | top | – | leaf | headline |
| 47 | `skin-health` | בריאות העור | tip | top | – | – | headline |
| 48 | `thank-you` | תודה | announce | top | – | sparkle | headline |
| 49 | `referral` | חברה מביאה חברה | offer | top | ✔ (optional) | – | headline |
| 50 | `glow-story` (key `glow-story-story`) | זוהר (סטורי בלבד) | treatment | bleed | – | sparkle | headline |

Category totals for the gallery chips: offer 8, before_after 1, review 1,
treatment 19, tip 8, seasonal 15, announce 3 (template 50 is story-only, so
the feed count is 49 and the story count is 50).

## Layout families

Each definition names a family; the builder does the geometry for both formats. Spread: top 12, pair 1, text-first 6, split 7, frame 6, magazine 4, overlay 10, collage 4.

| # | key | name | family (variant) | page |
|---|---|---|---|---|
| 1 | `offer` | מבצע | top | cream |
| 2 | `before-after` | לפני / אחרי | pair | cream |
| 3 | `review` | לקוחה מספרת | top | cream |
| 4 | `tip` | טיפ לעור | text-first (block blush, photo circle) | cream |
| 5 | `package` | חבילת טיפולים | split (side bottom, block primary) | cream |
| 6 | `acne` | טיפול באקנה | frame | cream |
| 7 | `pigmentation` | פיגמנטציה | top (textPos above) | cream |
| 8 | `anti-aging` | אנטי אייג'ינג | magazine (band blush, bandPos low) | cream |
| 9 | `peel` | פילינג | top (shape arch) | cream |
| 10 | `laser` | לייזר | split (side right, block blush) | cream |
| 11 | `new-dates` | נפתחו תאריכים | text-first (block primary, photo none) | cream |
| 12 | `products` | מוצרים | frame | cream |
| 13 | `routine` | שגרת טיפוח | top | cream |
| 14 | `self-care` | זמן לעצמך | overlay (headline bottom) | cream |
| 15 | `new-client` | מבצע ללקוחה חדשה | split (side right, block primary) | cream |
| 16 | `slot-opened` | התפנה תור | overlay (headline top) | cream |
| 17 | `facial` | טיפול פנים | collage (count 3) | cream |
| 18 | `pampering` | פינוק | overlay (headline bottom) | cream |
| 19 | `glow` | זוהר | top (shape circle) | cream |
| 20 | `pro-peel` | פילינג מקצועי | split (side left, block deep) | cream |
| 21 | `rosh-hashana` | ראש השנה | top | cream |
| 22 | `yom-kippur` | יום כיפור | text-first (block surface, photo none) | cream |
| 23 | `sukkot` | סוכות | frame | cream |
| 24 | `hanukkah` | חנוכה | magazine (band primary) | cream |
| 25 | `tu-bishvat` | ט"ו בשבט | top (shape circle) | cream |
| 26 | `purim` | פורים | split (side bottom, block primary) | cream |
| 27 | `pesach` | פסח | collage (count 2) | cream |
| 28 | `independence` | יום העצמאות | overlay (headline top) | cream |
| 29 | `shavuot` | שבועות | frame (shape circle) | cream |
| 30 | `womens-day` | יום האישה | top (shape arch) | cream |
| 31 | `summer` | קיץ | overlay (headline bottom) | cream |
| 32 | `autumn` | סתיו | magazine (band blush) | cream |
| 33 | `winter` | חורף | overlay (headline bottom) | cream |
| 34 | `spring` | אביב | collage (count 3) | cream |
| 35 | `birthday` | יום הולדת | text-first (block blush, photo circle) | cream |
| 36 | `duo` | מבצע לשתיים | collage (count 2) | cream |
| 37 | `bridal` | כלות | overlay (headline bottom) | cream |
| 38 | `night` | טיפול לילה | overlay (headline top) | cream |
| 39 | `gift-card` | שובר מתנה | overlay (headline bottom) | cream |
| 40 | `massage` | עיסוי פנים | top (shape circle) | cream |
| 41 | `dermapen` | דרמפן | frame | cream |
| 42 | `serums` | סרומים | split (side right, block blush) | cream |
| 43 | `faq` | שאלה ותשובה | text-first (block surface, photo none) | cream |
| 44 | `info` | כדאי לדעת | top | cream |
| 45 | `myths` | מיתוס או אמת | split (side bottom, block blush) | cream |
| 46 | `natural-look` | מראה טבעי | top (shape arch) | cream |
| 47 | `skin-health` | בריאות העור | magazine (band primary, bandPos low) | cream |
| 48 | `thank-you` | תודה | frame | cream |
| 49 | `referral` | חברה מביאה חברה | text-first (block primary, photo circle) | cream |
| 50 | `glow-story` | זוהר (סטורי) | overlay (headline bottom) | cream |

## Generated from schema vs. her design work

**All 50 are generated from the schema** - a definition of ~15 lines each,
the builder does the geometry, both formats, and the lock file keeps every
version immutable. Nothing here needs a designer's file.

What does need HER (not a designer): a photo for the templates whose
subject the AI must not invent - `before-after` (two consented client
photos), `products` and `serums` (her product shots), `bridal` (a real
bride only with consent, otherwise AI still life), and `review` (at least
one saved review in settings). Everything else fills fully from her
settings and gallery, or from one AI picture.

What would justify custom design work later, if she wants it: a hand-drawn
decoration set in her own line style (today: six line drawings in
`public/design-deco/`), and a second "look" (e.g. dark/evening) as a
second builder beside `cream.ts`. Neither is needed for launch.

## Free-form generation (part 2)

`POST /api/designs/generate { brief, format }` - Claude picks templates
from this library and writes the words, OpenAI draws one picture per
option, and each option is saved as her design. Capped at 9 generations a
month per tenant (`lib/ai/callCaps.ts`, `designs/generate`), overridable
per tenant in `settings.ai_generation_cap` (platform-set; migration
`supabase/migrations/add_ai_generation_cap.sql`). The counter shows before
she generates; templates never count and stay open at the cap. Every call
lands in `ai_usage` with its cost.
