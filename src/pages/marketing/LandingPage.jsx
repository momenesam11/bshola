import { Link } from 'react-router-dom'
import { HiOutlineAcademicCap, HiOutlineArrowLeft, HiOutlineArrowTopRightOnSquare, HiOutlineBellAlert, HiOutlineBookOpen, HiOutlineChatBubbleLeftEllipsis, HiOutlineChatBubbleLeftRight, HiOutlineCheck, HiOutlineClipboardDocumentCheck, HiOutlineExclamationTriangle, HiOutlineGlobeAlt, HiOutlinePhoneArrowDownLeft, HiOutlineUserMinus, HiOutlineWrenchScrewdriver } from 'react-icons/hi2'
import { FaWhatsapp } from 'react-icons/fa'

import Seo from '../../components/seo/Seo'
import { HOME_META } from '../../content/pageMeta'
import Nav from '../../components/marketing/Nav'
import Footer from '../../components/marketing/Footer'
import FinalCta from '../../components/marketing/FinalCta'
import { IllustrativeNote, Section, SectionHead } from '../../components/marketing/Section'
import Reveal from '../../components/marketing/Reveal'
import CountUp from '../../components/marketing/CountUp'
import BookingPhoneDemo from '../../components/marketing/BookingPhoneDemo'
import VideoSection from '../../components/marketing/VideoSection'
import FeatureTeaser from '../../components/marketing/FeatureTeaser'
import PricingCards from '../../components/marketing/PricingCards'
import FAQ from '../../components/marketing/FAQ'
import { FAQS } from '../../content/faqs'
import { GUIDES } from '../../content/guides'
import { VERTICALS } from '../../content/verticals'
import { LANDING_VIDEOS } from '../../content/landingVideos'
import {
  faqSchema,
  organizationSchema,
  softwareApplicationSchema,
  REGIONAL_ALTERNATES,
  videoObjectSchema,
  websiteSchema,
} from '../../lib/seo'
import { DEMO_BOOKING_PATH, SUPPORT_WHATSAPP } from '../../lib/support'
import { useVisitorPricing } from '../../hooks/useVisitorPricing'

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
 * 2. Beshola's identity (navy, teal, Cairo) with a different visual idea per
 *    section, so scrolling never feels like the same block repeated. Text stays
 *    in the HTML as text; shapes and motion are decoration on top of it.
 *
 * This page is intentionally the *short* entry point: the deep feature
 * breakdown, the interactive tour, the two other explainer videos, and the
 * category comparison live on /product (ProductPage.jsx); the full FAQ list
 * lives on /faq (FaqPage.jsx). Nav, Footer and FinalCta are shared components
 * so every page keeps the same header/footer/closing CTA.
 */

const HOME_FAQ_COUNT = 4

// Verified facts, standing in for the social proof we cannot evidence yet.
const FACTS = [
  { label: 'بدون عمولة على أي حجز', detail: 'اشتراك ثابت بالجنيه' },
  { label: 'عربي واتجاه RTL من الأساس', detail: 'مش ترجمة فوق واجهة إنجليزية' },
  { label: '14 يوم تجربة', detail: 'من غير بطاقة بنكية' },
  { label: 'تدريب ودعم وصيانة', detail: 'من غير رسوم زيادة' },
]

const INCLUDED_SERVICE = [
  { Icon: HiOutlineAcademicCap, title: 'تدريب مجاني', desc: 'بنعلّمك إنت والموظفة النظام خطوة بخطوة لحد ما تبدأوا تشتغلوا عليه.' },
  { Icon: HiOutlineChatBubbleLeftRight, title: 'دعم فني', desc: 'عندك سؤال أو مشكلة؟ كلمنا على واتساب أو التليفون، بالعامية ومن غير تذاكر.' },
  { Icon: HiOutlineWrenchScrewdriver, title: 'صيانة وتحديثات', desc: 'الصيانة والتحديثات علينا، وكل جديد بيوصلك من غير رسوم زيادة.' },
]

