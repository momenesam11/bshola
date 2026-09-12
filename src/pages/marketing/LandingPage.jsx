import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  HiBars3,
  HiOutlineAcademicCap,
  HiOutlineBanknotes,
  HiOutlineBell,
  HiOutlineBolt,
  HiOutlineCalendarDays,
  HiOutlineChartBarSquare,
  HiOutlineCheck,
  HiOutlineClipboardDocumentList,
  HiOutlineHeart,
  HiOutlineRectangleGroup,
  HiOutlineScissors,
  HiOutlineUsers,
  HiXMark,
} from 'react-icons/hi2'
import { FaFacebook, FaInstagram, FaWhatsapp } from 'react-icons/fa'

import Seo from '../../components/seo/Seo'
import SiteLinks from '../../components/seo/SiteLinks'
import { IllustrativeNote, Section, SectionHead } from '../../components/marketing/Section'
import Reveal from '../../components/marketing/Reveal'
import BookingPhoneDemo from '../../components/marketing/BookingPhoneDemo'
import VideoSection from '../../components/marketing/VideoSection'
import ProductTour from '../../components/marketing/ProductTour'
import FeatureGroup from '../../components/marketing/FeatureGroup'
import ComparisonTable from '../../components/marketing/ComparisonTable'
import PricingCards from '../../components/marketing/PricingCards'
import FAQ from '../../components/marketing/FAQ'
import { FAQS } from '../../content/faqs'
import { LANDING_VIDEOS, LANDING_VIDEO_LIST } from '../../content/landingVideos'
import {
  faqSchema,
  organizationSchema,
  softwareApplicationSchema,
  videoObjectSchema,
  websiteSchema,
} from '../../lib/seo'
import { SUPPORT_EMAIL, SUPPORT_PHONE_DISPLAY, SUPPORT_WHATSAPP } from '../../lib/support'

/**
 * Landing page.
 *
 * Two rules govern this file:
 *
 * 1. Every claim on it is evidenced in MARKETING_CLAIMS.md against a file and
 *    line in this repo. No customer counts, no named businesses, no
 *    testimonials, no result percentages — none of those can be evidenced
 *    today. The word "تلقائي" never appears next to the WhatsApp reminder,
 *    because sending is a manual button press (src/lib/whatsapp.js:1), and the
 *    FAQ explains why rather than hiding it.
 *
 * 2. The visual system is a clinic register, not a SaaS card grid: hairline
 *    rules divide sections, features read down ruled rows, navy is the only
 *    heading colour, and teal is spent only on calls to action. The page's one
 *    orchestrated animation lives in BookingPhoneDemo and runs a single pass.
 */

// The verticals the onboarding actually offers (OnboardingFlow.jsx:107-114),
// each linked to its own SEO page (src/content/marketingPages.js).
const VERTICALS = [
  { label: 'عيادات', Icon: HiOutlineHeart, to: '/solutions/clinics' },
  { label: 'صالونات وباربر', Icon: HiOutlineScissors, to: '/solutions/salons' },
  { label: 'جيم ولياقة', Icon: HiOutlineBolt, to: '/solutions/gyms' },
  { label: 'تعليم وتدريس', Icon: HiOutlineAcademicCap, to: '/solutions/education' },
  { label: 'ملاعب ومرافق', Icon: HiOutlineRectangleGroup, to: '/solutions/courts' },
]

// Verified facts, standing in for the social proof we cannot evidence yet.
const FACTS = [
  { label: 'بدون عمولة على أي حجز', detail: 'اشتراك ثابت بالجنيه' },
  { label: 'عربي واتجاه RTL من الأساس', detail: 'مش ترجمة فوق واجهة إنجليزية' },
  { label: '14 يوم تجربة', detail: 'من غير بطاقة بنكية' },
]

