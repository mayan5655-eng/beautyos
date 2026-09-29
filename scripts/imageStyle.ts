// scripts/imageStyle.ts
//
// The one photographic direction every generated default/seed image shares,
// so the gallery reads as one family regardless of which script or which
// field made a given file. A pure constant, no side effects on import -
// unlike generate-default-images.ts, which runs its generation loop at the
// top level and needs OPENAI_API_KEY just to load.
export const STYLE =
  'Editorial beauty-clinic photography, soft natural window light, a calm palette of cream, warm white and muted sage green, ' +
  'shallow depth of field, realistic skin and materials, high-end but warm, not stock-photo glossy. ' +
  'Any person is an anonymous adult model and must look natural and unretouched. ';
