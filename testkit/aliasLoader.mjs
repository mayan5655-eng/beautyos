// testkit/aliasLoader.mjs
//
// Lets a test import a Next.js route handler in plain node: "@/..." (the tsconfig alias) and extensionless relative imports (which only
// the Next bundler resolves) are resolved by trying the usual extensions, and "@/lib/supabase/server" is swapped for a stub the test
// controls (globalThis.__TEST_SUPABASE__). Used with:
//   import { register } from 'node:module'; register('./testkit/aliasLoader.mjs', import.meta.url);
//   const route = await import('./app/api/designs/[id]/route.ts');
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const STUBS = { '@/lib/supabase/server': 'testkit/stubSupabaseServer.mjs' };
const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];

function tryFile(p) {
  if (existsSync(p) && statSync(p).isFile()) return p;
  for (const e of EXTS) if (existsSync(p + e)) return p + e;
  for (const e of EXTS) if (existsSync(path.join(p, 'index' + e))) return path.join(p, 'index' + e);
  return null;
}

export async function resolve(spec, ctx, next) {
  if (STUBS[spec]) return next(pathToFileURL(path.join(ROOT, STUBS[spec])).href, ctx);
  let target = null;
  if (spec.startsWith('@/')) target = tryFile(path.join(ROOT, spec.slice(2)));
  else if ((spec.startsWith('./') || spec.startsWith('../')) && ctx.parentURL && ctx.parentURL.startsWith('file:')) {
    target = tryFile(path.resolve(path.dirname(fileURLToPath(ctx.parentURL)), spec));
  }
  // the same module reached by a RELATIVE path (some routes import "../../../lib/supabase/server" instead of "@/lib/supabase/server")
  if (target && path.normalize(target) === path.join(ROOT, 'lib', 'supabase', 'server.ts')) target = path.join(ROOT, STUBS['@/lib/supabase/server']);
  if (target) return next(pathToFileURL(target).href, ctx);
  try {
    return await next(spec, ctx);
  } catch (e) {
    // "next/server" and friends: package subpaths that only the Next bundler resolves without ".js"
    if (e && e.code === 'ERR_MODULE_NOT_FOUND' && !spec.startsWith('.') && !spec.endsWith('.js')) return next(spec + '.js', ctx);
    throw e;
  }
}
