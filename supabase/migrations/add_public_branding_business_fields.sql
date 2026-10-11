-- add_public_branding_business_fields.sql
--
-- STATUS: pending (run by hand in the Supabase SQL editor; nothing here is applied automatically).
--
-- WHY: the public booking page (/book, /[slug], /skin-scan, link previews) reads her settings through the
-- SECURITY DEFINER function get_public_branding. That function returns nine columns and NOT business_fields,
-- so a nails-only tenant's public page was drawn with the cosmetics defaults (the cosmetics hero and about
-- photo, "the skin" wording). lib/branding.js already selects business_fields in its fallback; only the RPC
-- was missing it.
--
-- WHAT: the same function, with `business_fields jsonb` added to what it returns. business_fields is not a
-- secret: it only names which trades the business works in (cosmetics / nails). Every other column and every
-- exclusion is unchanged (still no tokens, instance ids, bot or automation config, faq or tax fields).
--
-- A function's RETURNS TABLE cannot be changed in place, so it is dropped and created again inside ONE
-- transaction: callers never see a moment without it. Grants are re-applied exactly as before.
--
-- Safe to run more than once. Run AFTER you have read the live definition (VERIFY 1 below): if the live
-- function has columns this file does not list, add them to both the RETURNS TABLE and the SELECT here
-- first, or the page will lose them.

begin;

drop function if exists public.get_public_branding(uuid);

create function public.get_public_branding(p_tenant_id uuid)
returns table (
  business_name        text,
  therapist_name       text,
  primary_color        text,
  business_phone       text,
  business_hours       jsonb,
  working_hours_start  integer,
  working_hours_end    integer,
  working_days         text,
  branding             jsonb,
  business_fields      jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    s.business_name,
    s.therapist_name,
    s.primary_color,
    s.business_phone,
    s.business_hours,
    s.working_hours_start,
    s.working_hours_end,
    s.working_days,
    s.branding,
    s.business_fields
  from public.settings s
  where s.tenant_id = p_tenant_id
  limit 1;
$$;

revoke execute on function public.get_public_branding(uuid) from public;
grant  execute on function public.get_public_branding(uuid) to anon, authenticated;

commit;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
-- 1) BEFORE running: read the live definition and compare its column list with the one above.
--      select pg_get_functiondef('public.get_public_branding(uuid)'::regprocedure);
--
-- 2) AFTER running: the function returns the new column, and anon can still call it.
--      select business_fields from public.get_public_branding(
--        (select tenant_id from public.settings where business_fields <> '["cosmetics"]'::jsonb limit 1));
--      -- a nails tenant returns ["nails"]; any tenant returns a json array, never an error
--
--      select grantee, privilege_type from information_schema.routine_privileges
--       where routine_name = 'get_public_branding';
--      -- expect anon and authenticated EXECUTE (and the owner), nothing for PUBLIC
--
-- 3) In the app: open a nails-only tenant's public page; the hero and about photo are the nails ones.
