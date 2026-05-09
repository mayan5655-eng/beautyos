import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  try {
    // 1. קבלת ה-ID והפעולה מה-URL
    const { searchParams } = new URL(request.url);
    const appointmentId = searchParams.get('id');
    const action = searchParams.get('action') || 'confirm'; // ברירת מחדל: אישור

    if (!appointmentId) {
      return NextResponse.json(
        { error: 'חסר מזהה תור' },
        { status: 400 }
      );
    }

    // 2. בדיקה שהפעולה תקינה
    if (action !== 'confirm' && action !== 'cancel') {
      return NextResponse.json(
        { error: 'פעולה לא חוקית' },
        { status: 400 }
      );
    }

    // 3. יצירת חיבור ל-Supabase עם service_role (עוקף RLS)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'הגדרות שרת חסרות' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // 4. בדיקה שהתור קיים ומה הסטטוס הנוכחי שלו
    const { data: existingAppointment, error: fetchError } = await supabase
      .from('appointments')
      .select('confirmation_status')
      .eq('id', appointmentId)
      .single();

    if (fetchError || !existingAppointment) {
      return NextResponse.json(
        { error: 'תור לא נמצא' },
        { status: 404 }
      );
    }

    // 5. בדיקה אם התור כבר אושר/בוטל
    if (existingAppointment.confirmation_status === 'confirmed') {
      return NextResponse.json({
        success: true,
        alreadyDone: true,
        action: 'confirm',
        message: 'התור כבר אושר בעבר'
      });
    }

    if (existingAppointment.confirmation_status === 'cancelled') {
      return NextResponse.json({
        success: true,
        alreadyDone: true,
        action: 'cancel',
        message: 'התור כבר בוטל בעבר'
      });
    }

    // 6. עדכון התור - אישור או ביטול
    const newStatus = action === 'confirm' ? 'confirmed' : 'cancelled';

    const { data, error } = await supabase
      .from('appointments')
      .update({ confirmation_status: newStatus })
      .eq('id', appointmentId)
      .select()
      .single();

    if (error) {
      console.error('שגיאה בעדכון התור:', error);
      return NextResponse.json(
        { error: 'לא הצלחנו לעדכן את התור', details: error.message },
        { status: 500 }
      );
    }

    // 7. החזרת תשובה חיובית
    return NextResponse.json({
      success: true,
      action: action,
      message: action === 'confirm' ? 'התור אושר בהצלחה' : 'התור בוטל בהצלחה',
      appointment: data
    });

  } catch (error) {
    console.error('שגיאה כללית:', error);
    return NextResponse.json(
      { error: 'שגיאה בשרת' },
      { status: 500 }
    );
  }
}