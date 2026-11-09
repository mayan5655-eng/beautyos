# WhatsApp message templates (Meta Cloud API)

The Hebrew **utility** templates Kalmea submits in WhatsApp Manager for the central business number.
The source of truth is `lib/waCloud/templates.ts`; `test-wa-cloud.ts` fails if a body below differs from the code by one character, so copy each body from here exactly as written.

## How to submit each one

WhatsApp Manager → Message templates → Create template:

- **Category:** Utility (not Marketing; nothing in these is promotional)
- **Name:** as written below (lowercase, underscores)
- **Language:** Hebrew (`he`)
- **Body:** paste the body block; the variables `{{1}}`, `{{2}}` … stay as they are
- **Variable samples:** Meta asks for an example of each variable; use the samples listed
- No header, no footer, no buttons (the links are inside the body, so the flows need no button configuration)

Meta usually reviews utility templates within minutes to a day. A template that Meta re-categorises as Marketing must be fixed and resubmitted, not accepted: marketing templates cost more and need marketing consent.

## Rules the bodies follow

- No variable at the very start or end of the body (Meta rejects that).
- Each variable used once, numbered in order.
- A variable value may not contain a line break or a tab; the code flattens them (`sanitizeParam`).
- Feminine, warm, in the business's voice. The receipt template takes the document's own title, so a payment confirmation is never called "קבלה".
- Only the booking confirmation may go out between 21:00 and 08:00 Israel time.

## Which flow uses which template

| Template | Message type in code | Sent by | Quiet hours |
|---|---|---|---|
| `kalmea_appointment_reminder` | `reminder` | daily reminder cron (`lib/reminders/dailyReminders.js`) | held 21:00-08:00 |
| `kalmea_booking_confirmation` | `booking_confirm` | online booking (`lib/bookingNotify.js`) | exempt |
| `kalmea_payment_document` | `receipt` | send receipt (`app/api/send-receipt`), only when an issued legal document has a link; a plain payment confirmation stays on the current path | held 21:00-08:00 |
| `kalmea_deposit_request` | `deposit_request` | defined and approved ahead of time; today the deposit link is sent by her from her own WhatsApp (wa.me, `app/api/grow/deposit/request`), unchanged | held 21:00-08:00 |
| `kalmea_cancellation_fee` | `cancellation_fee` | defined and approved ahead of time; today the fee link is sent by her from her own WhatsApp (wa.me, `lib/grow/cancelFees.ts`), unchanged | held 21:00-08:00 |

## `kalmea_appointment_reminder`

Category: UTILITY · Language: he · Type in code: `reminder`

Body:

```text
שלום {{1}}, תזכורת לתור שלך ב{{2}} מחר.
{{3}}, {{4}}

לאישור: {{5}}
אם לא מתאים, אפשר לשנות כאן: {{6}}

מחכות לראות אותך!
```

Variables and samples:

1. `{{1}}` client name: רונית
2. `{{2}}` business name: סטודיו נועה
3. `{{3}}` service: טיפול פנים
4. `{{4}}` date and time: יום ג׳ 21.10 בשעה 10:00
5. `{{5}}` confirm link: https://kalmea.app/c/abc
6. `{{6}}` change link: https://kalmea.app/x/abc

## `kalmea_booking_confirmation`

Category: UTILITY · Language: he · Type in code: `booking_confirm`

Body:

```text
שלום {{1}}! התור שלך ב{{2}} נקבע.
{{3}}, {{4}}

אם משהו משתנה, אפשר לבטל בלחיצה אחת: {{5}}

מתרגשות לראות אותך!
```

Variables and samples:

1. `{{1}}` client name: רונית
2. `{{2}}` business name: סטודיו נועה
3. `{{3}}` service: טיפול פנים
4. `{{4}}` date and time: יום ג׳ 21.10 בשעה 10:00
5. `{{5}}` cancel link: https://kalmea.app/x/abc

## `kalmea_payment_document`

Category: UTILITY · Language: he · Type in code: `receipt`

Body:

```text
שלום {{1}}, {{2}} מ{{3}} על סך ₪{{4}} נמצא כאן:
{{5}}

תודה, ונתראה בקרוב.
```

