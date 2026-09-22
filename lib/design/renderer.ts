// lib/design/renderer.ts
//
// The one interface between the design studio and whatever draws and edits
// a design. Everything above this line (templates, fills, designs, the
// gallery, the fill form) knows only this shape. Everything below it is a
// renderer: app/design/renderers/dom (ours, HTML + html2canvas, always
// present) and app/design/renderers/cesdk (the vendor, behind a flag).
//
// Swapping the vendor means writing one more folder that implements this
// and pointing NEXT_PUBLIC_DESIGN_RENDERER at it. Nothing else changes.
//
// The renderer receives a SceneSpec (lib/design/sceneSpec.ts): the template
// already resolved against her fill and overrides into absolute pixels and
// hex colours. A renderer never reads a template, a role or a design row.

import type { Overrides } from './design.ts';
import type { SceneSpec } from './sceneSpec.ts';

export type RendererKind = 'dom' | 'cesdk';

/** What an interactive edit session reports back, in template terms. */
export type EditResult = {
  overrides: Overrides;
  /** Text she changed on the canvas, by variable key. */
  values: Record<string, string>;
};

export type MountOptions = {
  container: HTMLElement;
  spec: SceneSpec;
  /** Interactive: she can move, resize and retype. Otherwise a still. */
  editable: boolean;
  /** Fired after every gesture that changed something, already in template terms. */
  onEdit?: (result: EditResult) => void;
  /** Which spec block is selected now (null = none). */
  onSelect?: (blockId: string | null) => void;
};

export interface DesignRenderer {
  readonly kind: RendererKind;
  /** True when this renderer can run here (licence, browser features). */
  available(): boolean;
  mount(opts: MountOptions): Promise<void>;
  /** Re-render with a new spec, keeping the session. */
  update(spec: SceneSpec): Promise<void>;
  /** Select a block programmatically (toolbar taps). */
  select(blockId: string | null): void;
  /** Change one property of the selected block from our toolbar. */
  apply(blockId: string, change: { sizePx?: number; color?: string; text?: string }): void;
  exportImage(mimeType?: 'image/png' | 'image/jpeg'): Promise<Blob>;
  /** Only renderers that do video implement this. */
  exportVideo?(): Promise<Blob>;
  dispose(): void;
}
