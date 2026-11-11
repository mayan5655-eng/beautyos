// lib/i18n/formTemplatesI18n.ts
//
// The client forms (lib/formTemplates.ts) in Arabic and English, for the language picker on /form.
//
// ── Display only. What is STORED never changes ───────────────────────────
// A signed form_data is keyed by the question's index, and a choice or multi answer is stored as the template's
// Hebrew option ("כן", "20 עד 29", "סוכרת, לחץ דם"). The owner's answers sheet, the flags and the intake checks all
// read those Hebrew values. So a client who fills the form in Arabic or English sees these labels, and the page still
// stores the Hebrew option at the same position: the record is identical whatever language it was filled in.
//
// Each translated template mirrors its Hebrew one item for item: same length, a section where there is a section, and
// the same number of options in the same order (test-i18n.ts holds all of it). A string item is the question (or the
// section title); an object item can also carry options and a placeholder.
//
// Medical wording is plain and conservative on purpose: what a client can answer honestly without a dictionary.

import type { Lang } from './core.ts';
import { FORMS, isSection, normalizeQuestion, type FormItem } from '../formTemplates.ts';

export type LocItem = string | { q: string; options?: string[]; placeholder?: string };
export interface LocTemplate { title: string; intro?: string; questions: LocItem[] }

const AR_PREGNANT = 'هل أنتِ حامل أو مرضعة؟';
const EN_PREGNANT = 'Are you pregnant or breastfeeding?';
const AR_THINNERS = 'هل تتناولين أدوية مميّعة للدم؟';
const EN_THINNERS = 'Are you taking blood-thinning medication?';
const AR_DIABETES = 'هل تعانين من السكري؟';
const EN_DIABETES = 'Do you have diabetes?';
const AR_EPILEPSY = 'هل تعانين من الصرع؟';
const EN_EPILEPSY = 'Do you have epilepsy?';
const AR_CLOTTING = 'هل تعانين من مشاكل في تخثّر الدم؟';
const EN_CLOTTING = 'Do you have blood clotting problems?';
const AR_HERPES_AREA = 'هل لديكِ هربس متكرر في منطقة العلاج؟';
const EN_HERPES_AREA = 'Do you get recurring herpes (cold sores) in the treatment area?';
const AR_ROACCUTANE = 'هل تتناولين روأكتان؟';
const EN_ROACCUTANE = 'Are you taking Roaccutane (isotretinoin)?';

