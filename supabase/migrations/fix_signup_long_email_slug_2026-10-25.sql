-- fix_signup_long_email_slug_2026-10-25.sql
--
-- A new business whose email has a long name before the @ cannot sign up at all.
--
-- ── STATUS: APPLIED to production on 2026-10-25 ────────────────────────────
-- Run by hand in the Supabase SQL Editor. Safe to run more than once. Verified right after with
-- signup-long-email.mjs: 20, 31, 32, 40 and 60 letters before the @ all sign up, every slug 40 characters or fewer.
-- Dry-run: scripts/smoke/long-email-slug-sql.mjs (PGlite). Live check after running it:
-- scripts/smoke/signup-long-email.mjs.
--
-- ── What happens today (measured 2026-10-25 against production) ────────────
--
-- The sign-up trigger on auth.users (handle_new_user, defined in the dashboard, not in this repo) creates her
-- business with an automatic address built from her email:
--
--     <the letters and digits before the @> - <first 8 characters of her user id>
--     kalmea-smoke-abcdefghijkl-mvnqg8pf@example.com  ->  kalmeasmokeabcdefghijklmvnqg8pf-4d18ec7d  (40)
--
-- tenants_slug_shape (add_tenant_slug_rules.sql) allows 2..40 characters. So from 32 letters and digits before
-- the @ the slug is 41+ characters, the insert into public.tenants is refused, the whole sign-up rolls back, and
-- Supabase answers 500 "Database error saving new user". 31 works, 32 fails, every time; dots and hyphens do not
-- count. The sign-up screen shows her only the generic error - she cannot open an account with that email.
--
-- ── The fix ────────────────────────────────────────────────────────────────
--
-- A BEFORE INSERT trigger on public.tenants that makes an automatic address fit the rules instead of failing
-- the sign-up: invalid characters become a hyphen, edge hyphens go, and a slug that is too long keeps its last
-- part (the user-id code that makes it unique) and shortens the part before it.
--
--     kalmeasmokeabcdefghijklmmvnqg8pf-4d18ec7d (41, refused)  ->  kalmeasmokeabcdefghijklmmvnqg8p-4d18ec7d (40)
--
-- It sits on the table, not inside handle_new_user, on purpose: that function lives only in the dashboard and
-- has been edited there before, so a fix inside it would be lost the next time it is replaced. A slug that
-- already fits is never touched. INSERT only: an address she types herself in Settings is an UPDATE
-- (claim_tenant_slug) and still gets the real refusal and the Hebrew message for it.
--
-- The Hebrew range is written as chr(1488)..chr(1514) (א..ת) so a paste that mangles Hebrew cannot break it.

create or replace function public.tenants_fit_slug()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  ok_chars  constant text := 'a-z0-9' || chr(1488) || '-' || chr(1514);
  s    text;
  tail text;
  head text;
begin
  if new.slug is null then
    return new;
  end if;
  if length(new.slug) between 2 and 40
     and new.slug ~ ('^[' || ok_chars || ']+(-[' || ok_chars || ']+)*$') then
    return new;
  end if;

  s := regexp_replace(lower(new.slug), '[^' || ok_chars || ']+', '-', 'g');
  s := btrim(s, '-');

  if length(s) > 40 then
    tail := substring(s from '-([' || ok_chars || ']{1,12})$');
    if tail is not null then
      head := rtrim(left(s, 40 - length(tail) - 1), '-');
      s := case when head = '' then tail else head || '-' || tail end;
    else
      s := rtrim(left(s, 40), '-');
    end if;
  end if;

  if length(s) < 2 then
    s := 'beauty-' || left(md5(coalesce(new.owner_id::text, new.id::text, random()::text)), 8);
  end if;

  new.slug := s;
  return new;
end;
$$;

drop trigger if exists tenants_fit_slug on public.tenants;
create trigger tenants_fit_slug
  before insert on public.tenants
  for each row execute function public.tenants_fit_slug();

-- ── Verify ─────────────────────────────────────────────────────────────────
--
--   a) The trigger is there (one row):
--        select tgname from pg_trigger where tgname = 'tenants_fit_slug';
--
--   b) Then from the repo: node --env-file=.env.local scripts/smoke/signup-long-email.mjs
--      Every length must say OK and every slug must be 40 characters or fewer. It removes what it creates.
--
-- Undo (back to today's behaviour):
--   drop trigger if exists tenants_fit_slug on public.tenants;
--   drop function if exists public.tenants_fit_slug();