const PROBLEMS = [
  {
    Icon: HiOutlinePhoneArrowDownLeft,
    title: 'التليفون مش بيبطّل',
    desc: 'كل واحد بيتصل يسأل على أول موعد فاضي، والريسبشن بيرد على نفس السؤال طول اليوم بدل ما يقضي وقته مع اللي واقف قدامه.',
  },
  {
    Icon: HiOutlineChatBubbleLeftEllipsis,
    title: 'الحجز بيضيع بين الرسائل',
    desc: 'العميل يبعت على الواتساب 11 بالليل، محدش يرد لحد الصبح، وساعتها يكون لقى مكان تاني أو نسي الموضوع خلاص.',
  },
  {
    Icon: HiOutlineBookOpen,
    title: 'دفتر المواعيد مش بيقولك حاجة',
    desc: 'مين مجاش الشهر ده؟ مين مجاش من شهرين ومحتاج تفتكره؟ أنهي خدمة جايبة أكبر دخل؟ مفيش مكان فيه الإجابة.',
  },
  {
    Icon: HiOutlineUserMinus,
    title: 'الغياب بيمر كأنه مش حاصل',
    desc: 'الموعد اللي صاحبه مجاش كان محجوز ومحدش تاني قدر يأخده — والخسارة دي مش مكتوبة في أي ورقة.',
  },
]

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
              برنامج حجز مواعيد وإدارة عيادات، ومرضاك يحجزوا بنفسهم من لينك واحد
            </h1>

            <p className="animate-fadeIn motion-reduce:animate-none [animation-delay:90ms] [animation-fill-mode:backwards] mt-5 text-[15.5px] sm:text-[17px] leading-[1.85] text-white/90 max-w-[58ch]">
              وقت الريسبشن كله بيضيع في تأكيد مواعيد على التليفون والواتساب. بسهولة ينقل ده لصفحة
              حجز باسم عيادتك شغالة 24 ساعة، ويجهّزلك تذكير كل مواعيد بكرا تبعته بضغطة زر من رقمك،
              ومعاه ملف لكل مريض. وبيشتغل كمان للصالونات والجيم وأي نشاط بمواعيد.
            </p>

            <div className="animate-fadeIn motion-reduce:animate-none [animation-delay:170ms] [animation-fill-mode:backwards] mt-8 flex flex-col sm:flex-row gap-3">
              <Link
                to="/register"
                className="inline-flex items-center justify-center bg-accent-500 hover:bg-accent-600 text-white text-[15px] font-bold px-7 py-4 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] motion-reduce:hover:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                ابدأ تجربتك المجانية
              </Link>
              <a
                href={DEMO_BOOKING_PATH}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center justify-center gap-2 border border-white/25 hover:border-white/60 text-white text-[15px] font-semibold px-7 py-4 rounded-xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400"
              >
                جرّب الحجز بنفسك
                <HiOutlineArrowTopRightOnSquare className="w-4 h-4" aria-hidden="true" />
              </a>
            </div>

            <p className="animate-fadeIn motion-reduce:animate-none [animation-delay:230ms] [animation-fill-mode:backwards] mt-4 text-[13px] text-white/70">
              من غير بطاقة بنكية · الإلغاء في أي وقت · مفيش عمولة على حجوزاتك
            </p>
          </div>

          <div className="animate-fadeIn motion-reduce:animate-none [animation-delay:140ms] [animation-fill-mode:backwards] lg:col-span-5">
            <BookingPhoneDemo />
            <p className="mt-4 text-center text-[11.5px] text-white/45 leading-relaxed max-w-[280px] mx-auto">
              دي صفحة الحجز الحقيقية زي ما عميلك بيشوفها · الأسماء والأسعار للعرض بس ·{' '}
              <a href="#how-patients-book" className="underline hover:text-white">شوف إزاي بيشتغل</a>
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function TrustStrip() {
  const { t } = useVisitorPricing()
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
            <ul className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-10 gap-y-4">
              {FACTS.map((fact, i) => (
                <Reveal as="li" key={fact.label} delay={i * 90} className="flex items-start gap-2">
                  <HiOutlineCheck
                    className="w-4 h-4 text-accent-600 flex-shrink-0 mt-[3px]"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-[13.5px] font-bold text-ink leading-snug">{fact.label}</p>
                    <p className="text-[12px] text-ink-soft mt-0.5">{t(fact.detail)}</p>
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
  const { t } = useVisitorPricing()
  return (
    <Section id="problem" tone="paper">
      <SectionHead title="اليوم بيمشي كده دلوقتي" />

      <div className="mt-8 grid lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 grid sm:grid-cols-2 gap-4">
          {PROBLEMS.map((problem, i) => (
            <Reveal key={problem.title} delay={i * 90} className="h-full">
              <div className="group h-full rounded-2xl bg-white border border-rule p-5 transition-all duration-300 hover:-translate-y-1 hover:border-red-200 hover:shadow-lg motion-reduce:hover:translate-y-0">
                <span className="w-11 h-11 rounded-xl bg-red-50 text-red-600 flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6 motion-reduce:transform-none">
                  <problem.Icon className="w-6 h-6" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-[16.5px] font-bold text-ink">{problem.title}</h3>
                <p className="mt-2 text-[14.5px] leading-[1.8] text-ink-soft">{problem.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* The product's own loss card, with the numbers labelled as an example */}
        <Reveal as="div" delay={150} className="lg:col-span-5 lg:sticky lg:top-24">
          <div className="rounded-3xl overflow-hidden bg-ink text-white shadow-2xl" dir="rtl">
            <div className="px-6 py-4 flex items-center justify-between gap-3 border-b border-white/10">
              <p className="text-[14px] font-bold">كارت خسارة الشهر</p>
              <span className="text-[12px] font-bold text-ink bg-white px-2.5 py-1 rounded-full">
                مثال توضيحي
              </span>
            </div>
            <div className="p-5 space-y-3">
              <div className="rounded-2xl bg-red-500/15 border border-red-400/30 p-5">
                <p className="text-[13px] font-bold text-red-200">خسرت هذا الشهر</p>
                <p className="text-[42px] font-extrabold text-white tabular-nums leading-tight mt-1">
                  <CountUp value={3300} />
                </p>
                <p className="text-[13px] text-red-100/90">{t('جنيه')} · من 11 غياب</p>
              </div>
              <div className="rounded-2xl bg-accent-500/20 border border-accent-400/30 p-5">
                <p className="text-[13px] font-bold text-accent-200">وفّرت بالتذكير</p>
                <p className="text-[42px] font-extrabold text-white tabular-nums leading-tight mt-1">
                  <CountUp value={32700} />
                </p>
                <p className="text-[13px] text-accent-100/90">{t('جنيه')} · من 109 تذكير</p>
              </div>
            </div>
          </div>
          <IllustrativeNote className="mt-3 !text-[12.5px] !text-ink-soft">
            الأرقام دي مثال ومش بيانات أي عميل. النظام بيحسبها من مواعيدك ومتوسط سعر خدماتك
            انت، وبتلاقيها في صفحة التقارير.
          </IllustrativeNote>
        </Reveal>
      </div>

      <Reveal delay={250} className="mt-8">
        <div className="relative overflow-hidden rounded-3xl bg-red-50 border border-red-200 px-6 py-6 sm:px-8 flex items-center gap-4">
          <span className="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center flex-shrink-0">
            <HiOutlineExclamationTriangle className="w-6 h-6" aria-hidden="true" />
          </span>
          <p className="text-[20px] sm:text-[26px] font-bold leading-[1.4] text-ink">كل عميل ما جاش = حجز ضايع ووقت ضايع.</p>
        </div>
      </Reveal>
    </Section>
  )
}

/** What comes with every subscription, beyond the software. */
function IncludedService() {
  return (
    <Section id="included" tone="ink" className="relative overflow-hidden">
      <span aria-hidden="true" className="pointer-events-none absolute -top-32 -right-24 w-96 h-96 rounded-full bg-accent-500/20 blur-3xl animate-glow-pulse motion-reduce:animate-none" />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-40 -left-24 w-96 h-96 rounded-full bg-accent-400/10 blur-3xl animate-glow-pulse motion-reduce:animate-none" />
      <div className="relative">
        <SectionHead onDark title="مش هنسيبك مع النظام لوحدك" lead="كل ده جوه الاشتراك، في كل الباقات." />
        <div className="mt-9 grid sm:grid-cols-3 gap-5">
          {INCLUDED_SERVICE.map((item, i) => (
            <Reveal key={item.title} delay={i * 100} className="h-full">
              <div className="group h-full rounded-3xl bg-white/[0.06] border border-white/10 p-6 sm:p-7 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1.5 hover:bg-white/10 hover:border-accent-400/60 motion-reduce:hover:translate-y-0">
                <span className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center shadow-lg shadow-accent-900/40 transition-transform duration-300 group-hover:scale-110 motion-reduce:group-hover:scale-100">
                  <item.Icon className="w-7 h-7 text-white" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-[19px] font-bold text-white">{item.title}</h3>
                <p className="mt-2 text-[15px] leading-[1.8] text-white/80">{item.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </Section>
  )
}

/** The bundle: no fixed price yet, so the only action is to ask. */
function ClinicWebsiteOffer() {
  return (
    <Section id="clinic-website" tone="paper">
      <Reveal>
        <div className="relative overflow-hidden rounded-[2rem] bg-white border border-rule shadow-sm grid lg:grid-cols-2 gap-8 items-center p-6 sm:p-10">
          <div>
            <span className="w-14 h-14 rounded-2xl bg-accent-50 text-accent-700 flex items-center justify-center mb-5">
              <HiOutlineGlobeAlt className="w-7 h-7" aria-hidden="true" />
            </span>
            <SectionHead
              title="عايز موقع خاص بعيادتك؟"
              lead="نصممهولك كامل: موقع باسم عيادتك، بدومين خاص بيها، ومربوط باشتراك بسهولة عشان مرضاك يحجزوا منه على طول. السعر بيتحدد حسب احتياجك، فكلمنا ونديك عرض."
            />
            <a
              href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent('مرحباً، عايز عرض سعر لموقع خاص بعيادتي مع اشتراك بسهولة')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center justify-center gap-2 bg-accent-500 hover:bg-accent-600 text-white text-[15px] font-bold px-7 py-4 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] motion-reduce:hover:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <FaWhatsapp className="w-5 h-5" aria-hidden="true" />
              اطلب عرض سعر على واتساب
            </a>
          </div>

          {/* A drawing of a website: shapes only, so nothing reads as a real clinic. */}
          <div aria-hidden="true" className="relative" dir="ltr">
            <div className="absolute inset-6 rounded-full bg-accent-300/30 blur-3xl" />
            <div className="relative rounded-2xl border border-rule bg-white shadow-2xl overflow-hidden animate-float-slow motion-reduce:animate-none">
              <div className="flex items-center gap-1.5 px-4 py-3 bg-paper border-b border-rule">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <span className="w-2.5 h-2.5 rounded-full bg-accent-400" />
                <span className="ml-3 flex-1 h-5 rounded-full bg-white border border-rule" />
              </div>
              <div className="bg-gradient-to-br from-ink to-accent-800 p-6">
                <div className="h-3 w-1/2 rounded-full bg-white/80" />
                <div className="mt-3 h-2 w-3/4 rounded-full bg-white/40" />
                <div className="mt-5 h-8 w-28 rounded-lg bg-accent-400" />
              </div>
              <div className="grid grid-cols-3 gap-3 p-5">
                {[0, 1, 2].map((n) => (
                  <div key={n} className="rounded-xl border border-rule p-3">
                    <div className="w-7 h-7 rounded-lg bg-accent-100" />
                    <div className="mt-3 h-2 rounded-full bg-ink/20" />
                    <div className="mt-2 h-2 w-2/3 rounded-full bg-ink/10" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </Section>
  )
}

const FEATURED_GUIDES = [
  { slug: 'guides/choose-clinic-management-software-egypt', Icon: HiOutlineClipboardDocumentCheck },
  { slug: 'guides/reduce-patient-no-shows', Icon: HiOutlineUserMinus },
  { slug: 'guides/whatsapp-appointment-reminder-templates', Icon: HiOutlineBellAlert },
]

/** The home page has the most authority on the site; this passes it to the guides. */
function GuidesTeaser() {
  return (
    <Section id="guides" tone="paper">
      <SectionHead title="لسه بتقارن؟ ابدأ من هنا" />
      <ul className="mt-8 grid md:grid-cols-3 gap-5">
        {FEATURED_GUIDES.map(({ slug, Icon }, i) => {
          const guide = GUIDES.find((g) => g.slug === slug)
          return (
            <Reveal as="li" key={slug} delay={i * 90}>
              <Link
                to={`/${slug}`}
                className="group flex h-full flex-col rounded-3xl bg-white border border-rule p-6 transition-all duration-300 hover:-translate-y-1 hover:border-accent-400 hover:shadow-xl motion-reduce:hover:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                <span className="w-12 h-12 rounded-2xl bg-accent-50 text-accent-700 flex items-center justify-center transition-colors duration-300 group-hover:bg-accent-500 group-hover:text-white">
                  <Icon className="w-6 h-6" aria-hidden="true" />
                </span>
                <span className="mt-5 mb-6 text-[17px] font-bold leading-[1.5] text-ink">{guide.h1}</span>
                <HiOutlineArrowLeft className="mt-auto w-5 h-5 text-accent-600 transition-transform group-hover:-translate-x-1.5 motion-reduce:group-hover:translate-x-0" aria-hidden="true" />
              </Link>
            </Reveal>
          )
        })}
      </ul>
      <Link to="/guides" className="group inline-flex items-center gap-2 mt-7 rounded-full border border-ink/15 bg-white px-5 py-2.5 text-[14px] font-bold text-ink hover:border-accent-500 hover:text-accent-700 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
        كل الأدلة
        <HiOutlineArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1 motion-reduce:group-hover:translate-x-0" aria-hidden="true" />
      </Link>
    </Section>
  )
}

export default function LandingPage() {
  // Structured data matches exactly what's rendered: only the booking video
  // is on this page (the other two live on /product), and only the first
  // HOME_FAQ_COUNT questions render here (see <FAQ limit={...} /> below) — a
  // schema listing more than the page shows is what gets a rich result
  // rejected.
  const videoSchemas = [videoObjectSchema({
    name: LANDING_VIDEOS.booking.title,
    description: LANDING_VIDEOS.booking.lead,
    youtubeId: LANDING_VIDEOS.booking.youtubeId,
    uploadDate: LANDING_VIDEOS.booking.uploadDate,
    duration: LANDING_VIDEOS.booking.duration,
  })]

  return (
    <div className="min-h-screen bg-paper text-ink font-sans antialiased" dir="rtl">
      <Seo
        title={HOME_META.title}
        description={HOME_META.description}
        path={HOME_META.path}
        alternates={REGIONAL_ALTERNATES}
        schemas={[
          organizationSchema(),
          websiteSchema(),
          softwareApplicationSchema(),
          faqSchema(FAQS.slice(0, HOME_FAQ_COUNT)),
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
          youtubeId={LANDING_VIDEOS.booking.youtubeId}
          stepsTitle={LANDING_VIDEOS.booking.stepsTitle}
          steps={LANDING_VIDEOS.booking.steps}
          cta={{
            to: '/product',
            label: 'شوف جولة كاملة في النظام',
            note: 'تسجيل العيادة، والمميزات التانية كلها، على صفحة المنتج.',
          }}
        />

        <FeatureTeaser id="features" />
        <IncludedService />
        <PricingCards id="pricing" />
        <ClinicWebsiteOffer />
        <FAQ id="faq" limit={HOME_FAQ_COUNT} />
        <GuidesTeaser />
        <FinalCta />
      </main>

      <Footer />
    </div>
  )
}
