// lib/protocolBook/frontMatter.ts — the book's front and back matter: "before we begin" (how a protocol is built, and the five
// rules that hold before every treatment) and a short glossary. What turns a set of protocols into a book a reader can find
// her way in. General, not professional detail: shown to every reader, whatever her field or access.
import type { BookLang } from './types.ts';

export type HowTo = { title: string; lead: string; partsTitle: string; parts: [string, string][]; rulesTitle: string; rules: string[] };
export type Glossary = { title: string; lead: string; terms: [string, string][] };

export const HOWTO: Record<BookLang, HowTo> = {
  he: {
    title: 'לפני שמתחילים',
    lead: 'הספר הזה נכתב כדי לעמוד לידך בחדר הטיפולים. כל פרוטוקול בנוי באותו סדר, כך שתמצאי כל דבר באותו מקום.',
    partsTitle: 'איך בנוי פרוטוקול',
    parts: [
      ['מטרה ולמי מתאים', 'מה הטיפול אמור להשיג, ולמי הוא לא מיועד.'],
      ['לא מטפלים היום', 'מצבים שבהם דוחים את הטיפול, מפנים לרופא או בוחרים טיפול אחר.'],
      ['מטפלים, עם התאמה', 'מצבים שבהם מטפלים, אבל משנים ריכוז, מדלגים על שלב או בודקים רגישות קודם.'],
      ['שלבי הטיפול', 'לפי הסדר, עם הזמן של כל שלב.'],
      ['מה תקין אחרי, ומתי עוצרים', 'כדי שתדעי מה לומר ללקוחה מראש, ומתי להפסיק באמצע.'],
      ['שאלות ללקוחה', 'השאלות שחובה לשאול. הן קיימות גם כשאלון לחתימה.'],
    ],
    rulesTitle: 'חמישה כללים לפני כל טיפול',
    rules: [
      'שאלון בריאות חתום ומעודכן. בכל טיפול שואלים שוב: "השתנה משהו מאז הפעם הקודמת?"',
      'אבחון של העור או הציפורן לפני שבוחרים פרוטוקול, לא אחרי.',
      'מוצר חדש או לקוחה חדשה: בדיקת רגישות 48 שעות לפני.',
      'ריכוזים, זמנים ופרמטרים של מכשור הם לפי הוראות היצרן. הספר נותן את המסגרת, והיצרן נותן את המספרים.',
      'מתעדים בכרטיס הלקוחה מה נעשה, באיזה מוצר, ואיך העור הגיב.',
    ],
  },
  en: {
    title: 'Before we begin',
    lead: 'This book was written to stand beside you in the treatment room. Every protocol follows the same order, so you find each thing in the same place.',
    partsTitle: 'How a protocol is built',
    parts: [
      ['Goal and who it suits', 'What the treatment is meant to achieve, and who it is not for.'],
      ['Do not treat today', 'Situations where you postpone, refer to a doctor or choose another treatment.'],
      ['Treat, with adaptation', 'Situations where you treat, but change the strength, skip a step or patch test first.'],
      ['Treatment steps', 'In order, with the time each one takes.'],
      ['What is normal after, and when to stop', 'So you know what to tell the client in advance, and when to stop midway.'],
      ['Questions for the client', 'The questions you must ask. They also exist as a form to sign.'],
    ],
    rulesTitle: 'Five rules before every treatment',
    rules: [
      'A signed, up-to-date health questionnaire. At every session ask again: "Has anything changed since last time?"',
      'Analyze the skin or nail before you choose a protocol, not after.',
      'A new product or a new client: patch test 48 hours before.',
      'Concentrations, times and device settings follow the manufacturer. The book gives the framework; the manufacturer gives the numbers.',
      'Record on the client card what was done, with which product, and how the skin reacted.',
    ],
  },
  ar: {
    title: 'قبل أن نبدأ',
    lead: 'كُتب هذا الكتاب ليقف إلى جانبكِ في غرفة العلاج. كل بروتوكول مبني بنفس الترتيب، فتجدين كل شيء في المكان نفسه.',
    partsTitle: 'كيف يُبنى البروتوكول',
    parts: [
      ['الهدف ولمن يناسب', 'ما الذي يُفترض أن يحقّقه العلاج، ولمن لا يصلح.'],
      ['لا نعالج اليوم', 'حالات نؤجّل فيها العلاج، نحوّل إلى طبيب أو نختار علاجاً آخر.'],
      ['نعالج مع تعديل', 'حالات نعالج فيها، لكن نغيّر التركيز، نتخطّى مرحلة أو نختبر الحساسية أولاً.'],
      ['مراحل العلاج', 'بالترتيب، مع وقت كل مرحلة.'],
      ['ما هو طبيعي بعد العلاج، ومتى نتوقّف', 'لتعرفي ما تقولينه للزبونة مسبقاً، ومتى تتوقّفين في المنتصف.'],
      ['أسئلة للزبونة', 'الأسئلة التي يجب طرحها. وهي موجودة أيضاً كنموذج للتوقيع.'],
    ],
    rulesTitle: 'خمس قواعد قبل كل علاج',
    rules: [
      'استبيان صحي موقّع ومحدَّث. في كل جلسة نسأل من جديد: "هل تغيّر شيء منذ المرة السابقة؟"',
      'تشخيص البشرة أو الظفر قبل اختيار البروتوكول، وليس بعده.',
      'مستحضر جديد أو زبونة جديدة: اختبار حساسية قبل 48 ساعة.',
      'التركيزات والأوقات وإعدادات الأجهزة حسب تعليمات المصنّع. الكتاب يعطي الإطار، والمصنّع يعطي الأرقام.',
      'نوثّق في بطاقة الزبونة ما الذي تمّ، بأي مستحضر، وكيف تفاعلت البشرة.',
    ],
  },
};

