// lib/protocolBook/labels.ts — the book's own words around the protocols, in its three languages.
// The book carries its own languages (not lib/i18n): it is a reference she may read in a language other than her app's.
import type { BookLang } from './types.ts';

export const CHAPTERS: Record<string, Record<BookLang, string>> = {
  acne: { he: 'אקנה', en: 'Acne', ar: 'حبّ الشباب' },
  pigmentation: { he: 'פיגמנטציה', en: 'Pigmentation', ar: 'التصبّغات' },
  'anti-aging': { he: 'אנטי אייג׳ינג', en: 'Anti-aging', ar: 'مكافحة الشيخوخة' },
  sensitive: { he: 'עור רגיש', en: 'Sensitive skin', ar: 'البشرة الحساسة' },
  'deep-cleansing': { he: 'ניקוי עמוק', en: 'Deep cleansing', ar: 'التنظيف العميق' },
  dehydrated: { he: 'עור מיובש', en: 'Dehydrated skin', ar: 'البشرة المجفّفة' },
  oily: { he: 'עור שמן', en: 'Oily skin', ar: 'البشرة الدهنية' },
  glow: { he: 'זוהר', en: 'Glow', ar: 'الإشراق' },
  'acne-marks': { he: 'סימני אקנה', en: 'Post-acne marks', ar: 'آثار حبّ الشباب' },
  peels: { he: 'פילינג כימי', en: 'Chemical peels', ar: 'التقشير الكيميائي' },
  devices: { he: 'מכשור', en: 'Devices', ar: 'الأجهزة' },
  laser: { he: 'לייזר', en: 'Laser', ar: 'الليزر' },
  pedicure: { he: 'פדיקור', en: 'Pedicure', ar: 'الباديكير' },
  manicure: { he: 'מניקור וג׳ל', en: 'Manicure & gel', ar: 'المانيكير والجل' },
  extensions: { he: 'בניית ציפורניים', en: 'Nail extensions', ar: 'بناء الأظافر' },
};

export const SECTIONS: Record<'cosmetics' | 'nails', Record<BookLang, string>> = {
  cosmetics: { he: 'טיפולי פנים', en: 'Facial treatments', ar: 'علاجات الوجه' },
  nails: { he: 'ציפורניים', en: 'Nails', ar: 'الأظافر' },
};

export type BookUi = {
  book: string; sub: string; contents: string; back: string; min: string; full: string; foundations: string;
  goal: string; suits: string; stop: string; adapt: string; prep: string; steps: string; expected: string; stopNow: string;
  after: string; home: string; freq: string; tip: string; ask: string; askHint: string; total: string; map: string; lift: string;
  prev: string; next: string; toContents: string; disclaimer: string; zones: Record<string, string>;
  askForm: string; link: string; linkHint: string; linkNone: string; linkSaved: string; linkError: string; linkTaken: string; noServices: string;
  backToApp: string; page: string;
  /** The cover: who the book is for (by her fields), the line under the title, the author, the tap hint. */
  forWho: { cosmetics: string; nails: string; both: string }; guide: string; author: string; open: string;
  /** The certificate gate on the facial chapters (lib/protocolBook/certificate.ts). */
  cert: { title: string; body: string; declare: string; choose: string; send: string; sending: string; rejected: string; tooBig: string; needBoth: string; error: string };
};

