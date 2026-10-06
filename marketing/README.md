# marketing/

Regenerable marketing recordings. Own `package.json` on purpose: the site's build never installs any of this.

## record-demo

```
cd marketing
npm install
npx playwright-core install chromium     # first time on a machine
npm run record
```

Drives the live **demo tenant** through one phone-shaped (430 px) take, about 60 s:
a client books on the public booking page, then her side: the appointment in the calendar,
the payment at the till (with the confirmation sheet), the content studio. No AI feature is touched.
Output in `out/` (git-ignored): `kalmea-demo.mp4` (H.264, 1080x1920, 30 fps, for Instagram),
`kalmea-demo.webm` (same picture), `parts/` (the raw takes).

- The script clicks through the real product. If a step stops working it **fails with the step's name**
  and leaves `out/failure-*.png`, rather than recording a broken flow.
- It fails if any non-GET request reaches an AI route (`AI_ROUTES`), and warns/exits 2 outside 40-60 s.
- Each run books one real appointment and registers one payment on the demo tenant (different client each time).
  The nightly reset (02:00 UTC) clears them. Repeated runs in one day use up the near days, and the calendar
  then flicks through more days on camera - for the cleanest take run it after the reset.
- Recorded at 430x764 and upscaled to 1080x1920, so it is a little soft. Playwright's recorder ignores device pixel ratio.
- Env: `KALMEA_BASE`, `KALMEA_DEMO_TENANT`, `KALMEA_DEMO_FIELD`.

## tour

`npm run tour` records ten clips, one per screen (today, calendar, clients, client card, till, content,
templates, settings, her booking page, skin-scan page), 15-25 s each, and stitches them with a title card
between chapters into `out/kalmea-tour.mp4` (about 3 min). `-- --only=today,calendar` records just those;
`-- --stitch-only` re-stitches the clips already in `out/clips`. No AI feature is touched (same guard as
record-demo). The clips have no audio: they are meant for a voice-over.

Rules that came from real mistakes, kept in the code as comments:

- **A caption only says what the frame shows.** The skin-scan clip never runs a scan, so it promises no result;
  the history caption is said only once the history tab is open; her booking-page line sits on the services,
  where photos and prices are both on screen.
- **Numbers in captions are counted, not typed.** The templates clip counts the cards on screen while it
  records ("52 תבניות ו-8 רילסים") and refuses to record if the count looks wrong. The brief's "a hundred
  templates" was not true of the product.
- **Contact sheets before publishing.** Look at a frame every 2 s of each clip
  (`ffmpeg -i clip.mp4 -vf fps=1/2,scale=270:-1,tile=5x2 sheet.png`). That is how a clip that began scrolled
  400 px down (the recorder scrolled to its own tab bar), a sheet showing a red "time taken" error under a caption
  about ease, and title cards sitting 110 px off-centre were found: none shows up in the script's own checks.
- Clips act on the demo tenant (one payment each run); the nightly reset at 02:00 UTC clears it.

## cost-animation

`node cost-animation.mjs` renders `out/cost-animation.mp4`: 30 s, 1080x1920, H.264, 30 fps, no audio. The page has no running
animation; everything on screen is a function of the clock, and the script steps the clock one frame at a time and screenshots
it, so every run is identical. The rows are read from `app/LandingPage.jsx` (the video cannot drift from the page) and it
refuses to render unless they total 10,068, the number its copy says. `--frame=16.5` writes one still for checking.