export const GLOSSARY: Record<BookLang, Glossary> = {
  he: {
    title: 'מילון קצר',
    lead: 'המונחים שחוזרים בספר, במילים פשוטות.',
    terms: [
      ['התוויית נגד', 'מצב שבו טיפול עלול להזיק, ולכן לא מבצעים אותו או משנים אותו.'],
      ['פוטוטיפ (פיצפטריק)', 'סולם של שישה סוגי עור לפי התגובה לשמש, מ-I (בהיר מאוד, נשרף תמיד) עד VI (כהה מאוד). קובע את עוצמת הפילינג ואת סוג הלייזר.'],
      ['pH', 'מדד החומציות. באותו ריכוז, חומצה ב-pH נמוך יותר חזקה יותר על העור.'],
      ['AHA, BHA, PHA', 'משפחות של חומצות. AHA (גליקולית, לקטית, מנדלית) מסיסות במים. BHA (סליצילית) מסיסה בשומן ונכנסת לנקבובית. PHA עדינות יותר.'],
      ['ניטרול', 'עצירת פעולת החומצה, בתמיסה מנטרלת או במים, לפי היצרן.'],
      ['פרוסט', 'הלבנה של העור בזמן פילינג. סימן שהחומצה הגיעה עמוק מדי. בפילינג שטחי זה סימן לעצור.'],
      ['קומדון', 'זקיק סתום. פתוח הוא נקודה שחורה, וסגור הוא בליטה לבנה קטנה.'],
      ['כתם פוסט-דלקתי', 'כתם כהה או אדום שנשאר אחרי דלקת או פציעה בעור. שכיח יותר בעור כהה.'],
      ['מחסום העור', 'השכבה הקרנית והשומנים שבה. שומר את הלחות בפנים ואת המגרים בחוץ.'],
      ['HEMA', 'אקרילט נפוץ בג׳לים לציפורניים. הגורם השכיח לאלרגיה למוצרי ציפורניים.'],
      ['אפוניכיום', 'העור החי בבסיס הציפורן. לא חותכים אותו.'],
      ['חיטוי ועיקור', 'חיטוי מפחית את המיקרואורגניזמים. עיקור, באוטוקלב, משמיד את כולם. כלים שנוגעים בעור עוברים עיקור.'],
    ],
  },
  en: {
    title: 'A short glossary',
    lead: 'The terms that recur in the book, in plain words.',
    terms: [
      ['Contraindication', 'A situation where a treatment could do harm, so you do not perform it or you change it.'],
      ['Phototype (Fitzpatrick)', 'A scale of six skin types by reaction to the sun, from I (very fair, always burns) to VI (very dark). It sets the strength of a peel and the type of laser.'],
      ['pH', 'The measure of acidity. At the same concentration, an acid at a lower pH is stronger on the skin.'],
      ['AHA, BHA, PHA', 'Families of acids. AHAs (glycolic, lactic, mandelic) are water-soluble. BHA (salicylic) is oil-soluble and gets into the pore. PHAs are gentler.'],
      ['Neutralizing', 'Stopping the acid\'s action, with a neutralizing solution or water, as the manufacturer says.'],
      ['Frost', 'Whitening of the skin during a peel. A sign the acid has gone too deep. In a superficial peel it is a sign to stop.'],
      ['Comedone', 'A blocked follicle. Open, it is a blackhead; closed, a small white bump.'],
      ['Post-inflammatory mark', 'A dark or red mark left after inflammation or injury to the skin. More common in darker skin.'],
      ['Skin barrier', 'The outer layer and the lipids in it. It keeps moisture in and irritants out.'],
      ['HEMA', 'An acrylate common in nail gels. The most frequent cause of allergy to nail products.'],
      ['Eponychium', 'The living skin at the base of the nail. It is never cut.'],
      ['Disinfection & sterilization', 'Disinfection reduces microorganisms. Sterilization, in an autoclave, destroys all of them. Tools that touch skin are sterilized.'],
    ],
  },
  ar: {
    title: 'معجم قصير',
    lead: 'المصطلحات التي تتكرّر في الكتاب، بكلمات بسيطة.',
    terms: [
      ['مانع استعمال', 'حالة قد يضرّ فيها العلاج، لذلك لا نجريه أو نعدّله.'],
      ['نوع البشرة (فيتزباتريك)', 'سلّم من ستة أنواع بشرة حسب تفاعلها مع الشمس، من I (فاتحة جداً، تحترق دائماً) إلى VI (داكنة جداً). يحدّد قوة التقشير ونوع الليزر.'],
      ['pH', 'مقياس الحموضة. بنفس التركيز، الحمض ذو pH أقلّ أقوى على البشرة.'],
      ['AHA، BHA، PHA', 'عائلات من الأحماض. AHA (جليكوليك، لاكتيك، مانديليك) تذوب في الماء. BHA (ساليسيليك) يذوب في الدهون ويدخل المسام. PHA ألطف.'],
      ['المعادلة', 'إيقاف عمل الحمض، بمحلول معادِل أو بالماء، حسب المصنّع.'],
      ['فروست', 'ابيضاض الجلد أثناء التقشير. علامة على أنّ الحمض وصل عميقاً جداً. في التقشير السطحي هو علامة للتوقّف.'],
      ['كوميدون', 'بصيلة مسدودة. المفتوح رأس أسود، والمغلق نتوء أبيض صغير.'],
      ['بقعة ما بعد الالتهاب', 'بقعة داكنة أو حمراء تبقى بعد التهاب أو إصابة في الجلد. أكثر شيوعاً في البشرة الداكنة.'],
      ['الحاجز الجلدي', 'الطبقة القرنية والدهون التي فيها. يحفظ الرطوبة في الداخل والمهيّجات في الخارج.'],
      ['HEMA', 'أكريلات شائع في جل الأظافر. السبب الأكثر شيوعاً للحساسية من مستحضرات الأظافر.'],
      ['الجلد الحي عند قاعدة الظفر', 'لا يُقصّ أبداً.'],
      ['التعقيم والتطهير', 'التطهير يقلّل الكائنات الدقيقة. التعقيم، في الأوتوكلاف، يقضي عليها كلّها. الأدوات التي تلمس الجلد تُعقَّم.'],
    ],
  },
};
