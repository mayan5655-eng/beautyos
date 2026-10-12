-- add_facebook_user_token.sql
--
-- STATUS: pending (run by hand in the Supabase SQL editor; nothing here is applied automatically).
--
-- WHY (Meta App Review blockers):
--   1. ads_read: the ad account can only be listed with a USER token. The OAuth callback now keeps the long-lived
--      user token (encrypted, like the Page token) next to the Page row, and the campaigns dashboard and the daily
--      ad-spend pull use it when it is there.
--   2. Deauthorize / Data Deletion callbacks: Meta names the person by her APP-SCOPED Facebook user id, which Kalmea
--      did not store (connected_by_user_id is the Kalmea user). fb_user_id makes the callbacks able to find and
--      remove the connections that person made.
--   3. granted_scopes records which permissions Meta actually granted, so the app can say "reconnect to allow
--      ads" instead of failing inside a Graph call.
-- Connections made before this migration carry NULL in the new columns: they keep working exactly as before, and the
-- callbacks cannot match them (the app tells her to reconnect for ads; deletion for those is by e-mail, as the
-- privacy policy says).
--
-- WHAT: three nullable columns and one index on public.facebook_pages. No data is changed or removed.
--
-- Also: the reserved-address list gains `data-deletion` (the new public status page route). Same list as
-- add_slug_claim_rpc.sql plus that word; safe to run more than once.

alter table public.facebook_pages
  add column if not exists fb_user_id                    text,
  add column if not exists user_access_token_encrypted   text,
  add column if not exists granted_scopes                text;

create index if not exists facebook_pages_fb_user_id_idx
  on public.facebook_pages (fb_user_id)
  where fb_user_id is not null;

do $$
begin
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
        'accessibility', 'data-deletion', 'demo', 'logo', 'og',
        'admin', 'app', 'assets', 'blog', 'help', 'icons', 'images', 'new',
        'pricing', 'public', 'settings', 'splash', 'static', 'support',
        'www', '_next'
      )
    );
end $$;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
-- 1) the columns exist:
--      select column_name from information_schema.columns
--       where table_name = 'facebook_pages' and column_name in ('fb_user_id','user_access_token_encrypted','granted_scopes');  -- 3 rows
-- 2) the browser role cannot read the user token (facebook_pages is service-role/RLS only; check you have not granted it):
--      select has_column_privilege('authenticated', 'public.facebook_pages', 'user_access_token_encrypted', 'select');  -- false
-- 3) in the app: reconnect Facebook once, then
--      select page_id, fb_user_id is not null as has_user, granted_scopes from public.facebook_pages;