export const UI: Record<BookLang, BookUi> = {
  he: {
    book: 'ספר הפרוטוקולים', sub: 'ספריית טיפולים מקצועית', contents: 'תוכן העניינים', back: 'חזרה', min: 'דק׳', full: 'מהספר המלא',
    foundations: 'יסודות',
    goal: 'מטרה', suits: 'מתאים ל', stop: 'לא מטפלים היום', adapt: 'מטפלים, עם התאמה', prep: 'הכנה', steps: 'שלבי הטיפול',
    expected: 'מה תקין אחרי', stopNow: 'עוצרים מיד', after: 'אחרי הטיפול', home: 'טיפוח ביתי', freq: 'תדירות וסדרה', tip: 'טיפ מקצועי',
    ask: 'שאלות ללקוחה לפני הטיפול', askHint: 'תשובה "כן" לאחת מהן: קראי את התוויות הנגד לפני שמתחילים.', total: 'זמן טיפול',
    map: 'אזורי הטיפול', lift: 'כיוון עיסוי מרים', prev: 'הקודם', next: 'הבא', toContents: 'לתוכן העניינים',
    disclaimer: 'הפרוטוקולים הם מסגרת עבודה ולא תחליף לשיקול דעת מקצועי. שאלון בריאות חתום, אבחון ובדיקת רגישות לפני כל טיפול. ריכוזים, זמנים ופרמטרים של מכשור לפי הוראות היצרן.',
    zones: { forehead: 'מצח', nose: 'אף', cheek: 'לחיים', chin: 'סנטר', lip: 'שפה עליונה', eyes: 'סביב העיניים', jaw: 'קו הלסת' },
    askForm: 'השאלות האלה קיימות גם כטופס לחתימה: "שאלון לפני טיפול" בכרטיס הלקוחה, תחת טפסים, או כטופס חובה של הטיפול בהגדרות השירותים.',
    link: 'הצמדה לטיפולים שלי', linkHint: 'טיפול שהצמדת לו פרוטוקול מראה את השלבים בכל תור שלו.', linkNone: 'בלי פרוטוקול',
    linkSaved: 'נשמר', linkError: 'לא נשמר, נסי שוב', linkTaken: 'מוצמד עכשיו ל', noServices: 'עוד אין טיפולים בתפריט שלך.',
    backToApp: 'חזרה למערכת', page: 'עמוד',
    forWho: { cosmetics: 'לקוסמטיקאיות', nails: 'למניקוריסטיות', both: 'לקוסמטיקאיות ולמניקוריסטיות' },
    guide: 'המדריך הדיגיטלי', author: 'מעיין בבאי', open: 'לחצי לפתיחה',
    cert: {
      title: 'פרוטוקולי טיפולי הפנים',
      body: 'הפרקים האלה כוללים מידע מקצועי, והם פתוחים לקוסמטיקאיות בעלות הכשרה. כדי לפתוח אותם, העלי צילום של תעודת הקוסמטיקאית שלך. התעודה נשמרת באופן פרטי, ורק צוות Kalmea רואה אותה.',
      declare: 'אני מצהירה שאני בעלת הכשרה מקצועית בקוסמטיקה, ושהשימוש בפרוטוקולים הוא באחריותי המקצועית.',
      choose: 'צילום התעודה (תמונה או PDF)', send: 'העלאה ופתיחת הפרקים', sending: 'מעלה',
      rejected: 'התעודה שהעלית לא אושרה. אפשר להעלות תעודה אחרת.',
      tooBig: 'הקובץ גדול מדי. אפשר להעלות עד 4MB.', needBoth: 'צריך לבחור קובץ ולסמן את ההצהרה.', error: 'ההעלאה לא הצליחה, נסי שוב.',
    },
  },
  en: {
    book: 'The Protocol Book', sub: 'A professional treatment library', contents: 'Contents', back: 'Back', min: 'min', full: 'Full book',
    foundations: 'Foundations',
    goal: 'Goal', suits: 'Suitable for', stop: 'Do not treat today', adapt: 'Treat, with adaptation', prep: 'Preparation', steps: 'Treatment steps',
    expected: 'What is normal after', stopNow: 'Stop at once', after: 'Aftercare', home: 'Home care', freq: 'Frequency & series', tip: 'Pro tip',
    ask: 'Questions for the client before treatment', askHint: 'A "yes" to any of them: read the contraindications before you start.', total: 'Treatment time',
    map: 'Treatment zones', lift: 'Lifting massage direction', prev: 'Previous', next: 'Next', toContents: 'Contents',
    disclaimer: 'Protocols are a working framework, not a substitute for professional judgment. A signed health questionnaire, skin analysis and a patch test before every treatment. Concentrations, times and device settings follow the manufacturer.',
    zones: { forehead: 'Forehead', nose: 'Nose', cheek: 'Cheeks', chin: 'Chin', lip: 'Upper lip', eyes: 'Eye area', jaw: 'Jawline' },
    askForm: 'These questions also exist as a form to sign: "Before your treatment" on the client card under Forms, or as the treatment\'s required form in the service settings.',
    link: 'Attach to my treatments', linkHint: 'A treatment with a protocol shows its steps on every appointment.', linkNone: 'No protocol',
    linkSaved: 'Saved', linkError: 'Not saved, try again', linkTaken: 'Now attached to', noServices: 'Your menu has no treatments yet.',
    backToApp: 'Back to Kalmea', page: 'Page',
    forWho: { cosmetics: 'for Cosmeticians', nails: 'for Nail Technicians', both: 'for Cosmeticians & Nail Technicians' },
    guide: 'The Digital Guide', author: 'Maayan Babai', open: 'Tap to open',
    cert: {
      title: 'Facial treatment protocols',
      body: 'These chapters hold professional material and are open to trained cosmeticians. To open them, upload a photo of your cosmetician certificate. It is stored privately and only the Kalmea team sees it.',
      declare: 'I declare that I am professionally trained in cosmetics, and that using these protocols is my professional responsibility.',
      choose: 'Photo of the certificate (image or PDF)', send: 'Upload and open the chapters', sending: 'Uploading',
      rejected: 'The certificate you uploaded was not approved. You can upload another one.',
      tooBig: 'The file is too large. You can upload up to 4MB.', needBoth: 'Choose a file and tick the declaration.', error: 'The upload did not go through, try again.',
    },
  },
  ar: {
    book: 'كتاب البروتوكولات', sub: 'مكتبة علاجات مهنية', contents: 'المحتويات', back: 'رجوع', min: 'د', full: 'من الكتاب الكامل',
    foundations: 'الأساسيات',
    goal: 'الهدف', suits: 'مناسب لـ', stop: 'لا نعالج اليوم', adapt: 'نعالج مع تعديل', prep: 'التحضير', steps: 'مراحل العلاج',
    expected: 'ما هو طبيعي بعد العلاج', stopNow: 'نتوقّف فوراً', after: 'بعد العلاج', home: 'العناية المنزلية', freq: 'التكرار والسلسلة', tip: 'نصيحة مهنية',
    ask: 'أسئلة للزبونة قبل العلاج', askHint: 'إجابة "نعم" على أيّ منها: اقرئي موانع الاستعمال قبل البدء.', total: 'مدّة العلاج',
    map: 'مناطق العلاج', lift: 'اتجاه التدليك الرافع', prev: 'السابق', next: 'التالي', toContents: 'المحتويات',
    disclaimer: 'البروتوكولات إطار عمل وليست بديلاً عن التقدير المهني. استبيان صحي موقّع، تشخيص واختبار حساسية قبل كل علاج. التركيزات والأوقات وإعدادات الأجهزة حسب تعليمات المصنّع.',
    zones: { forehead: 'الجبهة', nose: 'الأنف', cheek: 'الخدّان', chin: 'الذقن', lip: 'الشفة العليا', eyes: 'حول العينين', jaw: 'خط الفك' },
    askForm: 'هذه الأسئلة موجودة أيضاً كنموذج للتوقيع: "استبيان قبل العلاج" في بطاقة الزبونة تحت النماذج، أو كنموذج إلزامي للعلاج في إعدادات الخدمات.',
    link: 'ربط بعلاجاتي', linkHint: 'العلاج المرتبط ببروتوكول يعرض مراحله في كل موعد له.', linkNone: 'بدون بروتوكول',
    linkSaved: 'تمّ الحفظ', linkError: 'لم يُحفظ، حاولي مرة أخرى', linkTaken: 'مرتبط الآن بـ', noServices: 'لا توجد علاجات في قائمتكِ بعد.',
    backToApp: 'العودة إلى Kalmea', page: 'صفحة',
    forWho: { cosmetics: 'لخبيرات التجميل', nails: 'لفنّيات الأظافر', both: 'لخبيرات التجميل وفنّيات الأظافر' },
    guide: 'الدليل الرقمي', author: 'معيان باباي', open: 'اضغطي للفتح',
    cert: {
      title: 'بروتوكولات علاجات الوجه',
      body: 'هذه الفصول تحتوي على معلومات مهنية، وهي مفتوحة لخبيرات التجميل المؤهّلات. لفتحها، ارفعي صورة لشهادة خبيرة التجميل الخاصة بكِ. تُحفظ الشهادة بشكل خاص، ولا يراها سوى فريق Kalmea.',
      declare: 'أصرّح بأنني حاصلة على تأهيل مهني في التجميل، وأنّ استعمال البروتوكولات على مسؤوليتي المهنية.',
      choose: 'صورة الشهادة (صورة أو PDF)', send: 'رفع وفتح الفصول', sending: 'جارٍ الرفع',
      rejected: 'الشهادة التي رفعتِها لم تُعتمد. يمكنكِ رفع شهادة أخرى.',
      tooBig: 'الملف كبير جداً. يمكن رفع حتى 4MB.', needBoth: 'يجب اختيار ملف ووضع علامة على التصريح.', error: 'لم ينجح الرفع، حاولي مرة أخرى.',
    },
  },
};

