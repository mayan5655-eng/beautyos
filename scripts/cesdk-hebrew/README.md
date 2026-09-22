# CE.SDK Hebrew probes

The scripts behind the IMG.LY CE.SDK evaluation (Sept 2026), kept so the
test can be re-run against a new engine version or with a licence key.
They are not part of the app and their dependencies are not in package.json.

    cd scripts/cesdk-hebrew
    npm init -y && npm i --no-save @cesdk/node@1.82.1 puppeteer-core@25.11.0
    curl -sL -o Assistant.ttf "https://github.com/google/fonts/raw/main/ofl/assistant/Assistant%5Bwght%5D.ttf"
    curl -sL -o FrankRuhlLibre.ttf "https://github.com/google/fonts/raw/main/ofl/frankruhllibre/FrankRuhlLibre%5Bwght%5D.ttf"
    CESDK_LICENSE=… node image.mjs         # the seven probes, headless Node, PNG to the Desktop
    CESDK_LICENSE=… node width-coded.mjs   # measurable rows for bidi order and wrap
    CESDK_LICENSE=… node clip.mjs          # 3 s vertical clip via headless Chrome (video export is browser-only)

Without CESDK_LICENSE the engine runs in evaluation mode: full output with an
IMG.LY watermark. The 30-day trial key comes from img.ly (contact-sales form).