const AR: Record<string, LocTemplate> = {
  general: {
    title: 'تصريح صحي عام',
    questions: [
      AR_PREGNANT,
      'هل تعانين من أمراض جلدية (صدفية، إكزيما، وردية)؟',
      'هل لديكِ حساسية معروفة من مستحضرات التجميل؟',
      AR_DIABETES,
      AR_THINNERS,
      'هل أجريتِ عمليات جراحية في منطقة الوجه خلال السنة الأخيرة؟',
      'هل تعانين من مشاكل في القلب أو من ضغط دم مرتفع؟',
      AR_EPILEPSY,
      'هل لديكِ زراعات معدنية في الجسم؟',
    ],
  },
  nails_general: {
    title: 'تصريح صحي وموافقة على العلاج (أظافر)',
    questions: [
      AR_PREGNANT,
      'هل لديكِ حساسية من الجل أو الأكريليك أو طلاء الأظافر أو مواد التعقيم؟',
      'هل لديكِ فطريات أو التهاب أو جرح مفتوح في الأظافر أو في الجلد المحيط بها؟',
      'هل تعانين من السكري أو من مشاكل في الدورة الدموية في اليدين أو القدمين؟',
      AR_THINNERS,
      'هل حدثت لديكِ ردود فعل مزعجة بعد علاج أظافر في الماضي؟',
      'هل هناك شيء آخر من المهم أن أعرفه قبل العلاج؟',
    ],
  },
  nails_media: {
    title: 'موافقة على تصوير الأعمال',
    questions: [
      'هل توافقين على أن أصوّر العمل الذي قمت به على أظافركِ؟',
      'هل توافقين على نشر الصور في صفحات العمل (دون تفاصيل تعريفية)؟',
      'هل تعلمين أنه يمكنكِ طلب إزالة أي صورة في أي وقت؟',
    ],
  },
  plasma: {
    title: 'تصريح صحي: علاج بلازما',
    questions: [
      AR_PREGNANT,
      'هل لديكِ جهاز تنظيم ضربات القلب أو زرعة معدنية؟',
      AR_EPILEPSY,
      AR_CLOTTING,
      AR_THINNERS,
      'هل لديكِ جروح مفتوحة أو التهابات جلدية نشطة في منطقة العلاج؟',
      AR_HERPES_AREA,
      AR_DIABETES,
      'هل خضعتِ لعلاج بلازما خلال الشهر الأخير؟',
      'هل لديكِ حساسية مفرطة للحرارة؟',
    ],
  },
  device: {
    title: 'تصريح صحي: علاج بأجهزة متطورة',
    questions: [
      AR_PREGNANT,
      'هل لديكِ جهاز تنظيم ضربات القلب أو جهاز إزالة الرجفان؟',
      'هل لديكِ زراعات معدنية في منطقة العلاج؟',
      AR_EPILEPSY,
      'هل تعانين من مشاكل في القلب أو في ضغط الدم؟',
      'هل تعانين من مرض سرطان نشط؟',
      AR_CLOTTING,
      AR_THINNERS,
      'هل لديكِ جروح مفتوحة في منطقة العلاج؟',
      'هل أجريتِ عملية جراحية في منطقة العلاج خلال السنة الأخيرة؟',
    ],
  },
  laser: {
    title: 'تصريح صحي: إزالة الشعر بالليزر',
    questions: [
      AR_PREGNANT,
      'هل تتناولين أدوية تزيد الحساسية للضوء (مينوسيكلين، تتراسيكلين)؟',
      'هل تتناولين روأكتان؟ (إذا كان الجواب نعم، هل توقفتِ عنه قبل 6 أشهر أو أكثر؟)',
      'هل لديكِ وشوم في منطقة العلاج؟',
      'هل تعرّضتِ لشمس قوية خلال الأسبوعين الأخيرين؟',
      AR_HERPES_AREA,
      'هل خضعتِ لعلاج بالليزر خلال الشهر الأخير؟',
      'هل لديكِ أمراض جلدية نشطة في منطقة العلاج؟',
      AR_DIABETES,
      'هل لديكِ ميل لتكوّن الندوب البارزة (الجُدَرة)؟',
    ],
  },
  peel: {
    title: 'تصريح صحي: علاج تقشير',
    questions: [
      AR_PREGNANT,
      AR_ROACCUTANE,
      'هل لديكِ جروح مفتوحة أو التهابات جلدية نشطة؟',
      'هل تعرّضتِ لشمس قوية خلال الأسبوع الأخير؟',
      'هل لديكِ حساسية من الأحماض (AHA/BHA/TCA)؟',
      'هل خضعتِ لتقشير خلال الشهر الأخير؟',
      'هل لديكِ هربس متكرر في الوجه؟',
      AR_THINNERS,
      'هل لديكِ ميل لتكوّن الندوب؟',
    ],
  },
  skin_anamnesis: {
    title: 'تشخيص البشرة واستبيان صحي',
    intro: 'بعض الأسئلة قبل العلاج الأول، لأتعرّف على بشرتكِ وأختار لكِ العلاج المناسب. يستغرق ذلك حوالي خمس دقائق.',
    questions: [
      'معلومات عامة',
      { q: 'ما هي فئتكِ العمرية؟', options: ['حتى 19', '20 إلى 29', '30 إلى 39', '40 إلى 49', '50 إلى 59', '60 فما فوق'] },
      'ما هو عملكِ؟',

      'الصحة',
      AR_PREGNANT,
      { q: 'هل لديكِ مرض مزمن؟', options: ['السكري', 'الغدة الدرقية', 'ضغط الدم', 'مرض مناعي ذاتي', 'غير ذلك', 'لا يوجد'] },
      { q: 'ما الأدوية التي تتناولينها بشكل دائم؟', placeholder: 'إذا لا يوجد، اكتبي "لا يوجد"' },
      'هل تناولتِ روأكتان خلال الأشهر الستة الأخيرة؟',
      AR_THINNERS,
      'هل تتلقّين علاجًا هرمونيًا أو تتناولين حبوب منع الحمل؟',
      { q: 'هل لديكِ حساسية معروفة؟ من أي مواد؟', placeholder: 'أدوية، طعام، مستحضرات تجميل. إذا لا يوجد، اكتبي "لا يوجد"' },
      'هل لديكِ هربس متكرر؟',
      'هل لديكِ ميل لتكوّن الندوب البارزة (الجُدَرة)؟',
      'هل لديكِ جهاز تنظيم ضربات القلب أو زراعات معدنية في الجسم؟',
      { q: 'هل خضعتِ لعلاج في الوجه خلال الشهر الأخير؟', options: ['بوتوكس', 'فيلر', 'ليزر', 'تقشير', 'غير ذلك', 'لم أخضع لأي علاج'] },
      'هل هناك أمر صحي آخر من المهم أن أعرفه؟',

      'نمط الحياة',
      { q: 'إلى أي مدى تتعرّضين للشمس؟', options: ['تقريبًا لا', 'أحيانًا', 'كثيرًا، معظم اليوم في الخارج'] },
      { q: 'إلى أي مدى تحرصين على واقي الشمس؟', options: ['كل يوم', 'فقط عندما أكون في الشمس', 'تقريبًا أبدًا'] },
      { q: 'هل تدخّنين؟', options: ['لا', 'أحيانًا', 'نعم'] },
      { q: 'كم من الماء تشربين يوميًا؟', options: ['حتى 4 أكواب', '5 إلى 8 أكواب', '9 أكواب فأكثر'] },
      { q: 'كم ساعة تنامين في الليل؟', options: ['حتى 5 ساعات', '6 إلى 7 ساعات', '8 ساعات فأكثر'] },
      { q: 'كيف مستوى التوتر لديكِ في الفترة الأخيرة؟', options: ['منخفض', 'متوسط', 'مرتفع'] },

      'بشرتكِ',
      { q: 'ما نوع بشرتكِ، حسب شعوركِ؟', options: ['عادية', 'جافة', 'دهنية', 'مختلطة', 'حساسة', 'معرّضة لحب الشباب'] },
      { q: 'ما الذي يزعجكِ في بشرتكِ؟', options: ['حب الشباب', 'تصبّغات', 'تجاعيد وخطوط تعبير', 'احمرار', 'مسام واسعة', 'جفاف', 'دهنية', 'حساسية', 'هالات سوداء', 'غير ذلك'] },
      { q: 'كيف تتفاعل بشرتكِ مع المنتجات الجديدة؟', options: ['عادةً بشكل جيد', 'أحيانًا احمرار أو حكة', 'تتفاعل بسهولة، فهي حساسة جدًا'] },
      'ما علاجات الوجه التي قمتِ بها في الماضي، وكيف شعرتِ بعدها؟',

      'روتين العناية',
      { q: 'بماذا تنظّفين وجهكِ؟', options: ['جل أو صابون تنظيف', 'ماء ميسيلار', 'ماء فقط', 'لا أنظّف بانتظام'] },
      { q: 'هل تستخدمين مواد فعّالة؟', options: ['ريتينول', 'أحماض', 'فيتامين C', 'غير ذلك', 'لا أستخدم'] },
      { q: 'هل تستخدمين كريم ترطيب؟', options: ['كل يوم', 'أحيانًا', 'لا'] },
      { q: 'أي واقي شمس تستخدمين؟', placeholder: 'اسم المنتج ومعامل الحماية، إن وُجد' },
      { q: 'كيف تزيلين المكياج؟', options: ['مزيل مكياج وبعده تنظيف', 'مناديل مبللة', 'ماء أو صابون فقط', 'لا أضع مكياجًا'] },

      'أهدافكِ',
      { q: 'ما الذي تودّين أن يتغيّر في بشرتكِ؟', placeholder: 'بكلماتكِ، ما المهم لكِ أن نحققه معًا' },

      'تصريح',
      { q: 'أصرّح بأن جميع المعلومات التي قدّمتها في هذا النموذج صحيحة وكاملة، وبأنني سأُبلغ إذا تغيّر أي شيء قبل العلاج القادم.', options: ['أوافق'] },
    ],
  },
};

