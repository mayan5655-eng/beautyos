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
