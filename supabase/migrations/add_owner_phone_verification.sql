-- STATUS: NOT YET APPLIED. Hand this to Supabase's SQL editor and run it once, top to bottom.
-- Safe to run more than once (every statement is guarded).
--
-- add_owner_phone_verification.sql
--
-- WHY THIS EXISTS. A free trial was one email away: the same person could sign up again and again with a new
-- address and get a new 30-day trial each time. From now on every account (tenant owner) is tied to ONE Israeli
-- mobile number that she proved she holds, with a code sent by SMS, and a number can belong to one account only.
--
-- The rule lives HERE, in the database, not only in the signup screen: owner_phones.phone_e164 is the primary key,
-- so a second account can never hold the same number, however the request was made. The app only translates the
-- refusal into Hebrew.
--
-- Everything is OFF until she turns it on (platform_settings.phone_verify_signup / phone_verify_existing below).
-- Running this file changes nothing anyone sees.
--
-- Contents:
--   1. platform_settings  - the two switches (created here too if whatsapp-manual-mode.sql never ran)
--   2. owner_phones       - one verified mobile per account; the uniqueness rule
--   3. phone_otp          - every code sent: hash only, expiry, attempts; also the rate-limit ledger
--   4. functions          - claim_owner_phone (the atomic claim), bump_phone_otp_attempt
--   5. verify queries     - run them after, each says what to expect
--
-- Numbers are stored as lib/phone.ts normalizeIsraeliMobile() returns them: 972 + 9 digits, no plus sign
-- (972521234567). The CHECK below refuses any other shape, so "052-123-4567" and "972521234567" can never sit
-- side by side as two different numbers.

-- ── 1. platform_settings: the switches ─────────────────────────────────────────
-- Same definition as supabase/migrations/pending/whatsapp-manual-mode.sql, so whichever file runs first creates it.
create table if not exists public.platform_settings (
  id boolean primary key default true,
  whatsapp_auto_utility_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  constraint platform_settings_singleton check (id)
);

insert into public.platform_settings (id) values (true) on conflict (id) do nothing;

alter table public.platform_settings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'platform_settings'
       and policyname = 'platform_settings_no_client_access'
  ) then
    create policy platform_settings_no_client_access on public.platform_settings
      for all to authenticated using (false) with check (false);
  end if;
end $$;

-- phone_verify_signup:    a NEW signup must verify her mobile by SMS before the account is usable.
-- phone_verify_existing:  an account that existed before (no verified mobile yet) is ASKED on her next login, with
--                         "later" always available - she is never locked out of her own calendar.
-- phone_verify_since:     stamped by the admin switch the first time phone_verify_signup is turned on. Accounts created
--                         after it must verify (no "later"); accounts created before it get the gentle prompt.
alter table public.platform_settings
  add column if not exists phone_verify_signup   boolean not null default false,
  add column if not exists phone_verify_existing boolean not null default false,
  add column if not exists phone_verify_since    timestamptz;

-- ── 2. owner_phones: one verified mobile per account ──────────────────────────────
create table if not exists public.owner_phones (
  -- The uniqueness rule. Primary key = a number can belong to one account only.
  phone_e164  text primary key,
  -- One number per account too. SET NULL (not cascade) on purpose: deleting an account must not free the number for
  -- a fresh trial. A support case can release it by hand.
  user_id     uuid unique references auth.users(id) on delete set null,
  tenant_id   uuid references public.tenants(id) on delete set null,
  verified_at timestamptz not null default now(),
  source      text not null default 'signup',
  constraint owner_phones_shape check (phone_e164 ~ '^9725[0-9]{8}$'),
  constraint owner_phones_source check (source in ('signup', 'login_prompt', 'support'))
);

create index if not exists idx_owner_phones_tenant on public.owner_phones (tenant_id);

alter table public.owner_phones enable row level security;

do $$
begin
  -- She may read her own row (the app asks "is my number verified"). Nobody writes from the browser: every write is
  -- the server, with the service-role key, after it checked the SMS code.
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'owner_phones' and policyname = 'owner_phones_read_own'
  ) then
    create policy owner_phones_read_own on public.owner_phones
      for select to authenticated using (user_id = auth.uid());
  end if;
end $$;

revoke insert, update, delete on public.owner_phones from anon, authenticated;
revoke all on public.owner_phones from anon;

