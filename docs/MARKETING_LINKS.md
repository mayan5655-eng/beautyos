# Marketing links (where signups come from)

Every link below opens the Kalmea landing page and tags the visit. The first tagged visit is kept in the
visitor's browser for 30 days (first touch wins), travels with her signup, and is saved on her business as
`signup_source` (for example `instagram / bio`). You see it in the admin panel: the "מקור" column in the
business list and the "לפי מקור" count above it, and in the owner screen "הרשמות".

Rules for your own links: lowercase English, digits, `-` or `_` only, no spaces. Values longer than 60
characters are cut. A visit with no tags still records the site that sent her (for example `instagram.com`).

| Channel | Link | מה זה |
| --- | --- | --- |
| Instagram bio | https://kalmea.app/?utm_source=instagram&utm_medium=bio | הקישור בביו של האינסטגרם |
| Instagram reel | https://kalmea.app/?utm_source=instagram&utm_medium=reel&utm_campaign=reel-01 | קישור לרילס, להחליף את המספר בכל רילס |
| Instagram story | https://kalmea.app/?utm_source=instagram&utm_medium=story&utm_campaign=story-01 | סטיקר קישור בסטורי |
| Podcast | https://kalmea.app/?utm_source=podcast&utm_medium=audio&utm_campaign=episode-01 | בתיאור הפרק, להחליף את מספר הפרק |
| Facebook groups | https://kalmea.app/?utm_source=facebook_groups&utm_medium=post&utm_campaign=group-name | פוסט בקבוצות קוסמטיקאיות, שם הקבוצה באנגלית בסוף |
| Facebook page | https://kalmea.app/?utm_source=facebook&utm_medium=page | פוסט בעמוד הפייסבוק של Kalmea |
| WhatsApp | https://kalmea.app/?utm_source=whatsapp&utm_medium=share | קישור ששולחים בוואטסאפ, בפרטי או בקבוצה |
| WhatsApp status | https://kalmea.app/?utm_source=whatsapp&utm_medium=status | קישור בסטטוס של הוואטסאפ |
| Email | https://kalmea.app/?utm_source=email&utm_medium=newsletter&utm_campaign=2026-11 | בניוזלטר או בחתימת המייל |

Straight to the signup form (skips the landing page), same tags:
https://kalmea.app/signup?utm_source=instagram&utm_medium=bio

How it works in code: `app/AttributionCapture.jsx` (captures on any page), `lib/attribution.js` (cleans and
bounds every value), `app/signup/page.tsx` (carries it in her signup), `app/api/attribution/route.ts` (saves it
once, never overwrites). The structured columns `signup_utm_source`, `signup_utm_medium`,
`signup_utm_campaign`, `signup_referrer` need `supabase/migrations/signup_attribution_columns_2026-11-10.sql`
(run by hand); until then only `signup_source` is saved.
