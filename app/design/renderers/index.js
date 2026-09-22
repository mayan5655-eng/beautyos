'use client';

// app/design/renderers/index.js
//
// Which renderer runs. 'dom' is always there (the gallery, the fill form and
// the PNG export use it directly and need no session). 'cesdk' is the
// interactive editor and is loaded only when NEXT_PUBLIC_DESIGN_RENDERER
// says so, from its own folder, so the vendor never enters the bundle
// otherwise. Add a renderer: a folder that implements lib/design/renderer.ts
// and one case below.

export const RENDERER_KIND = process.env.NEXT_PUBLIC_DESIGN_RENDERER === 'cesdk' ? 'cesdk' : 'dom';

/** True when an interactive editor exists in this build. */
export const EDITOR_AVAILABLE = RENDERER_KIND === 'cesdk';

export async function createEditorRenderer() {
  if (RENDERER_KIND === 'cesdk') {
    const { default: CesdkRenderer } = await import('./cesdk/CesdkRenderer');
    return new CesdkRenderer();
  }
  return null;
}

/** The font files every renderer uses, by role (public, no session needed). */
export const FONT_FILES = {
  display: '/design-fonts/FrankRuhlLibre.ttf',
  body: '/design-fonts/Assistant.ttf',
};