Variables and samples:

1. `{{1}}` client name: רונית
2. `{{2}}` document title (e.g. "אישור תשלום" or the legal document name and number): אישור תשלום
3. `{{3}}` business name: סטודיו נועה
4. `{{4}}` amount: 250
5. `{{5}}` document link: https://kalmea.app/r/abc

## `kalmea_deposit_request`

Category: UTILITY · Language: he · Type in code: `deposit_request`

Body:

```text
שלום {{1}}, כדי לשמור את התור שלך ב{{2}} ב-{{3}} נדרשת מקדמה של ₪{{4}}.

לתשלום מאובטח: {{5}}

התור שמור עבורך {{6}} דקות, ואחרי התשלום יגיע אישור.
```

Variables and samples:

1. `{{1}}` client name: רונית
2. `{{2}}` business name: סטודיו נועה
3. `{{3}}` date and time: יום ג׳ 21.10 בשעה 10:00
4. `{{4}}` deposit amount: 100
5. `{{5}}` payment link: https://pay.grow.link/abc
6. `{{6}}` hold minutes: 30

## `kalmea_cancellation_fee`

Category: UTILITY · Language: he · Type in code: `cancellation_fee`

Body:

```text
שלום {{1}}, בהתאם למדיניות הביטולים של {{2}} שאישרת בעת קביעת התור, על ביטול התור מ-{{3}} חלים דמי ביטול של ₪{{4}}.

לתשלום: {{5}}

לכל שאלה אפשר לפנות ישירות לעסק.
```

Variables and samples:

1. `{{1}}` client name: רונית
2. `{{2}}` business name: סטודיו נועה
3. `{{3}}` appointment date and time: יום ג׳ 21.10 בשעה 10:00
4. `{{4}}` fee amount: 80
5. `{{5}}` payment link: https://pay.grow.link/abc

## `kalmea_owner_welcome`

Category: **MARKETING** · Language: he · Header: **Image** · Sent by: `lib/ownerWelcome.ts`, once, to a NEW business owner after onboarding (never to clients) · Switch: `OWNER_WELCOME_WA` (off / mock / live)

Unlike the templates above, submit this one as **Marketing**: the opening hook is a pitch, and Meta would move it there anyway. It needs her marketing consent at signup.

Header: Image. Sample to upload: `public/media/kalmea-welcome-whatsapp.png` (1080x1080, the features in circles around an illustrated cosmetician, drawn, not a photo of a real person; source `marketing/welcome/welcome-image.html`, rendered by `marketing/welcome/render.sh`). At send time the link is `OWNER_WELCOME_IMAGE_URL`, or the copy this app hosts at `/media/kalmea-welcome-whatsapp.png`.

Body:

```text
היי, ברוכה הבאה לקלמיה! 🌸
זו לא עוד מערכת לקביעת תורים: מעכשיו יש לך עוזרת אישית לעסק, מהתור הראשון ועד הפוסט הבא.

החשבון של {{1}} מוכן, והכנו לך סרטון קצר שמראה איך מתחילים, צעד אחרי צעד:
{{2}}

שאלה? אנחנו כאן בוואטסאפ 050-7321978
צוות קלמיה
```

Variables and samples:

1. `{{1}}` business name: סטודיו נועה
2. `{{2}}` tutorial video link: https://kalmea.app/tutorials

The link is a variable on purpose: the video can move or change without a new review. Live mode refuses to send until `OWNER_WELCOME_TUTORIALS_URL` is set in Vercel.

