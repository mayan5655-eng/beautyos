-- add_audit_hardening_2026-10-18.sql
--
-- From the ten-roles audit (branch audit/ten-roles-2026-10-18). STATUS: NOT APPLIED. Run by hand in the Supabase SQL editor,
-- one section at a time, reading each result. Nothing in the app needs this file to keep working: every code path that uses
-- these objects degrades when they are absent. Safe to run more than once.
--
-- ORDER: 1 (read only) -> 2 -> 3 -> 4 -> 6. Sections 5 and 7: 5 is optional and needs a look at the duplicates first; 7 is read only.

-- ============================================================================================================
-- 1. READ ONLY: what is really live. Paste the results to Claude if anything looks open.
-- ============================================================================================================
-- 1a. Policies on the core tables and on storage.
select schemaname, tablename, policyname, permissive, roles, cmd
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

-- 1b. Tables WITHOUT row level security (every row here must be an intentional exception).
select n.nspname as schema, c.relname as table_name, c.relrowsecurity as rls_on
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
order by 2;

-- 1c. What the anon role can do on public tables.
select table_name, string_agg(privilege_type, ', ' order by privilege_type) as anon_privileges
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon'
group by table_name order by table_name;

-- 1d. The client-images bucket must be PRIVATE (public = false); community-images is public on purpose.
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id in ('client-images', 'community-images');

-- ============================================================================================================
-- 2. Anon should reach nothing in these later tables (RLS already blocks it today; this removes the dependency on RLS alone).
-- ============================================================================================================
do $$
declare t text;
begin
  foreach t in array array['facebook_webhook_events','slot_offers','support_messages','platform_settings','owner_notifications','push_subscriptions']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on public.%I from anon', t);
      raise notice 'revoked anon on %', t;
    else
      raise notice 'skipped % (table does not exist)', t;
    end if;
  end loop;
end $$;

-- ============================================================================================================
-- 3. Treatment photos: community-images is a PUBLIC bucket and today any signed-in user, including the anonymous demo
--    session, can LIST every file in it. The app only builds public URLs for it (it never lists or downloads: checked with
--    a search of the code on 2026-10-18), so the listing policy can go. Public URLs keep working without it.
--    Check first: select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects';
-- ============================================================================================================
drop policy if exists "community-images authenticated read" on storage.objects;

-- Only pictures may be uploaded to the public bucket (an .svg or .html file there would be served from the Supabase domain).
update storage.buckets set allowed_mime_types = array['image/jpeg','image/png','image/webp'] where id = 'community-images';

-- ============================================================================================================
-- 4. One receipt per Grow card payment. Two callbacks that arrive together can no longer write two receipts: the second
--    insert fails on this index and the code (lib/grow/repo.ts) hands back the first receipt.
-- ============================================================================================================
alter table public.receipts add column if not exists grow_payment_id uuid;
create unique index if not exists receipts_grow_payment_uniq on public.receipts (grow_payment_id) where grow_payment_id is not null;

-- ============================================================================================================
-- 5. OPTIONAL, only after reading 5a. One client card per phone number per business. Two bookings arriving together from one
--    new phone can create two cards today (the booking route checks, then inserts).
-- ============================================================================================================
-- 5a. Duplicates that already exist (this must return no rows before 5b can be created):
-- select tenant_id, phone, count(*) from public.clients where coalesce(phone, '') <> '' group by 1, 2 having count(*) > 1;
-- 5b.
-- create unique index if not exists clients_tenant_phone_uniq on public.clients (tenant_id, phone) where coalesce(phone, '') <> '';

-- ============================================================================================================
-- 6. Marketing opt-outs that survive. (a) A person who is only a LEAD can reply "הסר" now: the column below records it, and bulk send
--    skips her. (b) When a client who opted out is erased, a HASH of her number is kept (never the number), so she is not messaged again if
--    she is re-imported or books again. Both are optional: the code skips them cleanly while they are missing, and the nightly check lists the
--    table until it exists.
-- ============================================================================================================
alter table public.leads add column if not exists marketing_opted_out_at timestamptz;

create table if not exists public.marketing_suppressions (
  tenant_id  uuid not null,
  phone_hash text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, phone_hash)
);
alter table public.marketing_suppressions enable row level security;
revoke all on public.marketing_suppressions from anon, authenticated;   -- only the server (service role) reads and writes it

-- ============================================================================================================
-- 7. Read only, by you: what blocks deleting a client card? Any row here whose confdeltype is 'a' or 'r' (no action / restrict) would make
--    the client erase stop at the last step. Expected: c (cascade) or n (set null). Send the result to Claude if anything is 'a' or 'r'.
-- ============================================================================================================
select conrelid::regclass as child_table, conname, confdeltype
from pg_constraint
where confrelid = 'public.clients'::regclass and contype = 'f';

-- ============================================================================================================
-- VERIFY after running 2 to 4
-- ============================================================================================================
-- select count(*) from pg_policies where schemaname = 'storage' and policyname = 'community-images authenticated read';   -- expect 0
-- select indexname from pg_indexes where indexname = 'receipts_grow_payment_uniq';                                          -- expect 1 row
-- select table_name from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon' and table_name in ('slot_offers','support_messages','push_subscriptions');  -- expect no rows
-- select to_regclass('public.marketing_suppressions');   -- expect the table name, not null
