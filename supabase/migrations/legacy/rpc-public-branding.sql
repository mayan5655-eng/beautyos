-- rpc-public-branding.sql
-- Safe public branding source for /book, /skin-scan, /[slug].
-- SECURITY DEFINER so it can read settings even after the anonymous SELECT policy
-- on public.settings is removed (that lockdown is a SEPARATE, LATER step).
-- Returns ONLY the 9 non-secret fields below. Types match the live settings schema
-- (working_days is plain text; the *_start/_end columns are integer).
--
-- Deliberately NOT selected (remain in the row, unreachable via this RPC):
--   green_api_token, green_api_instance, green_api_url, green_api_id,
--   bot_* / automation config, faq, tax fields, gap_fill_enabled, id, created_at.
--
-- Run this in Supabase BEFORE testing the preview branch. Do NOT run the
-- anon-revoke yet — that is the final step, only after merge + live verification.

create or replace function public.get_public_branding(p_tenant_id uuid)
returns table (
  business_name        text,
  therapist_name       text,
  primary_color        text,
  business_phone       text,     -- public contact number; remove if you treat it as PII
  business_hours       jsonb,
  working_hours_start  integer,
  working_hours_end    integer,
  working_days         text,     -- plain text, matching the live column
  branding             jsonb
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
    s.branding
  from public.settings s
  where s.tenant_id = p_tenant_id
  limit 1;
$$;

revoke execute on function public.get_public_branding(uuid) from public;
grant  execute on function public.get_public_branding(uuid) to anon, authenticated;
