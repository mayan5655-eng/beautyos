-- STATUS: NOT YET APPLIED. Hand this to Supabase's SQL editor and run it.
-- Safe to run more than once (every statement is guarded).
--
-- whatsapp-manual-mode.sql
--
-- WHY THIS EXISTS. Open launch means no shared-number automated outreach
-- (lib/whatsapp.js's long comment on why GreenAPI moved to one platform
-- number already explains the ban risk; this is the next step: most
-- message TYPES stop being automatic at all, and the few utility types
-- that stay automatic get a live kill switch instead of an env var, so a
-- restricted number can be turned off without a redeploy).
--
-- Three new tables:
--   1. platform_settings   - one row, platform-wide. Today it holds exactly
--      one flag: whether utility WhatsApp types (reminder, booking_confirm,
--      receipt, skin_report) may send automatically through the central
--      number. Off by default - launch is manual-by-default, flipped on
--      once the SIM is authorized, flipped off instantly if it gets
--      restricted again.
--   2. owner_notifications - replaces WhatsApp-to-herself for new-booking,
--      cancellation, and the skin-scan hot-lead ping. Read in-app; also
--      the source a web-push notification is sent from.
--   3. push_subscriptions  - one row per browser she's granted notification
--      permission in, so owner_notifications can also reach her phone
--      without opening the app.
--
-- whatsapp_messages itself needs NO migration: `status` has never had a
-- CHECK constraint (confirmed against whatsapp-delivery-status.sql, which
-- only constrains the newer delivery_status column), so the new
-- 'pending_manual' status value is just another string the column already
-- accepts.

-- ── 1. platform_settings ────────────────────────────────────────────────────
create table if not exists public.platform_settings (
  id boolean primary key default true,
  whatsapp_auto_utility_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  constraint platform_settings_singleton check (id)
);

insert into public.platform_settings (id, whatsapp_auto_utility_enabled)
values (true, false)
on conflict (id) do nothing;

alter table public.platform_settings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'platform_settings'
       and policyname = 'platform_settings_no_client_access'
  ) then
    -- No policy at all for anon/authenticated: only the service-role key
    -- (which bypasses RLS) ever reads or writes this. The admin panel and
    -- sendWhatsApp() both already use a service-role client.
    create policy platform_settings_no_client_access on public.platform_settings
      for all to authenticated using (false) with check (false);
  end if;
end $$;

-- ── 2. owner_notifications ──────────────────────────────────────────────────
create table if not exists public.owner_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null, -- 'new_booking' | 'cancellation' | 'skin_hot_lead'
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_owner_notifications_tenant_unread
  on public.owner_notifications (tenant_id, created_at desc)
  where read_at is null;

alter table public.owner_notifications enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'owner_notifications'
       and policyname = 'owner_notifications_select_own'
  ) then
    create policy owner_notifications_select_own on public.owner_notifications
      for select to authenticated
      using (tenant_id = public.get_user_tenant_id());
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'owner_notifications'
       and policyname = 'owner_notifications_update_own'
  ) then
    -- Only read_at is meant to change from the client; there is nothing
    -- enforcing column-level restriction here on purpose - a tenant can
    -- only ever see and touch her own rows (RLS), and corrupting her own
    -- notification text harms nobody but her.
    create policy owner_notifications_update_own on public.owner_notifications
      for update to authenticated
      using (tenant_id = public.get_user_tenant_id())
      with check (tenant_id = public.get_user_tenant_id());
  end if;
end $$;

-- ── 3. push_subscriptions ────────────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_tenant
  on public.push_subscriptions (tenant_id);

alter table public.push_subscriptions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'push_subscriptions'
       and policyname = 'push_subscriptions_owner_only'
  ) then
    create policy push_subscriptions_owner_only on public.push_subscriptions
      for all to authenticated
      using (tenant_id = public.get_user_tenant_id())
      with check (tenant_id = public.get_user_tenant_id());
  end if;
end $$;

-- ── Verify ───────────────────────────────────────────────────────────────────
--   select * from public.platform_settings;
--   select column_name from information_schema.columns
--    where table_name in ('owner_notifications','push_subscriptions');
