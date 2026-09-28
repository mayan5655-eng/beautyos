// scripts/generate-default-images.ts
//
// Makes the default pictures a public page wears before she uploads her own
// (see lib/defaultImages.js). Run ONCE, by hand, and commit the output: the
// files are static, so a page view costs nothing and never calls OpenAI.
//
//   node --experimental-strip-types --env-file=.env.local scripts/generate-default-images.ts
//   ... generate-default-images.ts acne hero      # only these keys
//   ... generate-default-images.ts --force        # regenerate ones that exist
//
// Needs OPENAI_API_KEY (lib/ai/openaiImages is the only OpenAI caller, so this
// goes through it). One image each, 'high' quality: 20 images (15 cosmetics,
// 5 nails — see lib/businessFields.ts). Look at every result before
// committing - a generated picture is only a default if it is one she would
// be happy to have on her page.
//
// Deliberately NOT here: before/after. A stand-in "result" would be an
// invented result, so that section shows only pairs she uploads herself.

import fs from 'node:fs';
import path from 'node:path';
import { generateImage } from '../lib/ai/openaiImages.ts';
import { HARD_CONSTRAINTS, type ImageFormat } from '../lib/ai/imagePrompt.ts';

const STYLE =
  'Editorial beauty-clinic photography, soft natural window light, a calm palette of cream, warm white and muted sage green, ' +
  'shallow depth of field, realistic skin and materials, high-end but warm, not stock-photo glossy. ' +
  'Any person is an anonymous adult model and must look natural and unretouched. ';

type Spec = { key: string; format: ImageFormat; subject: string };

const SPECS: Spec[] = [
  { key: 'facial-classic', format: 'square', subject: 'Close-up of a woman relaxing during a classic facial: white towel wrapped around her hair, a cream mask being spread on her cheek with a soft brush, eyes closed.' },
  { key: 'acne', format: 'square', subject: 'Macro photograph of a cheek with a few mild blemishes and natural skin texture, clinical and respectful, soft even light, nothing shaming or dramatic.' },
  { key: 'pigmentation', format: 'square', subject: 'Macro photograph of a cheek with subtle uneven pigmentation and light freckling, natural skin texture, soft even light.' },
  { key: 'peel-green', format: 'square', subject: 'A woman lying back with a green herbal peel mask on her face and a white towel around her hair, eyes closed, calm.' },
  { key: 'peel-deep', format: 'square', subject: 'A gloved hand gently applying a peel solution with a fan brush along a cheek, clinical and calm, close crop, no redness or irritation shown.' },
  { key: 'anti-aging', format: 'square', subject: 'Profile of a woman in her late forties with healthy, luminous, natural skin and softly styled hair, warm light on her cheek, serene.' },
  { key: 'laser-hair', format: 'square', subject: 'A cosmetician’s gloved hand holding a compact laser handpiece just above smooth skin of a leg, a thin layer of clear gel, bright clean clinic.' },
  { key: 'plasma-pen', format: 'square', subject: 'Macro of a slim pen-shaped precision device held close to the delicate skin above an eyelid, the eye closed, extreme detail, no smoke.' },
  { key: 'led', format: 'square', subject: 'A woman lying under a LED light-therapy mask glowing soft red and a little blue, relaxed, seen from the side.' },
  { key: 'deep-cleansing', format: 'square', subject: 'Gloved hands giving a deep facial cleansing with a warm damp towel and a soft cleansing brush, gentle steam, calm.' },
  { key: 'equipment', format: 'square', subject: 'A professional aesthetic treatment device with a handpiece resting in its holder, standing on a clean pale surface in a bright treatment room; soft window light, a sprig of green in the background, screen dark. The equipment itself is the subject. No people, no hands, no faces, no visible brand or text.' },
  { key: 'brows', format: 'square', subject: 'Close, tightly cropped view of well-shaped natural eyebrows being shaped: a gloved hand holding a fine brow brush or slim tweezers at the brow, the crop ends above the cheekbone so no full face is visible, soft even light, natural skin texture.' },
  { key: 'neutral', format: 'square', subject: 'Still life: folded white towels, a sprig of eucalyptus, a small ceramic bowl of cream on a pale linen surface, no people.' },
  { key: 'hero', format: 'story', subject: 'A bright, airy, empty cosmetic treatment room: a white treatment bed with a folded towel, a leafy plant, warm natural window light, a calm cream and sage interior. Leave the upper half of the frame uncluttered. No people.' },
  { key: 'about', format: 'feed45', subject: 'A soft-focus corner of a calm clinic: an armchair by a window, a green plant, a small table with a tea cup and folded linen, golden natural light. No people.' },
  // Nails (lib/businessFields.ts). Same STYLE, same four groups the seed
  // menu and lib/defaultImages.js use: extensions/building, pedicure,
  // nail art, manicure — plus a nails-specific neutral still life, since a
  // cosmetics still life is the wrong ambience for a nails business.
  { key: 'nails-manicure', format: 'square', subject: 'Close-up of a manicurist’s gloved hands gently filing a client’s nails at a clean manicure table, a small dish of cuticle oil nearby, calm and precise, no face visible.' },
  { key: 'nails-extensions', format: 'square', subject: 'Macro of a hand under a small UV/LED lamp curing a fresh coat of gel polish, a gloved technician’s hand holding a thin brush near the nail, a soft glow from the lamp, clean nail tips visible.' },
  { key: 'nails-pedicure', format: 'square', subject: 'A woman’s bare feet resting on a folded white towel at the edge of a pedicure basin with warm water and a few rose petals, calm spa atmosphere, no face visible.' },
  { key: 'nails-nail-art', format: 'square', subject: 'Extreme macro of a manicurist’s hand painting a delicate fine-line design onto a nail with a thin brush, soft-focus background, precise and artistic, no face visible.' },
  { key: 'nails-neutral', format: 'square', subject: 'Still life: a few nail polish bottles in soft neutral tones, a nail file and a cuticle stick on a pale linen surface, no people.' },
  { key: 'nails-hero', format: 'story', subject: 'A bright, airy, empty nail studio: a manicure table with a small lamp, a neat row of polish bottles, a comfortable client chair, warm natural window light, the same calm cream and sage interior as the cosmetics hero. Leave the upper half of the frame uncluttered. No people.' },
  { key: 'nails-about', format: 'feed45', subject: 'A soft-focus corner of a calm nail studio: a manicure table with a folded hand towel and a small dish of cuticle oil, a few polish bottles softly out of focus, golden natural light. No people.' },
];

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));
const outDir = path.resolve(process.cwd(), 'public', 'defaults');
fs.mkdirSync(outDir, { recursive: true });

const sharp = (await import('sharp')).default;

let failed = 0;
for (const spec of SPECS) {
  if (only.length && !only.includes(spec.key)) continue;
  const file = path.join(outDir, `${spec.key}.jpg`);
  if (fs.existsSync(file) && !force) { console.log(`skip ${spec.key} (exists)`); continue; }
  try {
    const img = await generateImage({
      prompt: `${STYLE}${spec.subject} ${HARD_CONSTRAINTS}`,
      format: spec.format,
      tenantId: null,
      callSite: 'design/default-images',
    });
    // The page shows these small; a 1400px-max JPEG is plenty and keeps the repo light.
    await sharp(img.png).resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toFile(file);
    console.log(`ok   ${spec.key}  ${(fs.statSync(file).size / 1024).toFixed(0)} KB  ${img.ms} ms`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${spec.key}: ${(e as Error).message}`);
  }
}
process.exit(failed ? 1 : 0);