-- ── 3. phone_otp: every code sent ─────────────────────────────────────────────────
-- The code itself is never stored: code_hash is an HMAC under a server secret. The table doubles as the rate-limit
-- ledger (per number, per device address, per account, and the platform-wide daily cap that bounds the SMS bill),
-- which is why it is a table and not memory: Vercel runs many instances and each has its own memory.
create table if not exists public.phone_otp (
  id           uuid primary key default gen_random_uuid(),
  phone_e164   text not null,
  purpose      text not null,
  user_id      uuid references auth.users(id) on delete cascade,
  ip_hash      text,
  code_hash    text not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  attempts     int not null default 0,
  consumed_at  timestamptz,
  send_status  text not null default 'pending',
  provider     text,
  provider_ref text,
  constraint phone_otp_shape check (phone_e164 ~ '^9725[0-9]{8}$'),
  constraint phone_otp_purpose check (purpose in ('signup', 'verify')),
  constraint phone_otp_send_status check (send_status in ('pending', 'sent', 'failed', 'mock'))
);

create index if not exists idx_phone_otp_phone on public.phone_otp (phone_e164, created_at desc);
create index if not exists idx_phone_otp_ip    on public.phone_otp (ip_hash, created_at desc);
create index if not exists idx_phone_otp_user  on public.phone_otp (user_id, created_at desc);
create index if not exists idx_phone_otp_day   on public.phone_otp (created_at);

alter table public.phone_otp enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'phone_otp' and policyname = 'phone_otp_no_client_access'
  ) then
    create policy phone_otp_no_client_access on public.phone_otp
      for all to authenticated using (false) with check (false);
  end if;
end $$;

revoke all on public.phone_otp from anon, authenticated;

-- ── 4. functions ──────────────────────────────────────────────────────────────
-- claim_owner_phone: the one way a number gets attached to an account. Atomic (the primary key decides a race between
-- two signups with the same number), and it answers in words the app maps to Hebrew:
--   'claimed'         the number is now hers
--   'already_yours'   it was already hers (a retry, a second tab) - not an error
--   'taken'           another account holds this number
--   'has_other'       this account already holds a DIFFERENT number (changing it is a support case for now)
create or replace function public.claim_owner_phone(p_phone text, p_user uuid, p_tenant uuid, p_source text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_mine  text;
begin
  if p_phone is null or p_phone !~ '^9725[0-9]{8}$' then
    raise exception 'claim_owner_phone: bad phone shape' using errcode = '22023';
  end if;
  if p_user is null then
    raise exception 'claim_owner_phone: no user' using errcode = '22023';
  end if;

  select phone_e164 into v_mine from public.owner_phones where user_id = p_user;
  if v_mine is not null then
    return case when v_mine = p_phone then 'already_yours' else 'has_other' end;
  end if;

  begin
    insert into public.owner_phones (phone_e164, user_id, tenant_id, source)
    values (p_phone, p_user, p_tenant, coalesce(p_source, 'signup'));
    return 'claimed';
  exception when unique_violation then
    select user_id into v_owner from public.owner_phones where phone_e164 = p_phone;
    if v_owner = p_user then return 'already_yours'; end if;
    -- Either another account holds the number, or the same account raced itself into a second row (user_id unique).
    if exists (select 1 from public.owner_phones where user_id = p_user) then return 'has_other'; end if;
    return 'taken';
  end;
end;
$$;

-- bump_phone_otp_attempt: counts a guess BEFORE the code is compared, in one statement, so parallel guesses cannot all
-- read "4 attempts" and each get a fifth. Returns the new count, or null when the code row is gone/used/expired.
create or replace function public.bump_phone_otp_attempt(p_id uuid)
returns int
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.phone_otp
     set attempts = attempts + 1
   where id = p_id
     and consumed_at is null
     and expires_at > now()
  returning attempts;
$$;

revoke all on function public.claim_owner_phone(text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.bump_phone_otp_attempt(uuid) from public, anon, authenticated;
grant execute on function public.claim_owner_phone(text, uuid, uuid, text) to service_role;
grant execute on function public.bump_phone_otp_attempt(uuid) to service_role;

-- ── 5. VERIFY (run after; each line says what to expect) ─────────────────────────
-- a) the three switches exist and are OFF. EXPECT one row: false, false, null
--    select phone_verify_signup, phone_verify_existing, phone_verify_since from public.platform_settings;
-- b) both tables exist with RLS on. EXPECT two rows, rowsecurity = true
--    select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename in ('owner_phones', 'phone_otp');
-- c) the uniqueness rule is the primary key. EXPECT owner_phones_pkey PRIMARY KEY (phone_e164)
--    select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.owner_phones'::regclass and contype = 'p';
-- d) the browser cannot call the functions. EXPECT false, false
--    select has_function_privilege('authenticated', 'public.claim_owner_phone(text, uuid, uuid, text)', 'execute'),
--           has_function_privilege('anon', 'public.bump_phone_otp_attempt(uuid)', 'execute');
