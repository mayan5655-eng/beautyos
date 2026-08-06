'use client'

import FloralCorners from './FloralCorners'
import { BRAND_WASH, BRAND_WASH_SOFT, FLORAL_BLUSH, FLORAL_LILAC } from '@/lib/brand'

/**
 * BrandBackdrop — the one floral backdrop every branded screen shares.
 *
 * Extracted from /login so pages reuse the exact same wash and the exact same
 * blossoms, rather than each re-implementing a slightly different version.
 *
 * Renders two layers behind the content:
 *   1. the cream-to-lavender wash
 *   2. FloralCorners, tinted to the logo's blush and lilac
 *
 * The host must be a positioned stacking context (position: relative, zIndex 0)
 * and its own content should sit at zIndex 1 or above.
 *
 * DENSITY — the one thing that varies between screens:
 *   'full'  sparse pages where the florals frame the content and are part of
 *           the welcome: /login, /signup, /reset-password, /book, /claim,
 *           /community, the mini-site.
 *   'soft'  data-heavy screens - calendar, cashier, leads - where blossoms at
 *           full strength sit behind tables and grids and hurt readability.
 *           Same palette and same flowers, just quiet enough to read through.
 *   'none'  wash only, no blossoms at all.
 *
 * Readability wins on the dense screens; that is a deliberate choice, not a
 * lighter-touch accident.
 */
export type FloralDensity = 'full' | 'soft' | 'none'

const DENSITY_OPACITY: Record<FloralDensity, number> = {
  full: 0.9,
  soft: 0.3,
  none: 0,
}

export default function BrandBackdrop({
  density = 'full',
  idPrefix = 'brand',
  fixed = false,
  zIndex = -1,
}: {
  density?: FloralDensity
  /** Unique per mounted instance: FloralCorners builds SVG gradient ids from it. */
  idPrefix?: string
  /** fixed = stays put while the page scrolls. Right for long dashboards. */
  fixed?: boolean
  zIndex?: number
}) {
  // The dense screens get the flatter wash too - a strong radial halo behind a
  // calendar grid reads as a smudge rather than a glow.
  const wash = density === 'full' ? BRAND_WASH : BRAND_WASH_SOFT

  return (
    <>
      <div
        aria-hidden="true"
        style={{
          position: fixed ? 'fixed' : 'absolute',
          inset: 0,
          zIndex,
          background: wash,
          pointerEvents: 'none',
        }}
      />
      {density !== 'none' && (
        <FloralCorners
          idPrefix={idPrefix}
          fixed={fixed}
          zIndex={zIndex}
          blush={FLORAL_BLUSH}
          gold={FLORAL_LILAC}
          opacity={DENSITY_OPACITY[density]}
        />
      )}
    </>
  )
}
