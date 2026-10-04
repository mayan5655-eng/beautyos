// scripts/crop-banner-header.mjs
//
// brand/banner-wide.png (1568x580) is wordmark + slogan centered between two
// dense photographic flower clusters on its left and right thirds. Full-width
// on a phone-wide login/signup/onboarding card, that ratio starves the
// slogan text down to near-illegible (checked empirically, scaled to 380px:
// the sub-line and domain text were borderline unreadable) - and the side
// clusters duplicate PhotoFlowerCorners, which these same screens already
// render, risking three-plus flowers on one screen against the "never more
// than two" rule.
//
// This crops out the center wordmark+slogan band only (the flower clusters'
// soft shadow-bleed stays, the solid blossoms don't), giving the text far
// more of the available width. Re-run after regenerating banner-wide.png.
import sharp from "sharp";

const SRC = "brand/banner-wide.png";
const OUT = "brand/banner-header.png";

await sharp(SRC)
  .extract({ left: 267, top: 0, width: 1035, height: 580 })
  .toFile(OUT);

console.log(`wrote ${OUT} (1035x580) - copy to public/banner-header.png to publish`);
