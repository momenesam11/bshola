// WhatsApp messages and call scripts, in Egyptian Arabic.
//
// Rules (MARKETING_CLAIMS.md): reminders go out with one tap from the clinic's
// own number — never "automatic"; no staff/permissions; no result
// percentages; price only from PLANS. Research (review quotes etc.) is used to
// choose WHAT to talk about, never quoted back at the clinic — nobody likes
// hearing "I read your bad reviews".

import { PLANS } from '../seo'
import { SALES_ANGLES } from './angles'
import { bestLinkFor } from './links'

const START_PRICE = PLANS[0].price

// Who the messages are signed by. Change when someone else does the calling.
export const SENDER_NAME = 'مؤمن'

function salutation(lead) {
  const person = (lead?.contact_person ?? '').trim()
  if (person) return /^(د|دكتور|دكتورة|د\.)/.test(person) ? `أهلاً ${person}` : `أهلاً أستاذ/ة ${person}`
  return 'أهلاً بحضرتك'
}

const clinicWord = (lead) => (['salon', 'gym', 'education', 'other'].includes(lead?.category) ? 'المكان' : 'العيادة')

// First message per angle. {link} is the lead's demo page if one was made,
// else their sign-up link.
const OPENERS = {
  onboarding_help: (l) =>
    `${salutation(l)} 👋\nأنا ${SENDER_NAME} من بسهولة. شفت إن حضرتك عملت حساب ومكمّلتش إعداد صفحة الحجز.\nلو تحب، أجهّزهالك معاك على التليفون في 10 دقايق — بس قولّي الخدمات والمواعيد.\nأو تكمّل من هنا: {link}`,
  trial_closing: (l) =>
    `${salutation(l)} 👋\nأنا ${SENDER_NAME} من بسهولة. تجربة ${l.name} قرّبت تخلص، وحابب أعرف رأيك بصراحة: إيه اللي نفعك وإيه اللي ناقص؟\nولو حابب تكمّل، الباقات تبدأ من ${START_PRICE} جنيه في الشهر ومفيش عمولة على أي حجز.`,
  receptionist_workload: (l) =>
    `${salutation(l)} 👋\nأنا ${SENDER_NAME} من بسهولة — نظام حجز مواعيد مصري للعيادات.\nالمرضى بيحجزوا بنفسهم من لينك ${clinicWord(l) === 'العيادة' ? 'العيادة' : 'المكان'} 24 ساعة ويشوفوا المواعيد الفاضية، فالتليفون بيبطّل يرنّ على «فيه ميعاد إمتى؟».\nعملتلكم شكل الصفحة دي تتفرجوا عليها: {link}\nلو عجبتكم أفعّلهالكم 14 يوم ببلاش.`,
  scheduling: (l) =>
    `${salutation(l)} 👋\nأنا ${SENDER_NAME} من بسهولة — نظام حجز مواعيد مصري للعيادات.\nكل ميعاد بمدته، والنظام بيمنع إن ميعادين يتحجزوا على بعض، والجدول قدامك يوم/أسبوع/شهر بدل الدفتر.\nدي صفحة حجز معمولة لـ ${l.name} كمثال: {link}\nتحب أفعّلهالك 14 يوم ببلاش؟`,
  no_shows: (l) =>
    `${salutation(l)} 👋\nأنا ${SENDER_NAME} من بسهولة. المريض اللي مابيجيش بيضيّع ميعاد كان ممكن حد تاني ياخده.\nبسهولة بيجهّزلك رسايل تذكير كل مواعيد بكرا، وتبعتها من رقم ${clinicWord(l)} بضغطة زر — والمريض بيحجز لوحده من لينك.\nشوف شكلها لـ ${l.name}: {link}\nأقدر أفعّلهالك 14 يوم ببلاش من غير بطاقة.`,
  self_booking_24_7: (l) =>
    `${salutation(l)} 👋\nأنا ${SENDER_NAME} من بسهولة — نظام حجز مواعيد مصري.\nلينك حجز باسم ${l.name} تحطه في جوجل والفيسبوك والواتساب، والمريض يختار الميعاد الفاضي ويحجز بنفسه حتى بالليل.\nعملت شكل الصفحة كمثال: {link}\nلو عجبتك أفعّلهالك 14 يوم ببلاش.`,
  social_to_booking: (l) =>
    `${salutation(l)} 👋\nأنا ${SENDER_NAME} من بسهولة. اللي بيشوف بوستاتكم ويكلّمكم على الرسايل ممكن يبرد قبل ما حد يرد عليه.\nبلينك حجز في البايو، يحجز فوراً ويختار الميعاد الفاضي بنفسه.\nدي صفحة معمولة لـ ${l.name} كمثال: {link}\nأفعّلهالك 14 يوم ببلاش؟`,
  new_clinic: (l) =>
    `${salutation(l)} 👋 ومبروك على ${l.name}!\nأنا ${SENDER_NAME} من بسهولة — نظام حجز مواعيد وملفات مرضى مصري.\nوإنتوا لسه بتبدأوا: صفحة حجز باللوجو بتاعكم، ملف لكل مريض، وتذكير بالمواعيد على الواتساب — من غير أجهزة ولا تركيب.\nدي شكل صفحتكم: {link}\n14 يوم ببلاش من غير بطاقة.`,
  patient_follow_up: (l) =>
    `${salutation(l)} 👋\nأنا ${SENDER_NAME} من بسهولة. النظام بيقولك مين من مرضاك مجاش من شهر ومين من شهرين، وتبعتلهم رسالة ترجّعهم — وخطط العلاج والجلسات متسجّلة لكل مريض.\nشوف شكل صفحة ${l.name}: {link}`,
  referral: (l) =>
    `${salutation(l)} 👋\nأنا ${SENDER_NAME} من بسهولة. زميل لحضرتك بيستخدم بسهولة لحجز مواعيد عيادته، وقلت أعرّفك عليه.\nالمرضى بيحجزوا من لينك، والتذكير بيتبعت من رقم العيادة بضغطة زر.\nدي صفحة معمولة لـ ${l.name} كمثال: {link}\n14 يوم ببلاش.`,
}

