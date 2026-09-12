import { Link } from 'react-router-dom'
import { HiOutlineCheck } from 'react-icons/hi2'

import Seo from '../../components/seo/Seo'
import Nav from '../../components/marketing/Nav'
import Footer from '../../components/marketing/Footer'
import FinalCta from '../../components/marketing/FinalCta'
import { IllustrativeNote, Section, SectionHead } from '../../components/marketing/Section'
import Reveal from '../../components/marketing/Reveal'
import BookingPhoneDemo from '../../components/marketing/BookingPhoneDemo'
import VideoSection from '../../components/marketing/VideoSection'
import FeatureTeaser from '../../components/marketing/FeatureTeaser'
import PricingCards from '../../components/marketing/PricingCards'
import FAQ from '../../components/marketing/FAQ'
import { FAQS } from '../../content/faqs'
import { VERTICALS } from '../../content/verticals'
import { LANDING_VIDEOS } from '../../content/landingVideos'
import {
  faqSchema,
  organizationSchema,
  softwareApplicationSchema,
  videoObjectSchema,
  websiteSchema,
} from '../../lib/seo'

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
 *    heading colour, and teal is spent only on calls to action.
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
              نظام حجز مواعيد عربي، وعملاؤك يحجزوا بنفسهم من لينك واحد
            </h1>

            <p className="animate-fadeIn motion-reduce:animate-none [animation-delay:90ms] [animation-fill-mode:backwards] mt-5 text-[15.5px] sm:text-[17px] leading-[1.85] text-white/90 max-w-[58ch]">
              وقت الريسبشن كله بيضيع في تأكيد مواعيد على التليفون والواتساب — سواء عيادة أو
              صالون أو جيم أو أي بيزنس شغال بمواعيد. بسهولة ينقل ده لصفحة حجز شغالة 24 ساعة،
              ويجهّزلك تذكير كل مواعيد بكرا تبعته بضغطة زر.
            </p>

            <div className="animate-fadeIn motion-reduce:animate-none [animation-delay:170ms] [animation-fill-mode:backwards] mt-8 flex flex-col sm:flex-row gap-3">
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

            <p className="animate-fadeIn motion-reduce:animate-none [animation-delay:230ms] [animation-fill-mode:backwards] mt-4 text-[13px] text-white/70">
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
        كل عميل ما جاش = حجز ضايع ووقت ضايع.
      </Reveal>
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
        title="بسهولة — نظام حجز مواعيد وإدارة عملاء للعيادات والصالونات"
        description="نظام حجز مواعيد عربي بالكامل: صفحة حجز برابط خاص بيك، قائمة انتظار، تذكير واتساب من رقمك، ملف عميل وتقارير. اشتراك ثابت بدون عمولة و14 يوم تجربة بدون بطاقة بنكية."
        path="/"
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
        <PricingCards id="pricing" />
        <FAQ id="faq" limit={HOME_FAQ_COUNT} />
        <FinalCta />
      </main>

      <Footer />
    </div>
  )
}
