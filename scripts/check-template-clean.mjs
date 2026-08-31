// scripts/check-template-clean.mjs
//
// Fails the build if lib/tenantTemplate.ts contains anything that looks like a
// real tenant's data.
//
// The isolation rule for the onboarding seed — nothing about one cosmetician's
// clients, appointments, receipts, leads or revenue may reach another tenant —
// rests on that file being hand-written literals with no database inputs. This
// script is what stops that from being a promise someone has to remember.
//
// It runs from `npm run build`, which is the command Vercel runs, so a leak
// cannot reach production by being merged. Run it alone with:
//
//     npm run check:template
//
// Comments are stripped before scanning, so the forbidden-key list can be
// discussed in prose inside the file it guards without tripping its own check.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'lib', 'tenantTemplate.ts');
const REL = 'lib/tenantTemplate.ts';

// Strip // line comments and /* */ blocks. Deliberately simple: the target file
// contains no regex literals or strings holding "//", and if that ever changes
// the failure mode is a false positive, which is the safe direction.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// Settings and branding keys that carry one specific business's identity,
// contact details, credentials or client-visible media. None of these may ever
// appear as a key in the template. Reasons are in lib/tenantTemplate.ts.
const FORBIDDEN_KEYS = [
  'business_phone',
  'green_api_instance',
  'green_api_token',
  'green_api_url',
  'review_url',
  'business_tax_status',
  'business_name',
  'therapist_name',
  'logo_url',
  'hero_image_url',
  'gallery',
  'public_address',
  'whatsapp_number',
  'instagram',
  'facebook',
  'tiktok',
  'website',
  'welcome_message',
  'welcome_headline',
  'business_description',
  'lead_templates',
];

const PATTERNS = [
  {
    name: 'a tenant or row UUID',
    re: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    why: 'the template is the same for every tenant, so it can never legitimately name one',
  },
  {
    name: 'an Israeli phone number',
    re: /\b0\d{1,2}[-\s]?\d{3}[-\s]?\d{4}\b/,
    why: 'a seeded phone number would route payment requests to somebody else',
  },
  {
    name: 'a long digit run',
    re: /\b\d{7,}\b/,
    why: 'prices and durations are at most four digits; anything longer is an id, a token or a phone',
  },
  {
    name: 'an email address',
    re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
    why: 'no tenant identity belongs in a shared template',
  },
  {
    name: 'a URL',
    re: /https?:\/\//i,
    why: 'a seeded URL is either her storage bucket, her socials or her review link',
  },
  {
    name: 'an image or media filename',
    re: /\.(jpe?g|png|webp|gif|heic|mp4|mov)\b/i,
    why: 'gallery and logo images are her clients’ faces and her branding',
  },
  {
    name: 'a GreenAPI credential field',
    re: /green[_-]?api/i,
    why: 'her WhatsApp credentials would let another tenant message clients as her',
  },
  {
    name: 'a Supabase client or query',
    re: /\bsupabase\b|createClient|\.from\s*\(|\.select\s*\(/i,
    why: 'the template must have no database inputs at all — that is the whole guarantee',
  },
];

async function main() {
  let src;
  try {
    src = await readFile(TARGET, 'utf8');
  } catch (err) {
    fail([`Cannot read ${REL}: ${err.message}`]);
    return;
  }

  const code = stripComments(src);
  const failures = [];

  for (const { name, re, why } of PATTERNS) {
    const m = code.match(re);
    if (m) {
      failures.push(`Found ${name}: ${JSON.stringify(m[0])}\n    Why this is blocked: ${why}`);
    }
  }

  for (const key of FORBIDDEN_KEYS) {
    // As an object key or a property access, not as a word inside Hebrew copy.
    const re = new RegExp(`(^|[^A-Za-z0-9_])${key}\\s*[:.]`, 'm');
    const m = code.match(re);
    if (m) {
      failures.push(
        `Found the forbidden settings key "${key}".\n` +
          `    Why this is blocked: it carries one specific business’s identity, contact\n` +
          `    details, credentials or client-visible media. See lib/tenantTemplate.ts.`
      );
    }
  }

  if (failures.length > 0) {
    fail(failures);
    return;
  }

  console.log(`✓ ${REL} is clean (${PATTERNS.length + FORBIDDEN_KEYS.length} checks).`);
}

function fail(failures) {
  console.error('');
  console.error('  ✕ TENANT TEMPLATE LEAK CHECK FAILED');
  console.error('');
  console.error(`  ${REL} is seeded into EVERY new cosmetician's account.`);
  console.error('  It must contain hand-written generic values and nothing else.');
  console.error('');
  for (const f of failures) console.error(`  - ${f}\n`);
  console.error('  Remove the value, or if it is genuinely generic, adjust the rule in');
  console.error('  scripts/check-template-clean.mjs and say why in the commit.');
  console.error('');
  process.exit(1);
}

main();