const FOLLOW_UPS = [
  (l) => `${salutation(l)} 👋 بس بتأكد إن رسالتي وصلت. لو الوقت مش مناسب دلوقتي قولّي أكلّمك إمتى.\n{link}`,
  (l) => `${salutation(l)} — آخر رسالة مني عشان ماضايقكش 🙏\nلو حبيت تجرّب صفحة الحجز لـ ${l.name} في أي وقت، اللينك ده شغال: {link}\nولو مش مهتم قولّي وهشيلك من المتابعة.`,
]

const fill = (template, lead) => template.replace(/\{link\}/g, bestLinkFor(lead))

/** First WhatsApp message for this lead, for the chosen angle. */
export function openingMessage(lead, angleKey) {
  const build = OPENERS[angleKey] ?? OPENERS.self_booking_24_7
  return fill(build(lead), lead)
}

/** n = 1 for the first follow-up, 2 for the last. */
export function followUpMessage(lead, n = 1) {
  const build = FOLLOW_UPS[Math.min(Math.max(n, 1), FOLLOW_UPS.length) - 1]
  return fill(build(lead), lead)
}

/** Discovery questions to ask on the call, by business category. */
const DISCOVERY = {
  dental: [
    'المرضى بيحجزوا إزاي دلوقتي — تليفون ولا واتساب ولا دفتر؟',
    'فيه مرضى بيبدأوا خطة علاج وبيوقفوا في النص؟',
    'لما مريض مابيجيش جلسته، بتعرفوا قبلها ولا ساعتها؟',
    'مين بيرد على التليفون والرسايل؟',
  ],
  derma: [
    'أغلب الحجوزات بتيجي منين — إنستجرام؟ فيسبوك؟ تليفون؟',
    'فيه حد بيرد على الرسايل طول اليوم؟ وبالليل؟',
    'الباقات والجلسات بتتابعوها إزاي — مين خلّص ومين فاضله؟',
    'بتعملوا عروض للعملاء القدام؟',
  ],
  clinic: [
    'المرضى بيحجزوا إزاي دلوقتي؟',
    'التليفون بيرنّ كتير على سؤال المواعيد؟',
    'فيه غياب كتير في المواعيد؟ بتعملوا إيه فيه؟',
    'عندكم أكتر من فرع؟',
  ],
}

