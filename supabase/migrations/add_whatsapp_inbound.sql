-- add_whatsapp_inbound.sql
--
-- STATUS: pending (run by hand in the Supabase SQL editor). Safe to run more than once. Only ADDS - drops nothing.
--
-- WHY: the WhatsApp bot answered every message on its own, with no memory of the conversation, so "כן, ב-4 מתאים"
-- reached it with no question before it. whatsapp_messages logs only what WE send; nothing kept what the client
-- wrote. whatsapp_inbound keeps the client's text so the bot can read the last few turns (lib/waConversation.js).
--
-- WHAT IS KEPT, AND FOR HOW LONG: the text of a client's message to a business whose bot is on, with her phone. That
-- is personal data, so:
--   * it is written only when the bot is about to answer (app/api/whatsapp-webhook) - not for every message;
--   * the bot reads only the last 24 hours, so older rows serve nothing. Purge them (VERIFY (e) below, or schedule it
--     with pg_cron) - 30 days is plenty for debugging a bad reply;
--   * a business's rows go with the business (on delete cascade).
-- Server only: RLS on, nothing granted to the browser roles. Also added to the trial gate (section 2).

-- ── 1. The table ─────────────────────────────────────────────────────────────
create table if not exists public.whatsapp_inbound (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  phone       text not null,
  body        text not null,
  source      text not null default 'greenapi' check (source in ('greenapi', 'wa_cloud'))
);

create index if not exists whatsapp_inbound_conversation on public.whatsapp_inbound (tenant_id, phone, created_at desc);

alter table public.whatsapp_inbound enable row level security;
revoke all on public.whatsapp_inbound from anon, authenticated;   -- only the server (service role) reads and writes it

-- ── 2. Trial gate (same restrictive policies and names as trial-gate-policies.sql) ──
do $$
declare
  t text;
  targets text[] := array['whatsapp_inbound'];
begin
  foreach t in array targets loop
    if to_regclass('public.' || t) is null then
      raise notice 'SKIPPED %: table does not exist.', t;
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', t || '_require_active_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_require_active_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_require_active_delete', t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (public.is_tenant_active())', t || '_require_active_insert', t);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (public.is_tenant_active()) with check (public.is_tenant_active())', t || '_require_active_update', t);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (public.is_tenant_active())', t || '_require_active_delete', t);
    raise notice 'gated %', t;
  end loop;
end $$;

-- ── VERIFY ───────────────────────────────────────────────────────────────────
-- (a) select to_regclass('public.whatsapp_inbound');                                                -- expect the table name, not null
-- (b) select count(*) from public.whatsapp_inbound;                                                 -- expect 0 right after running
-- (c) select policyname from pg_policies where tablename = 'whatsapp_inbound' order by 1;           -- expect 3 rows: *_require_active_delete/insert/update
-- (d) select grantee from information_schema.role_table_grants where table_name = 'whatsapp_inbound' and grantee in ('anon','authenticated');   -- expect no rows
-- (e) retention, by hand or on a schedule: delete from public.whatsapp_inbound where created_at < now() - interval '30 days';
