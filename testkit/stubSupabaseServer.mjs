// testkit/stubSupabaseServer.mjs - stands in for "@/lib/supabase/server" under testkit/aliasLoader.mjs: the test puts a fake client on
// globalThis.__TEST_SUPABASE__ and the route handler under test gets it from createClient().
export async function createClient() {
  if (!globalThis.__TEST_SUPABASE__) throw new Error('test did not set globalThis.__TEST_SUPABASE__');
  return globalThis.__TEST_SUPABASE__;
}
