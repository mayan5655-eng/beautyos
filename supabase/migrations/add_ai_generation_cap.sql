-- Free-form post generation: a per-tenant monthly ceiling.
--
-- The platform default is 9 generations a month (lib/ai/callCaps.ts,
-- 'designs/generate'); this column overrides it for one tenant. It is NOT
-- in lib/settingsColumns.ts, so no tenant can write it through the settings
-- save route - only SQL or the service role can, on purpose. NULL means
-- "use the platform default". 0 switches the feature off for the tenant;
-- her templates stay open regardless.
--
-- Counting is done against ai_usage (call_site = 'designs/generate'), the
-- same table every other AI cap reads; nothing here stores a counter.

alter table public.settings
  add column if not exists ai_generation_cap integer
  check (ai_generation_cap is null or (ai_generation_cap >= 0 and ai_generation_cap <= 1000));

comment on column public.settings.ai_generation_cap is
  'Monthly free-form AI post generations for this tenant; NULL = platform default (9). Platform-set only.';