const PROBLEMS = [
  {
    title: 'التليفون مش بيبطّل',
    desc: 'كل واحد بيتصل يسأل على أول موعد فاضي، والريسبشن بيرد على نفس السؤال طول اليوم بدل ما يقضي وقته مع اللي واقف قدامه.',
  },
  {
    title: 'الحجز بيضيع بين الرسائل',
    desc: 'العميل يبعت على الواتساب 11 بالليل، محدش يرد لحد الصبح، وساعتها يكون لقى مكان تاني أو نسي الموضوع خلاص.',
  },
  {
    title: 'دفتر المواعيد مش بيقولك حاجة',
    desc: 'مين مجاش الشهر ده؟ مين مجاش من شهرين ومحتاج تفتكره؟ أنهي خدمة جايبة أكبر دخل؟ مفيش مكان فيه الإجابة.',
  },
  {
    title: 'الغياب بيمر كأنه مش حاصل',
    desc: 'الموعد اللي صاحبه مجاش كان محجوز ومحدش تاني قدر يأخده — والخسارة دي مش مكتوبة في أي ورقة.',
  },
]

const FEATURE_GROUPS = [
  {
    title: 'الحجز والمواعيد',
    Icon: HiOutlineCalendarDays,
    items: [
      {
        title: 'صفحة حجز برابط خاص بيك',
        desc: 'رابط تحطه في البايو أو في إعلانك أو في حالة الواتساب. العميل يفتحه من أي متصفح ويحجز في 3 خطوات — من غير تطبيق ومن غير ما يعمل حساب.',
      },
      {
        title: 'قائمة انتظار',
        desc: 'لو كل المواعيد محجوزة، العميل يسجّل نفسه. وأول ما حجز يتلغي، النظام يوريك مين مستني وتبلّغه بضغطة زر.',
      },
      {
        title: 'كاليندر يوم وأسبوع وشهر',
        desc: 'نفس المواعيد بتلاتة عروض، وكل موعد بحالته: مؤكد، مكتمل، لم يحضر، ملغي.',
      },
      {
        title: 'قائمة مواعيد بفلاتر',
        desc: 'فلتر على الحالة أو مدى تاريخ أو فرع أو خدمة، لما تدوّر على حاجة بعينها.',
      },
      {
        title: 'الحجز المزدوج ممنوع من قاعدة البيانات',
        desc: 'المنع مش في الواجهة بس — فيه قفل على مستوى قاعدة البيانات، فحتى لو اتنين ضغطوا تأكيد في نفس اللحظة، واحد بس هو اللي بياخد الموعد.',
      },
      {
        title: 'إشعار فوري بكل حجز',
        desc: 'أول ما حجز يدخل أو يتلغي أو حد يسجّل في قائمة الانتظار، يجيلك إشعار بصوت في النظام على طول.',
      },
    ],
  },
  {
    title: 'تذكير الواتساب',
    Icon: HiOutlineBell,
    note: 'الإرسال بضغطة زر من رقمك — مش تلقائي، ودي حاجة مقصودة مشروحة في الأسئلة تحت.',
    items: [
      {
        title: 'قائمة «تذكيرات بكرا»',
        desc: 'في آخر اليوم تفتح القائمة فتلاقي كل اللي عندهم مواعيد بكرا. النظام يمشّيك عليهم واحد واحد، وكل واحد ضغطة زر تفتح واتساب برسالته جاهزة.',
      },
      {
        title: 'الرسالة بتتكتب لوحدها',
        desc: 'اسم العميل والخدمة والتاريخ والساعة والفرع، وبتطلب منه يرد لو محتاج يغيّر أو يلغي. وتقدر تعدّل صيغتها من الإعدادات بمتغيرات جاهزة.',
      },
      {
        title: 'بتطلع من رقمك المعروف',
        desc: 'العميل يشوف اسم عيادتك في الواتساب، مش رقم غريب — فبيقرأها وبيرد عليها.',
      },
      {
        title: 'النظام يسجّل مين اتبعتله',
        desc: 'كل تذكير اتبعت بيتعلّم عليه، فالتقارير تعرف تحسب اللي اتوفّر بالتذكير مقابل اللي ضاع بالغياب.',
      },
      {
        title: 'رسالة تأكيد جاهزة برضه',
        desc: 'بعد الحجز فيه رسالة تأكيد مجهزة بنفس الطريقة، ورسالة جاهزة لصاحب أول دور في قائمة الانتظار.',
      },
      {
        title: 'بدون تكلفة رسائل',
        desc: 'مفيش رصيد SMS ومفيش رسوم لكل رسالة — واتسابك العادي أو الـBusiness بيعمل الشغل.',
      },
    ],
  },
  {
    title: 'متابعة العملاء والفلوس',
    Icon: HiOutlineUsers,
    items: [
      {
        title: 'تصنيف بيتحدّث لوحده',
        desc: 'كل عميل بياخد تصنيف على آخر زيارة: منتظم لحد 30 يوم، فاتر من 31 لـ60، ضايع بعد 60 يوم. بتفتح الصفحة فتعرف على طول مين اللي بيقل.',
      },
      {
        title: 'حملة إعادة استهداف',
        desc: 'تختار الفاترين أو الضايعين، تكتب رسالة عرض بيتحط فيها اسم العميل ورابط حجزك، تشوف معاينتها، وتبعتها للقائمة كلها.',
      },
      {
        title: 'ملف العميل',
        desc: 'كل زياراته وخدماته وتاريخ آخر مرة جه فيها، وملاحظاتك عليه — بتفتح الملف فتتكلم معاه وانت عارف السياق.',
      },
      {
        title: 'كشف حساب',
        desc: 'تسجّل المدفوعات وطريقة الدفع والمستحقات، والنظام يحسب الرصيد: عليه كام ولا له كام.',
      },
      {
        title: 'خطة زيارات',
        desc: 'للعلاج أو الكورس اللي على أكتر من جلسة: تحدد عدد الزيارات والنظام يتابع اللي خلص واللي فاضل.',
      },
    ],
  },
  {
    title: 'الملف الطبي والتقارير',
    Icon: HiOutlineClipboardDocumentList,
    note: 'الملف الطبي والروشتة بيظهروا للعيادات بس. باقي الأنشطة بتاخد ملف عميل مبسّط.',
    items: [
      {
        title: 'ملف مريض كامل',
        desc: 'بيانات أساسية، جهة طوارئ، فصيلة دم، حساسية، أمراض مزمنة، وأدوية حالية — بيتحفظوا وانت بتكتب.',
      },
      {
        title: 'تشخيص لكل زيارة',
        desc: 'تسجّل تشخيص الزيارة وملاحظاتك وموعد المتابعة، وبيتراكم كتاريخ للمريض تفتحه في أي وقت.',
      },
      {
        title: 'روشتة تطبعها فوراً',
        desc: 'اسم الدواء والجرعة والتكرار والمدة وملاحظات لكل دواء، وتعليمات عامة — وزر طباعة بعربي مظبوط.',
      },
      {
        title: 'مرفقات أشعة وتحاليل',
        desc: 'ترفع صور الأشعة والتحاليل والتقارير على ملف المريض، وتفتحها من أي جهاز.',
      },
      {
        title: 'تقارير ومعدل حضور',
        desc: 'إجمالي المواعيد والحضور والغياب ومعدل الحضور، على أي مدى تاريخ تختاره.',
      },
      {
        title: 'كارت خسارة الشهر',
        desc: 'قيمة الغياب بالجنيه محسوبة بمتوسط سعر خدماتك، جنب اللي اتوفّر بالتذكير — رقم واحد بيقولك النظام عمل إيه.',
      },
      {
        title: 'تصدير CSV وطباعة',
        desc: 'تنزّل مواعيدك ملف CSV يفتح في الإكسل، أو تطبع تقرير بتنسيق عربي صحيح.',
      },
    ],
  },
]