export const CALL_SCRIPT = {
  opener: (lead) =>
    `${salutation(lead)}، أنا ${SENDER_NAME} من بسهولة — نظام حجز مواعيد مصري للعيادات. معاك دقيقتين؟`,
  permission: 'لو الوقت مش مناسب قولّي أكلّمك إمتى، ولو مش مهتم خالص قولّي ومش هتصل تاني.',
  discovery: (lead) => DISCOVERY[lead?.category] ?? DISCOVERY.clinic,
  pitch: (angleKey) => SALES_ANGLES[angleKey]?.pitch ?? SALES_ANGLES.self_booking_24_7.pitch,
  objections: [
    {
      q: 'غالي / مش محتاجين نصرف',
      a: `الباقة بتبدأ من ${START_PRICE} جنيه في الشهر، ومفيش عمولة على أي حجز. لو ميعاد واحد بس في الشهر ماضاعش بسبب الغياب، غالباً غطّى الاشتراك. وجرّب 14 يوم الأول ببلاش من غير بطاقة.`,
    },
    {
      q: 'عندنا سكرتيرة بتعمل ده',
      a: 'ممتاز — بسهولة مش بديل للسكرتيرة، ده بيخفف عنها: بدل ما ترد على نفس السؤال طول اليوم، المريض يشوف المواعيد الفاضية ويحجز، وهي تتابع الجدول من شاشة واحدة وتبعت التذكيرات بضغطة.',
    },
    {
      q: 'بنستخدم فيزيتا / تطبيق تاني',
      a: 'تمام، ممكن تكمّلوا عليه. الفرق إن بسهولة اشتراك ثابت من غير عمولة على كل حجز، والصفحة باسمكم ولوجوكم، والمريض بيبقى مريضكم إنتوا. ممكن تحطوا لينك بسهولة جنبه وتقارنوا.',
    },
    {
      q: 'ابعتلي على الواتساب',
      a: 'أكيد — هبعتلك دلوقتي لينك صفحة معمولة باسم العيادة تتفرج عليها. إمتى أكلّمك أسمع رأيك؟ (حدد ميعاد واختار «كلّمني بعدين»)',
    },
    {
      q: 'مش فاضي دلوقتي',
      a: 'ولا يهمك — إمتى الوقت المناسب؟ بكرا الصبح ولا بعد العيادة؟ (حدد الميعاد في المتابعة)',
    },
    {
      q: 'التذكير ده أوتوماتيك؟',
      a: 'لأ، بضغطة زر منك — والسبب إن الرسالة بتطلع من رقم العيادة اللي المريض عارفه، فبيرد عليها. النظام بيجهّز رسايل كل مواعيد بكرا وإنت بتعدّي عليها، 10 مواعيد = دقيقة.',
    },
    {
      q: 'محتاج حسابات لموظفين / صلاحيات',
      a: 'لسه مش موجودة — الحساب حالياً لصاحب العيادة. لو ده مهم ليكم قولّي، بنبني على طلبات العملاء.',
    },
  ],
  close: [
    'أفعّلك التجربة دلوقتي وأنا معاك على التليفون؟ (افتح «صفحة تجريبية» وابعتله اللينك)',
    'أبعتلك لينك صفحتك تجرّبها وأكلّمك بكرا أسمع رأيك؟',
    'لو حابب، أجي أوريك على النظام في العيادة 10 دقايق.',
  ],
}

/** What to send a partner so they can share Beshola with clinics. */
export function partnerShareMessage(partner, link) {
  return `أهلاً ${partner.name} 👋\nده اللينك الخاص بيك لبسهولة: ${link}\nأي عيادة تسجّل منه وتشترك، بتاخد عمولتك ${partner.commission_egp ? `(${partner.commission_egp} جنيه)` : ''} — وأنا بتابعها لوحدي من النظام.`
}