const EN: Record<string, LocTemplate> = {
  general: {
    title: 'General health declaration',
    questions: [
      EN_PREGNANT,
      'Do you have any skin conditions (psoriasis, eczema, rosacea)?',
      'Do you have any known allergies to cosmetic products?',
      EN_DIABETES,
      EN_THINNERS,
      'Have you had any surgery on your face in the past year?',
      'Do you have heart problems or high blood pressure?',
      EN_EPILEPSY,
      'Do you have any metal implants in your body?',
    ],
  },
  nails_general: {
    title: 'Health declaration and treatment consent (nails)',
    questions: [
      EN_PREGNANT,
      'Are you allergic to gel, acrylic, nail polish or disinfectants?',
      'Do you have a fungal infection, inflammation or an open wound on your nails or the skin around them?',
      'Do you have diabetes or circulation problems in your hands or feet?',
      EN_THINNERS,
      'Have you had an unpleasant reaction after a nail treatment in the past?',
      'Is there anything else I should know before the treatment?',
    ],
  },
  nails_media: {
    title: 'Photo consent',
    questions: [
      'Do you agree to me photographing the work done on your nails?',
      "Do you agree to the photos being posted on the business's pages (without identifying details)?",
      'Are you aware that you can ask for a photo to be removed at any time?',
    ],
  },
  plasma: {
    title: 'Health declaration: plasma treatment',
    questions: [
      EN_PREGNANT,
      'Do you have a pacemaker or a metal implant?',
      EN_EPILEPSY,
      EN_CLOTTING,
      EN_THINNERS,
      'Do you have open wounds or active skin inflammation in the treatment area?',
      EN_HERPES_AREA,
      EN_DIABETES,
      'Have you had a plasma treatment in the past month?',
      'Are you highly sensitive to heat?',
    ],
  },
  device: {
    title: 'Health declaration: advanced device treatment',
    questions: [
      EN_PREGNANT,
      'Do you have a pacemaker or a defibrillator?',
      'Do you have metal implants in the treatment area?',
      EN_EPILEPSY,
      'Do you have heart or blood pressure problems?',
      'Do you have active cancer?',
      EN_CLOTTING,
      EN_THINNERS,
      'Do you have open wounds in the treatment area?',
      'Have you had surgery in the treatment area in the past year?',
    ],
  },
  laser: {
    title: 'Health declaration: laser hair removal',
    questions: [
      EN_PREGNANT,
      'Are you taking medication that makes you sensitive to light (minocycline, tetracycline)?',
      'Are you taking Roaccutane (isotretinoin)? (If yes, did you stop 6 or more months ago?)',
      'Do you have tattoos in the treatment area?',
      'Have you been exposed to strong sun in the past two weeks?',
      EN_HERPES_AREA,
      'Have you had a laser treatment in the past month?',
      'Do you have active skin conditions in the treatment area?',
      EN_DIABETES,
      'Do you tend to form raised scars (keloids)?',
    ],
  },
  peel: {
    title: 'Health declaration: peel treatment',
    questions: [
      EN_PREGNANT,
      EN_ROACCUTANE,
      'Do you have open wounds or active skin inflammation?',
      'Have you been exposed to strong sun in the past week?',
      'Are you allergic to acids (AHA/BHA/TCA)?',
      'Have you had a peel in the past month?',
      'Do you get recurring herpes (cold sores) on your face?',
      EN_THINNERS,
      'Do you tend to scar easily?',
    ],
  },
  skin_anamnesis: {
    title: 'Skin assessment and health history',
    intro: 'A few questions before your first treatment, so I can get to know your skin and tailor the treatment to you. It takes about five minutes.',
    questions: [
      'General details',
      { q: 'What is your age range?', options: ['Up to 19', '20 to 29', '30 to 39', '40 to 49', '50 to 59', '60 and over'] },
      'What do you do for work?',

      'Health',
      EN_PREGNANT,
      { q: 'Do you have a chronic illness?', options: ['Diabetes', 'Thyroid', 'Blood pressure', 'Autoimmune', 'Other', 'None'] },
      { q: 'What medication do you take regularly?', placeholder: 'If none, write "none"' },
      'Have you taken Roaccutane (isotretinoin) in the past six months?',
      EN_THINNERS,
      'Are you on hormone therapy or taking the pill?',
      { q: 'Do you have any known allergies? To what?', placeholder: 'Medication, food, cosmetic ingredients. If none, write "none"' },
      'Do you get recurring herpes (cold sores)?',
      'Do you tend to form raised scars (keloids)?',
      'Do you have a pacemaker or metal implants in your body?',
      { q: 'Have you had a facial treatment in the past month?', options: ['Botox', 'Fillers', 'Laser', 'Peel', 'Other', 'None'] },
      'Is there anything else about your health I should know?',

      'Lifestyle',
      { q: 'How much sun are you exposed to?', options: ['Hardly any', 'Sometimes', "A lot, I'm outdoors most of the day"] },
      { q: 'How often do you wear sunscreen?', options: ['Every day', "Only when I'm in the sun", 'Almost never'] },
      { q: 'Do you smoke?', options: ['No', 'Sometimes', 'Yes'] },
      { q: 'How much water do you drink a day?', options: ['Up to 4 glasses', '5 to 8 glasses', '9 glasses or more'] },
      { q: 'How many hours do you sleep a night?', options: ['Up to 5 hours', '6 to 7 hours', '8 hours or more'] },
      { q: 'How has your stress level been lately?', options: ['Low', 'Medium', 'High'] },

      'Your skin',
      { q: 'What is your skin type, as you feel it?', options: ['Normal', 'Dry', 'Oily', 'Combination', 'Sensitive', 'Acne-prone'] },
      { q: 'What bothers you about your skin?', options: ['Acne', 'Pigmentation', 'Wrinkles and expression lines', 'Redness', 'Enlarged pores', 'Dryness', 'Oiliness', 'Sensitivity', 'Dark circles', 'Other'] },
      { q: 'How does your skin react to new products?', options: ['Usually fine', 'Sometimes redness or itching', "It reacts easily, it's very sensitive"] },
      'Which facial treatments have you had before, and how did you feel afterwards?',

      'Skincare routine',
      { q: 'What do you cleanse your face with?', options: ['Cleansing gel or soap', 'Micellar water', 'Water only', "I don't cleanse regularly"] },
      { q: 'Do you use active ingredients?', options: ['Retinol', 'Acids', 'Vitamin C', 'Other', "I don't use any"] },
      { q: 'Do you use a moisturizer?', options: ['Every day', 'Sometimes', 'No'] },
      { q: 'Which sunscreen do you use?', placeholder: 'Product name and SPF, if you use one' },
      { q: 'How do you remove makeup?', options: ['Makeup remover followed by cleanser', 'Wipes', 'Just water or soap', "I don't wear makeup"] },

      'Your goals',
      { q: 'What would you like to change about your skin?', placeholder: 'In your own words, what matters to you that we achieve together' },

      'Declaration',
      { q: 'I declare that all the information I have given in this form is true and complete, and that I will let you know if anything changes before my next treatment.', options: ['I confirm'] },
    ],
  },
};