// A compact summary under the tour video; the deep list lives in #features.
const TOUR_HIGHLIGHTS = [
  { label: 'كاليندر يوم وأسبوع وشهر', Icon: HiOutlineCalendarDays },
  { label: 'تذكيرات بكرا بضغطة زر', Icon: HiOutlineBell },
  { label: 'تصنيف العملاء لوحده', Icon: HiOutlineUsers },
  { label: 'كشف حساب لكل عميل', Icon: HiOutlineBanknotes },
  { label: 'ملف طبي وروشتة للعيادات', Icon: HiOutlineClipboardDocumentList },
  { label: 'تقارير وكارت خسارة الشهر', Icon: HiOutlineChartBarSquare },
]

const NAV_LINKS = [
  { href: '#how-patients-book', label: 'إزاي بيشتغل' },
  { href: '#features', label: 'المميزات' },
  { href: '#pricing', label: 'الأسعار' },
  { href: '#faq', label: 'أسئلة' },
]

function Nav() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-50 transition-colors ${
        scrolled ? 'bg-ink/95 backdrop-blur border-b border-white/10' : 'bg-ink'
      }`}
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="h-16 flex items-center justify-between gap-4">
          <Link
            to="/"
            className="text-[22px] font-bold text-white tracking-tight focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-400"
          >
            بسهولة
          </Link>

          <nav aria-label="أقسام الصفحة" className="hidden md:flex items-center gap-7">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-[13.5px] font-medium text-white/75 hover:text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-400"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-4">
            <Link
              to="/login"
              className="text-[13.5px] font-medium text-white/80 hover:text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-400"
            >
              دخول
            </Link>
            <Link
              to="/register"
              className="bg-accent-500 hover:bg-accent-600 text-white text-[13.5px] font-bold px-5 py-2.5 rounded-xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              ابدأ مجاناً
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'إغلاق القائمة' : 'فتح القائمة'}
            className="md:hidden p-2 -mr-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400"
          >
            {open ? <HiXMark className="w-6 h-6" /> : <HiBars3 className="w-6 h-6" />}
          </button>
        </div>
      </div>

      <div className="md:hidden border-t border-white/10 bg-ink" hidden={!open}>
        <nav aria-label="أقسام الصفحة" className="max-w-6xl mx-auto px-5 py-4 flex flex-col gap-1">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="py-3 text-[15px] font-medium text-white/85 border-b border-white/10"
            >
              {link.label}
            </a>
          ))}
          <div className="flex gap-3 pt-4">
            <Link
              to="/login"
              className="flex-1 text-center py-3 text-[14px] font-semibold text-white border border-white/25 rounded-xl"
            >
              دخول
            </Link>
            <Link
              to="/register"
              className="flex-1 text-center py-3 text-[14px] font-bold text-white bg-accent-500 rounded-xl"
            >
              ابدأ مجاناً
            </Link>
          </div>
        </nav>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section className="bg-ink text-white">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-12 sm:py-16 lg:py-20">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-8 items-center">
          {/* Entrance is a quick, one-time stagger on load (not scroll-triggered
              — this is above the fold) using the fadeIn keyframe already
              defined in tailwind.config.js. motion-reduce drops it to a plain
              instant render. */}
          <div className="lg:col-span-7">
            <h1 className="animate-fadeIn motion-reduce:animate-none text-[28px] sm:text-[38px] lg:text-[44px] font-extrabold leading-[1.18] tracking-[-0.01em] text-balance">
              نظام حجز مواعيد عربي، ومرضاك يحجزوا بنفسهم من لينك واحد
            </h1>

            <p
              className="animate-fadeIn motion-reduce:animate-none [animation-delay:90ms] [animation-fill-mode:backwards] mt-5 text-[15.5px] sm:text-[17px] leading-[1.85] text-white/75 max-w-[58ch]"
            >
              وقت الريسبشن كله بيضيع في تأكيد مواعيد على التليفون والواتساب. بسهولة ينقل ده
              لصفحة حجز شغالة 24 ساعة، ويجهّزلك تذكير كل مواعيد بكرا تبعته بضغطة زر.
            </p>

            <div
              className="animate-fadeIn motion-reduce:animate-none [animation-delay:170ms] [animation-fill-mode:backwards] mt-8 flex flex-col sm:flex-row gap-3"
            >
              <Link
                to="/register"
                className="inline-flex items-center justify-center bg-accent-500 hover:bg-accent-600 text-white text-[15px] font-bold px-7 py-4 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] motion-reduce:hover:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                ابدأ تجربتك المجانية
              </Link>
              <a
                href="#how-patients-book"
                className="inline-flex items-center justify-center border border-white/25 hover:border-white/60 text-white text-[15px] font-semibold px-7 py-4 rounded-xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400"
              >
                شوف إزاي بيشتغل
              </a>
            </div>

            <p
              className="animate-fadeIn motion-reduce:animate-none [animation-delay:230ms] [animation-fill-mode:backwards] mt-4 text-[13px] text-white/55"
            >
              من غير بطاقة بنكية · الإلغاء في أي وقت · مفيش عمولة على حجوزاتك
            </p>
          </div>

          <div className="animate-fadeIn motion-reduce:animate-none [animation-delay:140ms] [animation-fill-mode:backwards] lg:col-span-5">
            <BookingPhoneDemo />
            <p className="mt-4 text-center text-[11.5px] text-white/45 leading-relaxed max-w-[280px] mx-auto">
              دي صفحة الحجز الحقيقية زي ما عميلك بيشوفها · الأسماء والأسعار للعرض بس
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function TrustStrip() {
  return (
    <section className="bg-white border-t border-rule" aria-label="لمين النظام وإيه اللي يميزه">
      {/* Two full-width rows rather than two half-width columns: at 1024–1280px
          the halves squeezed the five vertical chips into two ragged rows and
          wrapped every fact onto three lines. */}
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 sm:py-10">
        <div className="space-y-7">
          <div>
            <p className="text-[12.5px] font-semibold text-ink-soft mb-3.5">
              مبني للأنشطة اللي شغالة بمواعيد
            </p>
            <ul className="flex flex-wrap gap-2">
              {VERTICALS.map((v, i) => (
                <Reveal as="li" key={v.label} delay={i * 60}>
                  <Link
                    to={v.to}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-rule text-[13px] font-semibold text-ink transition-all hover:border-ink/30 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    <v.Icon className="w-4 h-4 text-accent-600" aria-hidden="true" />
                    {v.label}
                  </Link>
                </Reveal>
              ))}
            </ul>
          </div>

          <div className="pt-6 border-t border-rule">
            <ul className="grid sm:grid-cols-3 gap-x-10 gap-y-4">
              {FACTS.map((fact, i) => (
                <Reveal as="li" key={fact.label} delay={i * 90} className="flex items-start gap-2">
                  <HiOutlineCheck
                    className="w-4 h-4 text-accent-600 flex-shrink-0 mt-[3px]"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-[13.5px] font-bold text-ink leading-snug">{fact.label}</p>
                    <p className="text-[12px] text-ink-soft mt-0.5">{fact.detail}</p>
                  </div>
                </Reveal>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

function Problem() {
  return (
    <Section id="problem" tone="paper">
      <SectionHead title="اليوم بيمشي كده دلوقتي" />

      <div className="mt-8 grid lg:grid-cols-12 gap-10">
        <div className="lg:col-span-7">
          <div className="border-t border-rule">
            {PROBLEMS.map((problem, i) => (
              <Reveal key={problem.title} delay={i * 90} className="py-5 border-b border-rule">
                <h3 className="text-[15.5px] font-bold text-ink">{problem.title}</h3>
                <p className="mt-1.5 text-[14.5px] leading-[1.8] text-ink-soft max-w-[62ch]">
                  {problem.desc}
                </p>
              </Reveal>
            ))}
          </div>

        </div>

        {/* The product's own loss card, with the numbers labelled as an example */}
        <Reveal as="div" delay={150} className="lg:col-span-5">
          <div className="rounded-2xl border border-rule overflow-hidden bg-white" dir="rtl">
            <div className="px-5 py-3 border-b border-rule bg-paper flex items-center justify-between gap-3">
              <p className="text-[12px] font-bold text-ink">كارت خسارة الشهر</p>
              <span className="text-[10.5px] font-bold text-ink-soft bg-white border border-rule px-2 py-1 rounded-md">
                مثال توضيحي
              </span>
            </div>
            <div className="grid grid-cols-2">
              <div className="bg-red-50 px-5 py-5 border-l border-red-100">
                <p className="text-[11px] font-bold text-red-600">خسرت هذا الشهر</p>
                <p className="text-[28px] font-bold text-red-600 tabular-nums leading-tight mt-1.5">
                  3,300
                </p>
                <p className="text-[11px] text-red-500/80">جنيه · من 11 غياب</p>
              </div>
              <div className="bg-accent-50 px-5 py-5">
                <p className="text-[11px] font-bold text-accent-700">وفّرت بالتذكير</p>
                <p className="text-[28px] font-bold text-accent-700 tabular-nums leading-tight mt-1.5">
                  32,700
                </p>
                <p className="text-[11px] text-accent-600/80">جنيه · من 109 تذكير</p>
              </div>
            </div>
          </div>
          <IllustrativeNote className="mt-3">
            الأرقام دي مثال ومش بيانات أي عميل. النظام بيحسبها من مواعيدك ومتوسط سعر خدماتك
            انت، وبتلاقيها في صفحة التقارير.
          </IllustrativeNote>
        </Reveal>
      </div>

      {/* The cost line closes the section across its full width — as a column
          it left a large empty band beside the shorter loss card. */}
      <Reveal
        delay={250}
        className="mt-12 pt-8 border-t border-rule text-[19px] sm:text-[22px] font-bold text-ink leading-[1.6] max-w-[44ch]"
      >
        كل مريض ما جاش = كشف ضايع ووقت ضايع.
      </Reveal>
    </Section>
  )
}

function TourHighlights() {
  return (
    <div className="mt-10 pt-8 border-t border-rule">
      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3">
        {TOUR_HIGHLIGHTS.map((item) => (
          <li key={item.label} className="flex items-center gap-2.5">
            <item.Icon className="w-4 h-4 text-accent-600 flex-shrink-0" aria-hidden="true" />
            <span className="text-[13.5px] font-semibold text-ink">{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function FinalCta() {
  return (
    <section className="bg-ink-deep text-white border-t border-white/10">
      <Reveal className="max-w-6xl mx-auto px-5 sm:px-8 py-16 sm:py-20 text-center">
        <h2 className="text-[24px] sm:text-[32px] font-bold leading-[1.3] text-balance max-w-[34ch] mx-auto">
          جرّبه 14 يوم على مواعيدك الحقيقية
        </h2>
        <p className="mt-4 text-[15px] leading-[1.85] text-white/70 max-w-[52ch] mx-auto">
          الإعداد 6 خطوات، وفي آخرها يبقى معاك رابط حجز شغال تبعته لعملاءك. من غير بطاقة
          بنكية، ومن غير أي التزام.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/register"
            className="inline-flex items-center justify-center bg-accent-500 hover:bg-accent-600 text-white text-[15px] font-bold px-8 py-4 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] motion-reduce:hover:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            ابدأ تجربتك المجانية
          </Link>
          <a
            href={`https://wa.me/${SUPPORT_WHATSAPP}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 border border-white/25 hover:border-white/60 text-white text-[15px] font-semibold px-8 py-4 rounded-xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400"
          >
            <FaWhatsapp className="w-5 h-5 text-accent-400" aria-hidden="true" />
            اسألنا على واتساب
          </a>
        </div>
      </Reveal>
    </section>
  )
}

