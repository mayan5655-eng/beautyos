// app/BrandImage.tsx
//
// Every brand mark (line icons, flower marks, wordmark, banners) goes through
// here instead of a bare <img>. next/image serves each one as WebP at the
// width it is actually drawn (1x and 2x for the declared width, via
// /_next/image), falling back to the PNG/JPEG source for the rare browser
// without WebP. The sources in public/ are already downsampled to ~2x of the
// largest size they are drawn at (scripts/optimize-brand-images.mjs), so the
// optimizer has little to do and never serves a 1.3 MB flower behind a 22px
// mark - which is what a bare <img src="/flower-watermark.png"> did.
//
// width/height are the CSS size it is DRAWN at (not the file's own pixels):
// without a `sizes` prop that is what picks the 1x/2x candidates. Pass
// `sizes` for fluid ones (see PhotoFlowerCorners). Decorative by default:
// alt="" and aria-hidden unless the caller gives a real alt.
//
// quality 85, not next/image's default 75: the line icons are 1-2px strokes
// and 75 visibly softens them. Must be listed in next.config.ts
// images.qualities or Next 16 refuses it.

import Image from "next/image";
import type { ComponentProps } from "react";

type Props = Omit<ComponentProps<typeof Image>, "alt" | "width" | "height"> & {
  alt?: string;
  width: number;
  height: number;
};

export default function BrandImage({ alt = "", quality = 85, ...rest }: Props) {
  return <Image alt={alt} quality={quality} {...rest} />;
}