/** The foundation chapters: skin (cosmetics) and the nail unit (nails). Numbered markers match the drawings. */
export const SKIN: Record<BookLang, { title: string; lead: string; layers: [string, string][]; depthTitle: string; depthLead: string; depth: [string, string][]; layerNames: string[]; medical: string; facts: [string, string][] }> = {
  he: {
    title: 'שכבות העור', lead: 'העור בנוי משלוש שכבות. כל טיפול עובד בעומק אחר, ולכן הבנת השכבות היא הבסיס לכל פרוטוקול.',
    layers: [
      ['שכבה קרנית', 'תאים מתים ושומנים (קרמידים). המחסום ששומר על לחות ומגן מגירויים. פילינג אנזימטי ועדין עובד כאן.'],
      ['שכבה בזאלית', 'כאן נוצרים תאים חדשים, וכאן המלנוציטים שמייצרים מלנין. תא חדש מגיע לפני השטח בכ-28 יום, ועם הגיל לאט יותר.'],
      ['דרמיס', 'קולגן, אלסטין, פיברובלסטים, כלי דם ובלוטות. כאן נוצרים קמטים.'],
      ['בלוטת חלב', 'מייצרת סבום לתוך הזקיק. זקיק שנסתם הוא תחילתה של אקנה.'],
      ['היפודרמיס', 'רקמת שומן שתומכת ומבודדת. העיסוי משפיע דרכה על זרימת הדם והלימפה.'],
    ],
    depthTitle: 'מה מגיע לאן', depthLead: 'ככל שהטיפול עמוק יותר, ההחלמה ארוכה יותר והסיכון גבוה יותר.',
    depth: [['פילינג אנזימטי ו-AHA עדין', 'שכבה קרנית'], ['סליצילית, מנדלית, ג׳סנר', 'אפידרמיס'], ['אולטרסאונד והחדרה', 'אפידרמיס (משפרים חדירה שטחית)'], ['עיסוי וניקוז לימפטי', 'היפודרמיס ושרירים']],
    layerNames: ['שכבה קרנית', 'אפידרמיס', 'דרמיס', 'היפודרמיס'],
    medical: 'פילינג בינוני ועמוק, מיקרונידלינג (כל מכשיר שמחורר את העור), מזותרפיה והזרקות מגיעים לדרמיס. זה תחום רפואי, ובישראל הוא שמור לרופאים.',
    facts: [
      ['pH העור', '4.5–5.5. המעטפת החומצית מגינה מחיידקים. ניקוי בסיסי מדי פוגע בה.'],
      ['פוטוטיפ IV–VI', 'חום ופגיעה במחסום מגבירים סיכון לכתמים פוסט-דלקתיים. מתחילים בעדינות.'],
    ],
  },
  en: {
    title: 'The layers of the skin', lead: 'Skin has three layers. Every treatment works at a different depth, so understanding the layers is the basis of every protocol.',
    layers: [
      ['Stratum corneum', 'Dead cells and lipids (ceramides). The barrier that holds moisture and keeps irritants out. Enzyme and gentle peels work here.'],
      ['Basal layer', 'New cells form here, with the melanocytes that make melanin. A new cell reaches the surface in about 28 days, more slowly with age.'],
      ['Dermis', 'Collagen, elastin, fibroblasts, blood vessels and glands. Wrinkles form here.'],
      ['Sebaceous gland', 'Releases sebum into the follicle. A blocked follicle is where acne begins.'],
      ['Hypodermis', 'Fat tissue that supports and insulates. Massage acts through it on blood and lymph flow.'],
    ],
    depthTitle: 'What reaches where', depthLead: 'The deeper a treatment goes, the longer the recovery and the higher the risk.',
    depth: [['Enzyme peel & gentle AHA', 'Stratum corneum'], ['Salicylic, mandelic, Jessner', 'Epidermis'], ['Ultrasound & infusion', 'Epidermis (improves surface penetration)'], ['Massage & lymphatic drainage', 'Hypodermis & muscles']],
    layerNames: ['Corneum', 'Epidermis', 'Dermis', 'Hypodermis'],
    medical: 'Medium and deep peels, microneedling (any device that punctures the skin), mesotherapy and injections reach the dermis. That is medical territory. In Israel it is reserved for physicians; elsewhere, check what your country allows.',
    facts: [
      ['Skin pH', '4.5–5.5. The acid mantle protects against bacteria. Overly alkaline cleansing damages it.'],
      ['Phototypes IV–VI', 'Heat and barrier damage raise the risk of post-inflammatory marks. Start gently.'],
    ],
  },
  ar: {
    title: 'طبقات الجلد', lead: 'يتكوّن الجلد من ثلاث طبقات. كل علاج يعمل على عمق مختلف، لذلك فهم الطبقات هو أساس كل بروتوكول.',
    layers: [
      ['الطبقة القرنية', 'خلايا ميتة ودهون (سيراميدات). الحاجز الذي يحفظ الرطوبة ويحمي من المهيّجات. التقشير الإنزيمي واللطيف يعمل هنا.'],
      ['الطبقة القاعدية', 'هنا تتكوّن الخلايا الجديدة، وهنا الخلايا الصباغية التي تنتج الميلانين. تصل الخلية الجديدة إلى السطح خلال نحو 28 يوماً، وببطء أكبر مع العمر.'],
      ['الأدمة', 'كولاجين، إيلاستين، خلايا ليفية، أوعية دموية وغدد. هنا تتكوّن التجاعيد.'],
      ['الغدة الدهنية', 'تفرز الزهم داخل البصيلة. انسداد البصيلة هو بداية حبّ الشباب.'],
      ['تحت الجلد', 'نسيج دهني يدعم ويعزل. يؤثّر التدليك من خلاله على تدفّق الدم واللمف.'],
    ],
    depthTitle: 'ما الذي يصل إلى أين', depthLead: 'كلما كان العلاج أعمق، طالت فترة التعافي وزادت المخاطر.',
    depth: [['تقشير إنزيمي وأحماض AHA لطيفة', 'الطبقة القرنية'], ['ساليسيليك، مانديليك، جيسنر', 'البشرة'], ['موجات فوق صوتية وإدخال مكوّنات', 'البشرة (تحسّن النفاذ السطحي)'], ['تدليك وتصريف لمفاوي', 'تحت الجلد والعضلات']],
    layerNames: ['القرنية', 'البشرة', 'الأدمة', 'تحت الجلد'],
    medical: 'التقشير المتوسط والعميق، الوخز بالإبر الدقيقة (أي جهاز يثقب الجلد)، الميزوثيرابي والحقن تصل إلى الأدمة. هذا مجال طبي، وفي إسرائيل هو مخصّص للأطباء.',
    facts: [
      ['حموضة الجلد', '4.5–5.5. الغلاف الحمضي يحمي من البكتيريا. التنظيف القلوي جداً يضرّه.'],
      ['أنواع البشرة IV–VI', 'الحرارة وإضعاف الحاجز يزيدان خطر البقع ما بعد الالتهاب. نبدأ بلطف.'],
    ],
  },
};