function Footer() {
  return (
    <footer className="bg-ink-deep text-white border-t border-white/10">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-14">
        <SiteLinks />

        <div className="mt-12 pt-8 border-t border-white/10 grid sm:grid-cols-2 gap-8 items-start">
          <div>
            <p className="text-[19px] font-bold">بسهولة</p>
            <p className="mt-1.5 text-[13px] text-white/60 leading-relaxed max-w-[42ch]">
              نظام حجز مواعيد وإدارة عملاء للأنشطة اللي شغالة بمواعيد. اشتراك ثابت، بدون عمولة.
            </p>
            <ul className="mt-4 flex items-center gap-2.5">
              <li>
                <a
                  href="https://www.facebook.com/beshola"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="بسهولة على فيسبوك"
                  className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400"
                >
                  <FaFacebook className="w-4 h-4" aria-hidden="true" />
                </a>
              </li>
              <li>
                <a
                  href="https://www.instagram.com/beshola.co"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="بسهولة على إنستجرام"
                  className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400"
                >
                  <FaInstagram className="w-4 h-4" aria-hidden="true" />
                </a>
              </li>
              <li>
                <a
                  href={`https://wa.me/${SUPPORT_WHATSAPP}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="دعم بسهولة على واتساب"
                  className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400"
                >
                  <FaWhatsapp className="w-4 h-4" aria-hidden="true" />
                </a>
              </li>
            </ul>
          </div>

          <div className="sm:text-left">
            <p className="text-[12.5px] font-bold text-white/80 mb-3">الدعم والتواصل</p>
            <ul className="space-y-2 text-[13px]">
              <li>
                <a
                  href={`https://wa.me/${SUPPORT_WHATSAPP}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/70 hover:text-white transition-colors tabular-nums"
                  dir="ltr"
                >
                  {SUPPORT_PHONE_DISPLAY}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="text-white/70 hover:text-white transition-colors"
                  dir="ltr"
                >
                  {SUPPORT_EMAIL}
                </a>
              </li>
              <li>
                <Link to="/privacy" className="text-white/70 hover:text-white transition-colors">
                  سياسة الخصوصية
                </Link>
              </li>
              <li>
                <Link to="/terms" className="text-white/70 hover:text-white transition-colors">
                  الشروط والأحكام
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <p className="mt-10 pt-6 border-t border-white/10 text-[12px] text-white/45 tabular-nums">
          © {new Date().getFullYear()} بسهولة · نظام حجز مواعيد وإدارة عملاء
        </p>
      </div>
    </footer>
  )
}

export default function LandingPage() {
  const videoSchemas = LANDING_VIDEO_LIST.map((video) =>
    videoObjectSchema({
      name: video.title,
      description: video.lead,
      thumbnailUrl: video.poster,
      contentUrl: video.src,
      uploadDate: video.uploadDate,
      duration: video.duration,
    })
  )

  return (
    <div className="min-h-screen bg-paper text-ink font-sans antialiased" dir="rtl">
      <Seo
        title="بسهولة — نظام حجز مواعيد وإدارة عملاء للعيادات والصالونات"
        description="نظام حجز مواعيد عربي بالكامل: صفحة حجز برابط خاص بيك، قائمة انتظار، تذكير واتساب من رقمك، ملف عميل وتقارير. اشتراك ثابت بدون عمولة و14 يوم تجربة بدون بطاقة بنكية."
        path="/"
        schemas={[
          organizationSchema(),
          websiteSchema(),
          softwareApplicationSchema(),
          faqSchema(FAQS),
          ...videoSchemas,
        ]}
      />

      <Nav />

      <main>
        <Hero />
        <TrustStrip />
        <Problem />

        <VideoSection
          id={LANDING_VIDEOS.booking.id}
          tone="surface"
          title={LANDING_VIDEOS.booking.title}
          lead={LANDING_VIDEOS.booking.lead}
          src={LANDING_VIDEOS.booking.src}
          poster={LANDING_VIDEOS.booking.poster}
          expectedSrc={LANDING_VIDEOS.booking.expectedSrc}
          captionsSrc={LANDING_VIDEOS.booking.captionsSrc}
          stepsTitle={LANDING_VIDEOS.booking.stepsTitle}
          steps={LANDING_VIDEOS.booking.steps}
          cta={{
            href: '#tour',
            label: 'شوف صفحة الحجز بنفسك',
            note: 'واجهة الحجز الحقيقية موجودة جوه جولة النظام تحت.',
          }}
        />

        <VideoSection
          id={LANDING_VIDEOS.signup.id}
          tone="paper"
          title={LANDING_VIDEOS.signup.title}
          lead={LANDING_VIDEOS.signup.lead}
          src={LANDING_VIDEOS.signup.src}
          poster={LANDING_VIDEOS.signup.poster}
          expectedSrc={LANDING_VIDEOS.signup.expectedSrc}
          captionsSrc={LANDING_VIDEOS.signup.captionsSrc}
          stepsTitle={LANDING_VIDEOS.signup.stepsTitle}
          steps={LANDING_VIDEOS.signup.steps}
          cta={LANDING_VIDEOS.signup.cta}
        />

        <VideoSection
          id={LANDING_VIDEOS.tour.id}
          tone="surface"
          title={LANDING_VIDEOS.tour.title}
          lead={LANDING_VIDEOS.tour.lead}
          src={LANDING_VIDEOS.tour.src}
          poster={LANDING_VIDEOS.tour.poster}
          expectedSrc={LANDING_VIDEOS.tour.expectedSrc}
          captionsSrc={LANDING_VIDEOS.tour.captionsSrc}
          stepsTitle={LANDING_VIDEOS.tour.stepsTitle}
          steps={LANDING_VIDEOS.tour.steps}
        >
          <TourHighlights />
        </VideoSection>

        <ProductTour id="tour" />

        <Section id="features" tone="surface">
          <SectionHead
            title="المميزات بالتفصيل"
            lead="كل سطر تحت موجود في النظام دلوقتي. واللي مش موجود مكتوب صريح في جدول المقارنة وفي الأسئلة."
          />
          <div className="mt-10">
            {FEATURE_GROUPS.map((group) => (
              <FeatureGroup key={group.title} {...group} />
            ))}
          </div>
        </Section>

        <ComparisonTable id="compare" />
        <PricingCards id="pricing" />
        <FAQ id="faq" />
        <FinalCta />
      </main>

      <Footer />
    </div>
  )
}