export const FORM_TRANSLATIONS: Record<Exclude<Lang, 'he'>, Record<string, LocTemplate>> = { ar: AR, en: EN };

/** What one item shows in a language. Hebrew, or a template with no translation, shows the template's own words. */
export interface ItemText { text: string; placeholder?: string; optionLabel: (option: string) => string }

const loc = (formType: string, lang: Lang): LocTemplate | null =>
  lang === 'he' ? null : FORM_TRANSLATIONS[lang]?.[formType] || null;

const own = (o: string) => o;

export function formTitle(formType: string, lang: Lang): string {
  return loc(formType, lang)?.title || FORMS[formType]?.title || '';
}
export function formIntro(formType: string, lang: Lang): string | undefined {
  const l = loc(formType, lang);
  return l ? l.intro : FORMS[formType]?.intro;
}

/** The words for item `index` of a template in a language: the question or heading, its placeholder, its option labels. */
export function itemText(formType: string, lang: Lang, index: number, item: FormItem): ItemText {
  const q = isSection(item) ? null : normalizeQuestion(item);
  const original: ItemText = isSection(item)
    ? { text: item.section, optionLabel: own }
    : { text: q?.q || '', placeholder: q?.placeholder, optionLabel: own };
  const t = loc(formType, lang)?.questions[index];
  if (!t) return original;
  // A translated item never falls back to a Hebrew placeholder: half a sentence in another language reads as broken.
  if (typeof t === 'string') return { text: t, optionLabel: own };
  const options = q?.options || [];
  return {
    text: t.q,
    placeholder: t.placeholder,
    optionLabel: (o: string) => {
      const i = options.indexOf(o);
      return i >= 0 && t.options && t.options[i] ? t.options[i] : o;
    },
  };
}
