-- public-page-one-call.sql
--
-- ── STATUS: PENDING - not applied. Run by hand in the Supabase SQL Editor. ──────────────
--
-- WHY. Her public booking page (/<slug>) is the one place a stranger on a phone waits for us. Found
-- 2026-10-06, from the function's own timings: every database call from the Vercel function costs about
-- 0.3 s on a warm connection and about 0.85 s on a fresh one, and the page made three of them in two serial
-- stages (tenant by slug, then settings + services), so a view spent 1.5-2.1 s on the server before
-- sending a byte. This function returns all three in ONE call.
--
-- WHAT IT RETURNS (jsonb), or NULL when there is no business at that slug:
--   { "tenant":   { "id": ..., "name": ... },
--     "settings": <the row get_public_branding returns>,
--     "services": [ her ACTIVE service_prices rows ] }
-- It composes the two public functions that already exist (get_public_tenant_by_slug, get_public_branding)
-- so it exposes exactly what they expose and nothing new; the services are the same set as
-- get_public_services in service-prices-tenant-isolation.sql (active or null), inlined so this file does
-- not depend on that one. SECURITY DEFINER, granted to anon like its parts.
--
-- The app is safe on either side of this: it calls the function when it exists and falls back to the old
-- three reads when it does not. Safe to run more than once.
--
-- ALSO WORTH DOING (no SQL): check which region the Supabase project is in (Dashboard -> Project Settings ->
-- Infrastructure) and which region the Vercel functions run in (they ran in iad1 / Washington DC). Calls
-- between regions are what make each call slow; matching them is a one-line change in vercel.json
-- ("regions": ["<the nearest vercel region>"]) and would speed up every page, not only this one.

create or replace function public.get_public_page(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'tenant',   jsonb_build_object('id', t.id, 'name', t.name),
    'settings', (select to_jsonb(b) from public.get_public_branding(t.id) b limit 1),
    'services', coalesce(
                  (select jsonb_agg(to_jsonb(s))
                   from public.service_prices s
                   where s.tenant_id = t.id and (s.active is null or s.active = true)),
                  '[]'::jsonb)
  )
  from (select * from public.get_public_tenant_by_slug(p_slug) limit 1) t
$$;

revoke all on function public.get_public_page(text) from public;
grant execute on function public.get_public_page(text) to anon, authenticated;

-- ── VERIFY ───────────────────────────────────────────────────────────────────────────────
-- (a) a real business (put a real slug in): one row, three keys
--       select jsonb_object_keys(public.get_public_page('<a real slug>'));   -- tenant, settings, services
--       select jsonb_array_length(public.get_public_page('<a real slug>')->'services');
-- (b) no such business is NULL, not an error
--       select public.get_public_page('no-such-business-xyz') is null;       -- true
-- (c) it works as the public role
--       begin; set local role anon; select public.get_public_page('<a real slug>') is not null; rollback;
-- (d) in the app: /<slug> still renders; with Vercel logs open, one "[slug-timing] page ..." line per
--     view instead of three.
