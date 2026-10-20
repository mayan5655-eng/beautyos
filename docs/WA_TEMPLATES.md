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