Cost: Israel marketing ≈ $0.0353 a message (Oct 2026 rate card, third-party tables; confirm on Meta's card), one message per signup. The real price arrives on the status webhook. Meta may hold back marketing messages to a number that gets many of them (error 131049); that is recorded as failed and not retried.

---

# Automatic reminders and booking confirmations (with buttons)

Sent only by the automatic path (`lib/waCloud/auto.ts`), and only for a business that turned it on in her settings. The source of truth is `lib/waCloud/autoTemplates.ts`; `test-wa-auto-reminders.ts` fails if a body, footer or button label below differs from the code by one character.

Both are **Utility**, language **Hebrew (`he`)**, with a **footer** and **Quick reply** buttons (type "Custom"). The buttons are not links: a tap comes back to Kalmea's webhook and updates the appointment by itself, exactly as the confirm link does.

## `kalmea_auto_reminder`

Category: UTILITY · Language: he · Kind in code: `reminder` · Sent by the hourly run (`/api/wa-auto/run`), about 24 hours before the visit (she can choose 48)

Body:

```text
שלום {{1}}, תזכורת לתור שלך ב{{2}}.
{{3}}
{{4}}

לאישור הגעה או לביטול, אפשר ללחוץ על הכפתורים כאן למטה.
נשמח לראות אותך!
```

Footer:

```text
הודעה אוטומטית דרך קלמיה
```

Buttons (Quick reply, Custom, in this order):

1. `מאשרת הגעה`
2. `צריכה לבטל`
3. `לא לשלוח לי הודעות`

Variables and samples:

1. `{{1}}` client name: רונית
2. `{{2}}` business name: סטודיו נועה
3. `{{3}}` service and duration: טיפול פנים · שעה
4. `{{4}}` day, date and time: יום ג׳ 21.10, 10:00-11:00

## `kalmea_auto_booking`

Category: UTILITY · Language: he · Kind in code: `booking_confirm` · Sent right after an online booking (a booking made between 21:00 and 08:00, or on Shabbat / yom tov, goes at the first allowed hour)

Body:

```text
שלום {{1}}! התור שלך ב{{2}} נקבע.
{{3}}
{{4}}

אם משהו משתנה, אפשר ללחוץ על הכפתור כאן למטה.
נשמח לראות אותך!
```

Footer:

```text
הודעה אוטומטית דרך קלמיה
```

Buttons (Quick reply, Custom, in this order):

1. `צריכה לבטל`
2. `לא לשלוח לי הודעות`

Variables and samples:

1. `{{1}}` client name: רונית
2. `{{2}}` business name: סטודיו נועה
3. `{{3}}` service and duration: טיפול פנים · שעה
4. `{{4}}` day, date and time: יום ג׳ 21.10, 10:00-11:00

A third reminder button, `להזיז את התור`, waits for the reschedule flow to reach main. Adding it changes the template, so it will be a new submission.

---

## הוראות הפעלה: מההגשה ל-Meta ועד שזה עובד

הכול כאן מוכן מראש. עד שמגדירים את המשתנים בשלב 4, הפיצ'ר לא קיים בכלל: אין שום קריאה ל-Meta, ואף עסק לא רואה עליו כלום בהגדרות.

### שלב 1: להריץ את המיגרציות (Supabase, SQL Editor), לפי הסדר

1. `add_wa_cloud.sql` (אם עוד לא רצה)
2. `add_wa_auto_messages.sql`

בסוף כל קובץ יש שאילתות בדיקה. בלי המיגרציה השנייה המערכת לא תשלח אוטומטית גם אם הכול מוגדר, ותשלח לך התראה.

### שלב 2: להגיש את שתי התבניות ב-WhatsApp Manager

1. נכנסים ל-business.facebook.com, בוחרים את העסק, ואז WhatsApp Manager ← Message templates ← Create template.
2. קטגוריה: **Utility**. שם: `kalmea_auto_reminder`. שפה: **Hebrew**.
3. Body: מדביקים את הגוף מהבלוק למעלה בדיוק כמו שהוא, כולל `{{1}}` עד `{{4}}`.
4. Footer: מדביקים `הודעה אוטומטית דרך קלמיה`.
5. Buttons ← Quick reply ← Custom: מוסיפים את שלושת הכפתורים לפי הסדר למעלה, כל אחד בדיוק באותו נוסח.
6. בדוגמאות למשתנים (Samples) כותבים את הדוגמאות מהרשימה.
7. Submit. חוזרים על אותו הדבר עבור `kalmea_auto_booking` (שני כפתורים).
8. מחכים לאישור (בדרך כלל מכמה דקות ועד יום). אם Meta מעבירה תבנית לקטגוריית Marketing, לא מאשרים: מתקנים ומגישים מחדש.

### שלב 3: Webhook (פעם אחת, אם עוד לא נעשה)

ב-developers.facebook.com, באפליקציה BeautyOS: WhatsApp ← Configuration ← Webhook. Callback URL: `https://kalmea.app/api/wa-cloud/webhook`, ה-Verify token הוא הערך של `WA_CLOUD_VERIFY_TOKEN`, ומסמנים מנוי לשדה `messages`. בלי זה לחיצה על כפתור לא תגיע למערכת. (הפירוט המלא ב-`docs/GO_LIVE_WHATSAPP.md`.)

### שלב 4: משתני סביבה ב-Vercel (Settings ← Environment Variables ← Production), לפי הסדר

| סדר | משתנה | ערך |
|---|---|---|
| 1 | `WA_CLOUD_PHONE_NUMBER_ID` | ה-Phone Number ID מ-WhatsApp Manager (לא מספר הטלפון) |
| 2 | `WA_CLOUD_ACCESS_TOKEN` | טוקן קבוע של System User עם הרשאת whatsapp_business_messaging |
| 3 | `WA_CLOUD_APP_SECRET` | ה-App Secret של האפליקציה BeautyOS |
| 4 | `WA_CLOUD_VERIFY_TOKEN` | מחרוזת אקראית ארוכה, אותה אחת שבשלב 3 |
| 5 | `WA_CLOUD_TENANT_MONTHLY_CAP` | לא חובה. ברירת מחדל 400 הודעות לעסק בחודש |
| 6 | `WA_CLOUD_GLOBAL_DAILY_CAP` | לא חובה. ברירת מחדל 2000 הודעות ביום לכל העסקים יחד |
| 7 | `WA_AUTO_SPEND_ALERT_USD` | לא חובה. ברירת מחדל 25: התראה בכל פעם שההוצאה החודשית עוברת עוד 25 דולר |
| 8 | `WA_AUTO_REMINDER_LEAD_HOURS` | לא חובה. ברירת מחדל 24 |
| 9 | `WA_CLOUD_MODE` | `live` |
| 10 | `WA_AUTO_ENABLED` | `true`, אחרון, רק אחרי שהתבניות אושרו |

את `WA_CLOUD_ENABLED` משאירים `false`: הוא מעביר את כל ההודעות של כל העסקים דרך Meta, וכאן רוצים רק את העסקים שבחרו בזה.

אחרי השמירה: Deployments ← Redeploy. משתנה חדש נכנס לתוקף רק אחרי פריסה מחדש.

מומלץ לפני `live`: להשאיר `WA_CLOUD_MODE=mock` עם `WA_AUTO_ENABLED=true` כמה ימים. זו הרצת ניסיון: המערכת רושמת ביומן העלויות מה הייתה שולחת, לא שולחת כלום, ולא מראה כלום לעסקים.

### שלב 5: לבדוק על עסק בדיקה

פותחים עסק בדיקה עם הטלפון שלך כלקוחה, מפעילים בהגדרות ← הודעות את "תזכורות ואישורי תור אוטומטיים בוואטסאפ", קובעים תור דרך דף ההזמנה, ובודקים: הגיע אישור, הכפתור "צריכה לבטל" מבטל, והעלות מופיעה בפאנל הניהול תחת "וואטסאפ רשמי". רק אחרי זה מספרים לעסקים.

### מתג החירום

כדי לעצור הכול: `WA_AUTO_ENABLED=false` (או מוחקים אותו) ← Redeploy. תוך דקה או שתיים לא יוצאת אף הודעה אוטומטית, ההגדרה נעלמת מהמסך של העסקים, והתזכורות חוזרות לתור השליחה הידנית שלהן כמו היום. ההגדרות שהעסקים בחרו נשמרות.

### מה עולה כסף

כל הודעה אוטומטית היא תבנית Utility בתשלום ל-Meta (בערך 0.0053 דולר להודעה למספר ישראלי, לפי `WA_CLOUD_UTILITY_COST_USD`). תשובה ללקוחה אחרי שלחצה על כפתור היא בתוך חלון השירות ולא מחויבת. החיוב האמיתי מופיע בחשבון Meta Business, ובפאנל הניהול מופיעה הערכה לפי עסק ומתחילת החודש.
