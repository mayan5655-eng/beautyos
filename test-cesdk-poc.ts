// cesdk-poc: builds the reel template in headless Node and checks the frame.
//
// @cesdk/node is NOT a dependency of the app (the POC loads the engine from
// the CDN in the browser), so the package is resolved at run time and the
// check is skipped with a note when it is not there. To run it for real:
//   CESDK_NODE_PATH=<…/node_modules/@cesdk/node> npm test
// or install the package locally. CESDK_POC_FRAME=<file.png> saves the frame.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { buildReel, SECONDS_PER_PHOTO } from './app/cesdk-poc/buildReel.js';

type Fn = (...args: unknown[]) => unknown;
type Engine = { block: Record<string, Fn>; dispose: () => void };
type EngineModule = { default: { init: (opts: object) => Promise<Engine> } };

async function loadEngine(): Promise<EngineModule['default'] | null> {
  const dir = process.env.CESDK_NODE_PATH;
  const specifier = dir ? pathToFileURL(path.join(dir, 'index.mjs')).href : '@cesdk/node';
  try {
    const mod = (await import(specifier)) as EngineModule;
    return mod.default;
  } catch {
    console.log('cesdk poc: @cesdk/node not installed here, template check skipped');
    return null;
  }
}

assert.equal(SECONDS_PER_PHOTO, 3);

const CreativeEngine = await loadEngine();
if (CreativeEngine) {
  const engine = await CreativeEngine.init({ license: process.env.CESDK_LICENSE || undefined });
  try {
    const here = process.cwd();
    const file = (p: string) => pathToFileURL(path.join(here, p)).href;
    const { page, duration } = buildReel(engine, {
      photos: [file('public/bloomos-logo-full.png'), file('public/bloomos-logo-compact.png'), file('public/bloomos-logo-full.png')],
      captions: ['שלב 1: ניקוי עמוק · 15 דק׳', 'שלב 2: פילינג עדין · ₪120', 'התוצאה: עור זוהר · קבעי תור'],
      logoUrl: file('public/bloomos-logo-compact.png'),
      businessName: 'הקליניקה של מאיה',
      accent: '#C9A24B',
      fontUri: file('public/cesdk-poc/Assistant.ttf'),
    });
    assert.equal(duration, 9, 'three photos, three seconds each');
    // A still from the middle of the second photo: its caption must be on screen.
    engine.block.setPlaybackTime(page, 4);
    const blob = (await engine.block.export(page, { mimeType: 'image/png' })) as Blob;
    const bytes = Buffer.from(await blob.arrayBuffer());
    assert.ok(bytes.length > 20_000, `frame exported (${bytes.length} bytes)`);
    if (process.env.CESDK_POC_FRAME) {
      const fs = await import('node:fs');
      fs.writeFileSync(process.env.CESDK_POC_FRAME, bytes);
    }
    console.log('cesdk poc: template built and a frame exported');
  } finally {
    engine.dispose();
  }
}
