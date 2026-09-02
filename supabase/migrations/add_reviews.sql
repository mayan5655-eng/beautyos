-- add_reviews.sql
--
-- Reviews written by CLIENTS, tied to a visit that actually happened.
--
-- ── STATUS: NOT APPLIED ────────────────────────────────────────────────────
-- Run by hand in the Supabase SQL Editor. Update this header when it lands and
-- say how it was verified - see add_appointment_no_overlap.sql for the pattern,
-- and read the live object rather than trusting a header, which this repo has
-- now had to learn twice.
--
-- Safe to run more than once.
--
-- ── What this replaces ─────────────────────────────────────────────────────
--
-- settings.branding.reviews: an array of {name, rating, text} that the
-- cosmetician types herself in the branding tab. The booking page renders it,
-- averages it, and prints the average as a 36px number with five stars - so
-- testimonials she wrote about herself are presented to a stranger as a
-- statistic. That is not merely worth less than a real review; it is a specific
-- claim, and if a client ever suspects it the page has cost her more trust than
-- it built.
--
-- The old array is NOT deleted and is still read as a fallback, so nobody's
-- existing testimonials vanish the day this ships.
--
-- ── The key decision: a review belongs to an APPOINTMENT ───────────────────
--
-- Not to a client, and not to a tenant with a name typed beside it. Keying on
-- appointment_id buys, in one column, almost everything that makes this
-- credible:
--
--   * it cannot exist unless a real visit was booked and took place
--   * one appointment = one review, enforced below, so the link in her WhatsApp
--     is idempotent and safe to tap twice or resend
--   * spam resistance is free - there is nothing to post to without a booking
--   * and it makes the claim on the page literally true: reviews from people
--     who were actually here
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.reviews (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  -- One review per visit. This is the anti-spam rule, the idempotency rule and
  -- the honesty rule, all in one unique index.
  appointment_id uuid not null unique,
  client_id      uuid,
  -- Denormalised on purpose: the name shown on the page is the name she gave at
  -- the time, and must not change later because a client row was edited.
  client_name    text not null default '',
  rating         int  not null check (rating between 1 and 5),
  -- Named `body`, not `text`. A column called text is legal and reads terribly
  -- in a RETURNS TABLE, where it becomes an OUT parameter shadowing the type.
  body           text not null default '',
  status         text not null default 'published' check (status in ('published', 'hidden')),
  created_at     timestamptz not null default now()
);

-- The public page reads published rows for one tenant, newest first.
create index if not exists reviews_tenant_status_created_idx
  on public.reviews (tenant_id, status, created_at desc);

-- ── PUBLISHED BY DEFAULT ───────────────────────────────────────────────────
--
-- Not held for approval. Approval-first produces a page on which only five
-- stars ever appear, which is a five-star average that means nothing - and a
-- number that means nothing is what this migration exists to remove. She gets
-- told, and she gets a hide switch.
--
-- Hidden means gone from the LIST AND THE AVERAGE, both. If a hidden review
-- still dragged the number she would hide nothing and the feature would die
-- quietly; if it left the number but stayed in the list the page would
-- contradict itself. get_public_reviews below returns published rows only, and
-- the average is computed from what it returns.

alter table public.reviews enable row level security;

-- ── HIDE, NEVER EDIT ───────────────────────────────────────────────────────
--
-- The whole feature rests on this. The moment she can change the words, every
-- review on the page is her words again and this is the branding array with
-- extra steps.
--
-- Enforced in the DATABASE and not in the form, because a rule that lives in
-- the UI is a convention: the first person to open a network tab discovers the
-- reviews are editable, and they were never really reviews.
--
-- Two mechanisms, deliberately overlapping:
--
--   1. This trigger. It runs for every writer including one holding the
--      service-role key, which bypasses RLS entirely and is what our own API
--      routes use.
--   2. Column-level UPDATE grants below. Narrower, and the first line of
--      defence for an ordinary authenticated session.
--
-- 42501 is insufficient_privilege, which is what this is - not a constraint
-- violation, a permission the writer does not have.
create or replace function public.reviews_content_is_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.body           is distinct from old.body
  or new.rating         is distinct from old.rating
  or new.client_name    is distinct from old.client_name
  or new.appointment_id is distinct from old.appointment_id
  or new.tenant_id      is distinct from old.tenant_id
  or new.client_id      is distinct from old.client_id
  or new.created_at     is distinct from old.created_at then
    raise exception 'A review cannot be edited; only status may change.'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists reviews_content_is_immutable_trg on public.reviews;
create trigger reviews_content_is_immutable_trg
  before update on public.reviews
  for each row execute function public.reviews_content_is_immutable();

-- ── RLS ────────────────────────────────────────────────────────────────────
--
-- SHE CANNOT INSERT. There is deliberately no insert policy for authenticated:
-- a review can only be created by the review route, which holds the service
-- key and will not write one without a valid signed token naming a real
-- appointment. She cannot write herself a five-star review through the app at
-- all - which is the property the page will be claiming.
--
-- SHE CANNOT DELETE. No delete policy either. Hiding is the remedy; a review
-- that can be deleted is a review that can be disappeared.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reviews' and policyname = 'reviews_select_own') then
    create policy reviews_select_own on public.reviews
      for select to authenticated
      using (tenant_id = public.get_user_tenant_id());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reviews' and policyname = 'reviews_update_status_own') then
    create policy reviews_update_status_own on public.reviews
      for update to authenticated
      using (tenant_id = public.get_user_tenant_id())
      with check (tenant_id = public.get_user_tenant_id());
  end if;
