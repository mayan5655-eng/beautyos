-- add_platform_admin_owner.sql
--
-- Makes ONE account a platform admin, so it can open /dashboard/admin and the owner control screens
-- (/dashboard/owner, /dashboard/owner/signups, /dashboard/owner/trials, /dashboard/owner/activity) and sees the
-- "בקרה" entry in the app's "עוד" sheet. RUN BY HAND in the Supabase SQL editor. NOT run by anything automatically.
--
-- BEFORE RUNNING: replace EMAIL_HERE (one place, below) with the email on the Kalmea account, keeping the quotes.
--   If the placeholder is left as it is, the insert matches no account and adds nobody. Nothing breaks.
--
-- Safe to run more than once: the account is added once, and a repeat run changes nothing (ON CONFLICT DO NOTHING).
-- The email is matched case-insensitively. Only the user id is stored in platform_admins, never the email.

insert into public.platform_admins (user_id)
select id
  from auth.users
 where lower(email) = lower('EMAIL_HERE')
on conflict (user_id) do nothing;

-- VERIFY. Expect exactly one row, showing the email you entered. Zero rows means the email did not match an
-- account: check it (the Authentication > Users page lists the exact address) and run the insert again.
select pa.user_id,
       u.email,
       pa.added_at
  from public.platform_admins pa
  join auth.users u on u.id = pa.user_id
 where lower(u.email) = lower('EMAIL_HERE');
