# CE.SDK proof of concept (reels tab)

One 9:16 reel: her logo and business name top-right, three gallery photos at
three seconds each, a Hebrew caption pill in her accent colour per photo.
Built and exported as mp4 in her browser by IMG.LY CE.SDK, loaded from
IMG.LY's CDN at click time. Nothing is persisted, no server is involved,
no npm dependency was added.

## Turn it on (development only)

In `.env.local` - never in Vercel:

    NEXT_PUBLIC_CESDK_POC=1
    NEXT_PUBLIC_CESDK_LICENSE=<the trial key from IMG.LY>

Restart `next dev`. The reels tab (שיווק → רילסים) shows a dashed "POC" card
under the reel studio. Without the licence line the engine runs in
evaluation mode and the mp4 carries an IMG.LY watermark; with it, no
watermark. The key is a browser key by design (domain-bound), hence the
public prefix. Video export needs WebCodecs: Chrome or Edge.

## Everything it touches

Inside this folder: `flag.ts`, `buildReel.js` (the template), `ReelPoc.jsx`
(the card), this file. Outside it, four small things, each marked `cesdk-poc`:

1. `public/cesdk-poc/` - Assistant.ttf (SIL OFL) for Hebrew captions.
2. `lib/securityHeaders.ts` - when the flag is set, the CSP allows
   `https://cdn.img.ly` for scripts, connections and fonts, and
   `'wasm-unsafe-eval'` for the engine's WebAssembly.
3. `app/beautyos.jsx` - one import and one `{CESDK_POC && <ReelPoc …/>}` line
   under `<ReelStudio>`.
4. `test-cesdk-poc.ts` - builds the template in headless Node and checks it.

## Delete it

    git rm -r app/cesdk-poc public/cesdk-poc test-cesdk-poc.ts

then remove the two `cesdk-poc` lines in `app/beautyos.jsx` and the
`cesdk-poc` block in `lib/securityHeaders.ts`, and drop the two variables
from `.env.local`. `grep -rn cesdk-poc .` should then find nothing.

## What the evaluation found (why it is built this way)

Hebrew, digits and ₪ in one line, auto-wrap order and digit-first lines all
render correctly - the cases Creatomate got wrong. Three engine gotchas are
baked into `buildReel.js`: the scene must be created with a pixel design
unit, a text pill is `backgroundColor/*` not a fill, and timed blocks sit on
the page rather than in a track. Full notes: memory `cesdk-hebrew-findings`.
