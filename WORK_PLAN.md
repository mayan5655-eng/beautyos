# BeautyOS - WORK PLAN
תוכנית עבודה - עודכן 26/05/2026

## הושלם
- חיבור WhatsApp (GreenAPI)
- תזכורות תור (/reminders)
- שמירת הודעות ללוג (טבלת whatsapp_messages)
- WhatsApp Center - צפייה בהודעות (/whatsapp-center)
- אישורי הגעה - קישורים בתזכורת + חיבור לדף /confirm

## לבדוק / להשלים בהמשך
1. קישורי אישור/ביטול לחיצים - לבדוק שעובדים אחרי העלאה ל-Vercel.
   ב-localhost הקישורים לא לחיצים (התנהגות צפויה של WhatsApp).
   צריך לעדכן NEXT_PUBLIC_APP_URL לכתובת ה-Vercel.
2. אוטומציה לתזכורות - שיישלחו לבד כל יום (cron job).
3. קבלות ב-WhatsApp.
4. אבטחת API routes - הוספת אימות לפני Vercel.
5. החלפת מפתחות שנחשפו: Supabase, Facebook, GreenAPI, Unsplash.
   לבדוק גם אם .env.local עלה ל-GitHub.
6. ניקוי תורי בדיקה מ-Supabase.
7. העלאה ל-Vercel.

## רעיונות לעתיד
- אישור ע"י כתיבת "כן" בתשובה ל-WhatsApp (דרך Webhook) - במקום קישור.
