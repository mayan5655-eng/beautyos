-- academy_seed_2026-11-11.sql
--
-- STATUS: pending (run by hand in the Supabase SQL editor). Run AFTER add_academy_2026-11-11.sql. Safe to run more than once:
-- an existing course or lesson (same slug) is left exactly as it is, so edits made in the admin screen are never overwritten.
--
-- The three planned courses as UNPUBLISHED drafts with their lesson outlines (titles only: no video, no text yet). Nothing here is
-- visible to any business: a draft course is seen only by platform admins in /dashboard/admin/academy, where the owner adds the
-- videos, the text and the task of each lesson and publishes when ready. No price is set (billing is not live).

insert into public.academy_courses (slug, title, subtitle, published, sort) values
  ('paid-social', 'קמפיין ממומן באינסטגרם ופייסבוק', 'מהחשבון הראשון ועד קמפיין שמביא תורים', false, 10),
  ('google-business', 'גוגל לעסק שלך', 'שימצאו אותך בחיפוש ובמפות', false, 20),
  ('phone-photos', 'צילום עבודות בטלפון', 'תמונות לפני ואחרי שמוכרות בשבילך', false, 30)
on conflict (slug) do nothing;

insert into public.academy_lessons (course_id, slug, title, sort, published)
select c.id, v.slug, v.title, v.sort, false
  from (values
    ('paid-social', 'why-paid-works', 'למה פרסום ממומן עובד לקוסמטיקאיות', 10),
    ('paid-social', 'ad-account-pixel', 'פתיחת חשבון מודעות ופיקסל', 20),
    ('paid-social', 'local-audience', 'קהל יעד מקומי', 30),
    ('paid-social', 'scroll-stopping-creative', 'קריאייטיב שעוצר גלילה', 40),
    ('paid-social', 'starting-budget', 'תקציב התחלתי ובדיקה', 50),
    ('paid-social', 'reading-results', 'קריאת תוצאות ומתי לעצור', 60),
    ('google-business', 'profile-from-zero', 'פרופיל עסק בגוגל מאפס', 10),
    ('google-business', 'categories-hours-photos', 'קטגוריות, שעות ותמונות', 20),
    ('google-business', 'reviews', 'ביקורות: איך מבקשים ועונים', 30),
    ('google-business', 'google-posts', 'פוסטים בגוגל', 40),
    ('google-business', 'local-search-campaign', 'קמפיין חיפוש מקומי', 50),
    ('google-business', 'measurement', 'מדידה', 60),
    ('phone-photos', 'daylight-lighting', 'אור יום ותאורה', 10),
    ('phone-photos', 'background-tidy', 'רקע וסדר', 20),
    ('phone-photos', 'before-after', 'לפני ואחרי', 30),
    ('phone-photos', 'angles-per-treatment', 'זוויות לכל טיפול', 40),
    ('phone-photos', 'quick-editing', 'עריכה מהירה', 50),
    ('phone-photos', 'photo-to-reels', 'מתמונה לרילס', 60)
  ) as v(course_slug, slug, title, sort)
  join public.academy_courses c on c.slug = v.course_slug
on conflict (course_id, slug) do nothing;

-- Verify (run after the above)
-- 1. Three draft courses. Expect 3 rows, published = false.
--      select slug, title, published from public.academy_courses where slug in ('paid-social', 'google-business', 'phone-photos') order by sort;
-- 2. Six draft lessons each. Expect three rows with 6.
--      select c.slug, count(l.id) from public.academy_courses c left join public.academy_lessons l on l.course_id = c.id
--       where c.slug in ('paid-social', 'google-business', 'phone-photos') group by c.slug;