end $$;

-- Column-level grants: the second mechanism. An authenticated session may read
-- a review and change its status, and has no privilege to write any other
-- column - so the trigger above is the backstop rather than the only guard.
revoke all on public.reviews from anon, authenticated;
grant select on public.reviews to authenticated;
grant update (status) on public.reviews to authenticated;

-- anon gets NOTHING on this table, in either direction. The public page reads
-- through the function below and the form writes through a server route on the
-- service key, so there is never a reason for the anon key to touch it - and
-- revoke-anon-grants.sql spent effort getting anon down to two privileges in
-- all of public. This does not add a third.

-- ── The public read ────────────────────────────────────────────────────────
--
-- Same shape as get_public_branding and get_public_tenant_by_slug: SECURITY
-- DEFINER, explicit column list, granted to anon. Published rows only, so
-- "hidden" is enforced here rather than remembered by every caller.
create or replace function public.get_public_reviews(p_tenant_id uuid)
returns table (
  client_name text,
  rating      int,
  body        text,
  created_at  timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.client_name, r.rating, r.body, r.created_at
    from public.reviews r
   where r.tenant_id = p_tenant_id
     and r.status = 'published'
   order by r.created_at desc
   limit 50;
$$;

revoke execute on function public.get_public_reviews(uuid) from public;
grant  execute on function public.get_public_reviews(uuid) to anon, authenticated;

-- ── One more reserved slug ─────────────────────────────────────────────────
--
-- /review is a new top-level route, and lib/supabase/middleware.ts treats any
-- single top-level segment as a public landing page while Next resolves static
-- routes ahead of [slug]. A tenant who claimed "review" would get a URL that
-- can never reach her, and hand clients a link that shows them a review form.
--
-- Recreated rather than added to, because add_tenant_slug_rules.sql creates
-- this constraint inside an "if not exists" block: re-running that file after
-- editing its list is a no-op. This runs whether or not that migration has been
-- applied yet, and its list is the same one plus 'review' and 'reviews'.
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
        'admin', 'app', 'assets', 'blog', 'help', 'icons', 'images', 'new',
        'pricing', 'public', 'settings', 'splash', 'static', 'support',
        'www', '_next'
      )
    );
  raise notice 'tenants_slug_not_reserved now includes review/reviews';
end $$;

-- ── Verify ─────────────────────────────────────────────────────────────────
--
--   a) The table, the unique key and the trigger exist.
--        select column_name, data_type, is_nullable, column_default
--          from information_schema.columns
--         where table_schema = 'public' and table_name = 'reviews' order by ordinal_position;
--        select conname, pg_get_constraintdef(oid) from pg_constraint
--         where conrelid = 'public.reviews'::regclass;
--        select tgname from pg_trigger
--         where tgrelid = 'public.reviews'::regclass and not tgisinternal;
--
--   b) THE ONE THAT MATTERS. The words cannot be changed, by anyone, including
--      through the SQL editor. Insert a row, try to edit it, expect 42501 on
--      the second statement and success on the third. Rolled back.
--        begin;
--          insert into public.reviews (tenant_id, appointment_id, client_name, rating, body)
--          values ('<your-tenant-id>', gen_random_uuid(), 'בדיקה', 5, 'טקסט מקורי')
--          returning id;
--          -- take the id from above:
--          update public.reviews set body = 'טקסט ערוך' where id = '<that-id>';   -- must FAIL 42501
--        rollback;
--        begin;
--          insert into public.reviews (tenant_id, appointment_id, client_name, rating, body)
--          values ('<your-tenant-id>', gen_random_uuid(), 'בדיקה', 5, 'טקסט מקורי')
--          returning id;
--          update public.reviews set status = 'hidden' where id = '<that-id>';    -- must SUCCEED
--        rollback;
--
--   c) One review per visit. The second insert must fail with 23505.
--        begin;
--          insert into public.reviews (tenant_id, appointment_id, client_name, rating, body)
--          values ('<your-tenant-id>', '00000000-0000-0000-0000-0000000000aa', 'א', 5, 'ראשונה');
--          insert into public.reviews (tenant_id, appointment_id, client_name, rating, body)
--          values ('<your-tenant-id>', '00000000-0000-0000-0000-0000000000aa', 'ב', 1, 'שנייה');
--        rollback;
--
--   d) Hidden rows do not leave the function. Expect only the published one.
--        begin;
--          insert into public.reviews (tenant_id, appointment_id, client_name, rating, body, status)
--          values ('<your-tenant-id>', gen_random_uuid(), 'מוצגת', 5, 'כן', 'published'),
--                 ('<your-tenant-id>', gen_random_uuid(), 'מוסתרת', 1, 'לא', 'hidden');
--          select client_name from public.get_public_reviews('<your-tenant-id>');
--        rollback;
