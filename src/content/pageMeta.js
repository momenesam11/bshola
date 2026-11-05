// Title/description for the hand-built public pages (the keyword pages carry
// theirs in marketingPages.js, the legal pages in legalPages.js).
//
// Kept outside the page components so scripts/prerender-meta.mjs can write the
// same values into each route's static HTML that Seo.jsx renders at runtime —
// crawlers that don't run JS (WhatsApp/Facebook previews) see only the former.

export const HOME_META = {
  path: '/',
  title: 'بسهولة — نظام حجز مواعيد وإدارة عملاء للعيادات والصالونات',
  description:
    'نظام حجز مواعيد عربي بالكامل: صفحة حجز برابط خاص بيك، قائمة انتظار، تذكير واتساب من رقمك، ملف عميل وتقارير. اشتراك ثابت بدون عمولة و14 يوم تجربة بدون بطاقة بنكية.',
}

export const PRODUCT_META = {
  path: '/product',
  title: 'المنتج — جولة في نظام بسهولة ومقارنة بالبدائل',
  description:
    'جولة تفاعلية في نظام بسهولة: الحجز والمواعيد، تذكير الواتساب، متابعة العملاء، الملف الطبي، التقارير — ومقارنة صريحة بمنصات الحجز العالمية.',
}

export const FAQ_META = {
  path: '/faq',
  title: 'الأسئلة الشائعة عن بسهولة',
  description:
    'إجابات مباشرة: إزاي تعمل حساب، هل التذكير تلقائي، فيه عمولة، بياناتك آمنة إزاي، ولو وقفت الاشتراك بياناتك بتروح فين.',
}

export const CALCULATOR_META = {
  path: '/tools/no-show-calculator',
  title: 'حاسبة خسارة الغياب في العيادة — عيادتك بتخسر كام؟',
  description:
    'احسب عيادتك بتخسر كام جنيه في الشهر من المواعيد اللي أصحابها مابيجوش: حط عدد المواعيد ونسبة الغياب وسعر الكشف واعرف الرقم في ثانية.',
}
