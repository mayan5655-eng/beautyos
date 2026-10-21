-- add_reserved_slug_tutorials.sql
--
-- STATUS: pending (run by hand in the Supabase SQL editor; nothing here is applied automatically).
--
-- WHY: kalmea.app/tutorials is now a public page (the tutorial videos linked from the WhatsApp welcome message). A route
-- wins over app/[slug], so a business whose address is "tutorials" would lose her booking page to it. lib/slug.ts already
-- refuses the word in the app; this makes the database refuse it too.
--
-- WHAT: tenants_slug_not_reserved is recreated with 'tutorials' added. Same list as add_facebook_user_token.sql plus that
-- word, so it is safe to run before or after that file, and more than once. No data is changed. If a business already
-- uses "tutorials", the block stops with a notice and changes nothing: tell Claude, her address has to move first.

do $$
begin
  if exists (select 1 from public.tenants where slug = 'tutorials') then
    raise exception 'a business already uses the address "tutorials" - nothing was changed';
  end if;

  if exists (select 1 from pg_constraint where conname = 'tenants_slug_not_reserved') then
    alter table public.tenants drop constraint tenants_slug_not_reserved;
  end if;
  alter table public.tenants
    add constraint tenants_slug_not_reserved
    check (
      slug is null
      or slug not in (
        'api', 'auth', 'book', 'claim', 'community', 'confirm', 'dashboard',
        'form', 'login', 'onboarding', 'privacy', 'reset-password', 'signup',
        'skin-scan', 'terms', 'review', 'reviews',
        'accessibility', 'data-deletion', 'demo', 'logo', 'og', 'tutorials',
        'admin', 'app', 'assets', 'blog', 'help', 'icons', 'images', 'new',
        'pricing', 'public', 'settings', 'splash', 'static', 'support',
        'www', '_next'
      )
    );
  raise notice 'tenants_slug_not_reserved now includes tutorials';
end $$;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
-- 1) the constraint has the word:
--      select pg_get_constraintdef(oid) like '%tutorials%' from pg_constraint where conname = 'tenants_slug_not_reserved';  -- true
-- 2) nobody is on it:
--      select count(*) from public.tenants where slug = 'tutorials';  -- 0