export const NAIL: Record<BookLang, { title: string; lead: string; parts: [string, string][]; facts: [string, string][] }> = {
  he: {
    title: 'מבנה הציפורן', lead: 'הציפורן היא יחידה חיה. מה שעושים בקוטיקולה ובמשטח קובע אם היא תגדל בריאה.',
    parts: [
      ['לוח הציפורן', 'שכבות קרטין דחוסות, בלי עצבים ובלי כלי דם. השחזה מורידה שכבות שלא חוזרות עד שהציפורן מתחלפת.'],
      ['מטריקס', 'המקום שבו הציפורן נוצרת, מתחת לעור בבסיס. פגיעה כאן משאירה פסים ושקעים שגדלים החוצה.'],
      ['אפוניכיום', 'העור החי בבסיס הציפורן. הוא אוטם את המטריקס מפני חיידקים, ולכן לא חותכים אותו.'],
      ['קוטיקולה', 'העור המת שנדבק ללוח. אותה מסירים, ורק אותה. פטריגיום הוא משהו אחר: צמיחה לא תקינה של עור על הלוח. לא מסירים, מפנים לרופא.'],
      ['היפוניכיום', 'העור מתחת לקצה החופשי. אוטם את מיטת הציפורן. לא מנקים בעומק עם כלי חד.'],
      ['מיטת הציפורן', 'העור שעליו הלוח יושב. ציפורן שמתנתקת ממנה (אוניכוליזיס) לא מקבלת מוצר.'],
    ],
    facts: [
      ['קצב צמיחה', 'כ-3 מ״מ בחודש בידיים. ציפורן שלמה מתחלפת ב-4–6 חודשים.'],
      ['צריבה במנורה', 'סימן לציפורן דקה או לשכבה עבה מדי. לא "חלק מהתהליך".'],
    ],
  },
  en: {
    title: 'The nail unit', lead: 'The nail is a living unit. What you do at the cuticle and on the surface decides whether it grows healthy.',
    parts: [
      ['Nail plate', 'Compact layers of keratin, with no nerves or blood vessels. Buffing removes layers that don\'t come back until the nail grows out.'],
      ['Matrix', 'Where the nail is made, under the skin at the base. Damage here leaves ridges and dents that grow out.'],
      ['Eponychium', 'The living skin at the base of the nail. It seals the matrix from bacteria, so it is never cut.'],
      ['Cuticle', 'The dead skin stuck to the plate. This is what you remove, and only this. A pterygium is something else: an abnormal growth of skin over the plate. Never remove it, refer to a doctor.'],
      ['Hyponychium', 'The skin under the free edge. It seals the nail bed. Never clean deep with a sharp tool.'],
      ['Nail bed', 'The skin the plate sits on. A nail lifting off it (onycholysis) gets no product.'],
    ],
    facts: [
      ['Growth rate', 'About 3 mm a month on the hands. A whole nail grows out in 4–6 months.'],
      ['Burning under the lamp', 'A sign of a thin nail or a coat that is too thick. Not "part of the process".'],
    ],
  },
  ar: {
    title: 'بنية الظفر', lead: 'الظفر وحدة حيّة. ما نفعله عند الجلد المحيط وعلى السطح يحدّد إن كان سينمو سليماً.',
    parts: [
      ['صفيحة الظفر', 'طبقات كيراتين مضغوطة، بدون أعصاب أو أوعية دموية. البرد يزيل طبقات لا تعود حتى يتجدّد الظفر.'],
      ['المصفوفة', 'مكان تكوّن الظفر، تحت الجلد عند القاعدة. الضرر هنا يترك خطوطاً وانخفاضات تنمو للخارج.'],
      ['الجلد الحي عند القاعدة', 'يغلق المصفوفة أمام البكتيريا، لذلك لا يُقصّ أبداً.'],
      ['الجلد الميت (الكيوتيكل)', 'الجلد الميت الملتصق بالصفيحة. هذا ما نزيله، وهو فقط. الظفرة (pterygium) شيء آخر: نموّ غير طبيعي للجلد فوق الصفيحة. لا تُزال، تُحوَّل إلى طبيب.'],
      ['ما تحت الحافة', 'الجلد تحت الحافة الحرّة. يغلق سرير الظفر. لا تنظيف عميق بأداة حادّة.'],
      ['سرير الظفر', 'الجلد الذي تجلس عليه الصفيحة. الظفر المنفصل عنه لا يُوضع عليه مستحضر.'],
    ],
    facts: [
      ['سرعة النمو', 'نحو 3 ملم في الشهر في اليدين. يتجدّد الظفر كاملاً خلال 4–6 أشهر.'],
      ['الحرقان تحت المصباح', 'علامة على ظفر رقيق أو طبقة سميكة جداً. ليس "جزءاً من العملية".'],
    ],
  },
};

/** One photograph per chapter (public/defaults, the product's own treatment photos). Decoration with a meaning: what the chapter treats. */
export const PHOTOS: Record<string, string> = {
  skin: '/defaults/hero.jpg',
  nail: '/defaults/nails-about.jpg',
  acne: '/defaults/acne.jpg',
  pigmentation: '/defaults/pigmentation.jpg',
  'anti-aging': '/defaults/anti-aging.jpg',
  'sensitive-rosacea': '/defaults/neutral.jpg',
  'deep-cleansing': '/defaults/deep-cleansing.jpg',
  dehydrated: '/defaults/facial-classic.jpg',
  'oily-pores': '/defaults/peel-green.jpg',
  glow: '/defaults/led.jpg',
  'acne-marks': '/defaults/about.jpg',
  'superficial-peel': '/defaults/peel-deep.jpg',
  devices: '/defaults/equipment.jpg',
  'laser-hair': '/defaults/laser-hair.jpg',
  pedicure: '/defaults/nails-pedicure.jpg',
  'gel-manicure': '/defaults/nails-manicure.jpg',
  'gel-removal': '/defaults/nails-neutral.jpg',
  'gel-extensions': '/defaults/nails-extensions.jpg',
};
