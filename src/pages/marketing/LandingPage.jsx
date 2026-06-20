import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  HiOutlineArrowLeft,
  HiOutlineCalendar,
  HiOutlineChartBar,
  HiOutlineLink,
  HiOutlineUsers,
  HiOutlineHeart,
  HiOutlineScissors,
  HiOutlineBolt,
  HiOutlineAcademicCap,
  HiOutlineRectangleGroup,
  HiOutlineWrenchScrewdriver,
  HiBars3,
  HiXMark,
  HiChevronDown,
  HiChevronUp,
  HiCheck,
  HiStar
} from 'react-icons/hi2'
import { FaWhatsapp, FaInstagramSquare, FaTwitter, FaFacebook } from 'react-icons/fa'

// Reusable scroll-triggered animation wrapper
function FadeIn({ children, delay = 0 }) {
  const [isVisible, setIsVisible] = useState(false)
  const domRef = useRef()

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true)
            observer.unobserve(domRef.current)
          }
        })
      },
      { threshold: 0.1 }
    )

    const currentRef = domRef.current
    if (currentRef) {
      observer.observe(currentRef)
    }

    return () => {
      if (currentRef) observer.unobserve(currentRef)
    }
  }, [])

  return (
    <div
      ref={domRef}
      className={`transition-all duration-700 ease-out transform ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

function Stars() {
  return (
    <div className="flex gap-0.5 mb-3">
      {[...Array(5)].map((_, i) => <HiStar key={i} className="w-4 h-4 text-amber-400" />)}
    </div>
  )
}

export default function LandingPage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [openFaq, setOpenFaq] = useState(null)

  // Configure SEO headers
  useEffect(() => {
    document.title = 'بسهولة — نظام حجز ومتابعة عملاء للبيزنس الخدمي'
    
    // Check if meta description exists, update or create it
    let metaDesc = document.querySelector('meta[name="description"]')
    if (!metaDesc) {
      metaDesc = document.createElement('meta')
      metaDesc.setAttribute('name', 'description')
      document.head.appendChild(metaDesc)
    }
    metaDesc.setAttribute(
      'content',
      'نظّم حجوزاتك وتابع عملاءك بسهولة. نظام عربي بالكامل للعيادات والصالونات ومراكز اللياقة، بتذكير واتساب أوتوماتيك. جرّب 14 يوم مجاناً.'
    )
  }, [])

  // Detect scroll to style the sticky header
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 50) {
        setIsScrolled(true)
      } else {
        setIsScrolled(false)
      }
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Smooth scroll handler
  const handleScrollTo = (e, id) => {
    e.preventDefault()
    setIsMenuOpen(false)
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  // FAQ accordion questions
  const faqs = [
    {
      q: 'هل محتاج بطاقة بنكية للتجربة المجانية؟',
      a: 'لا، التجربة مجانية بالكامل لمدة 14 يوم بدون الحاجة لإدخال أي بيانات دفع أو بطاقة بنكية.'
    },
    {
      q: 'العملاء محتاجين يحملوا تطبيق؟',
      a: 'لا، عملاؤك بيحجزوا مباشرة من رابط صفحه الحجز الخاصة بيك على أي متصفح، بدون تحميل أي برامج أو تطبيقات.'
    },
    {
      q: 'بيشتغل مع أي نوع بيزنس؟',
      a: 'نعم، بسهولة مصمم ليناسب كافة الأنشطة الخدمية: العيادات الطبية، صالونات التجميل والباربر، مراكز اللياقة البدنية والجمنازيوم، مراكز التعليم والتدريس، حجز الملاعب والمرافق، وكافة الخدمات التي تعتمد على مواعيد.'
    },
    {
      q: 'إزاي بيتم التذكير بالمواعيد؟',
      a: 'يقوم النظام بتجهيز رسائل التذكير التلقائية بالواتساب لكل عميل بالموعد والتفاصيل ورابط التأكيد أو الإلغاء، وتقدر ترسلها بلمسة زر واحدة وبسهولة تامة لتذكير العميل ومنع الغياب.'
    },
    {
      q: 'أقدر أستخدمه لأكتر من فرع؟',
      a: 'نعم، باقة الاحترافي تدعم إدارة فروع متعددة من حساب رئيسي واحد، مع إمكانية تعيين مواعيد وخدمات وموظفين وتقارير مستقلة لكل فرع.'
    },
    {
      q: 'لو عندي مشكلة، أتواصل إزاي؟',
      a: 'فريق الدعم الفني متواجد لمساعدتك في أي وقت. تقدر تتواصل معانا مباشرة عن طريق الواتساب أو الإيميل وسنقوم بالرد عليك في أسرع وقت ممكن.'
    }
  ]

  // Vertical market cards
  const verticals = [
    { icon: <HiOutlineHeart className="w-8 h-8 text-rose-500" />, title: 'عيادات طبية' },
    { icon: <HiOutlineScissors className="w-8 h-8 text-purple-500" />, title: 'صالونات وباربر' },
    { icon: <HiOutlineBolt className="w-8 h-8 text-amber-500" />, title: 'مراكز لياقة' },
    { icon: <HiOutlineAcademicCap className="w-8 h-8 text-blue-500" />, title: 'تعليم وتدريس' },
    { icon: <HiOutlineRectangleGroup className="w-8 h-8 text-emerald-500" />, title: 'ملاعب ومرافق' },
    { icon: <HiOutlineWrenchScrewdriver className="w-8 h-8 text-indigo-500" />, title: 'خدمات أخرى' }
  ]

  return (
    <div className="min-h-screen bg-white text-[#0F2C4E] font-sans antialiased selection:bg-accent-50 selection:text-accent-800" dir="rtl">
      
      {/* 1. NAVBAR */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? 'bg-white shadow-md py-3 border-b border-slate-100' : 'bg-transparent py-5'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">

            {/* Logo on Right in RTL */}
            <div className="flex-shrink-0 flex items-center gap-2">
              <Link to="/" className="flex items-center gap-2">
                <svg className="w-9 h-9 text-[#16B89A]" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M75 50C75 63.8071 63.8071 75 50 75C36.1929 75 25 63.8071 25 50C25 36.1929 36.1929 25 50 25C52.5 25 54.8 25.4 57 26.1" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
                  <path d="M50 75C53.866 75 57.618 73.953 60.875 72" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
                  <circle cx="42" cy="45" r="7" fill={isScrolled ? '#0F2C4E' : '#fff'} />
                  <circle cx="58" cy="45" r="7" fill="#16B89A" />
                  <path d="M38 58C42 62 48 62 52 58" stroke="#16B89A" strokeWidth="6" strokeLinecap="round" />
                </svg>
                <span className={`text-2xl font-bold tracking-tight transition-colors ${isScrolled ? 'text-[#0F2C4E]' : 'text-white'}`}>بسهولة</span>
              </Link>
            </div>

            {/* Nav Links Center */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" onClick={(e) => handleScrollTo(e, 'features')} className={`text-sm font-medium transition-colors hover:text-accent ${isScrolled ? 'text-[#0F2C4E]/80' : 'text-white/80'}`}>المميزات</a>
              <a href="#testimonials" onClick={(e) => handleScrollTo(e, 'testimonials')} className={`text-sm font-medium transition-colors hover:text-accent ${isScrolled ? 'text-[#0F2C4E]/80' : 'text-white/80'}`}>آراء العملاء</a>
              <a href="#pricing" onClick={(e) => handleScrollTo(e, 'pricing')} className={`text-sm font-medium transition-colors hover:text-accent ${isScrolled ? 'text-[#0F2C4E]/80' : 'text-white/80'}`}>الأسعار</a>
              <a href="#faq" onClick={(e) => handleScrollTo(e, 'faq')} className={`text-sm font-medium transition-colors hover:text-accent ${isScrolled ? 'text-[#0F2C4E]/80' : 'text-white/80'}`}>تواصل معنا</a>
            </div>

            {/* CTA Left */}
            <div className="hidden md:flex items-center gap-4">
              <Link to="/login" className={`text-sm font-medium transition-colors hover:text-accent ${isScrolled ? 'text-[#0F2C4E]' : 'text-white'}`}>تسجيل الدخول</Link>
              <Link to="/register" className="bg-[#16B89A] hover:bg-accent-600 text-white text-sm font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-accent/20 transition-all hover:scale-102 active:scale-98">
                ابدأ مجاناً
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <div className="md:hidden flex items-center">
              <button onClick={() => setIsMenuOpen(!isMenuOpen)} className={`p-2 transition-colors hover:text-accent ${isScrolled ? 'text-[#0F2C4E]' : 'text-white'}`} aria-label="Toggle menu">
                {isMenuOpen ? <HiXMark className="w-6 h-6" /> : <HiBars3 className="w-6 h-6" />}
              </button>
            </div>

          </div>
        </div>

        {/* Mobile Menu Drawer */}
        {isMenuOpen && (
          <div className="md:hidden bg-white/95 backdrop-blur-md border-b border-slate-100 absolute top-full left-0 right-0 py-6 px-4 shadow-xl flex flex-col gap-5 animate-fadeIn">
            <a href="#features" onClick={(e) => handleScrollTo(e, 'features')} className="text-lg font-medium text-[#0F2C4E] hover:text-accent py-2 border-b border-slate-50 transition-colors">المميزات</a>
            <a href="#testimonials" onClick={(e) => handleScrollTo(e, 'testimonials')} className="text-lg font-medium text-[#0F2C4E] hover:text-accent py-2 border-b border-slate-50 transition-colors">آراء العملاء</a>
            <a href="#pricing" onClick={(e) => handleScrollTo(e, 'pricing')} className="text-lg font-medium text-[#0F2C4E] hover:text-accent py-2 border-b border-slate-50 transition-colors">الأسعار</a>
            <a href="#faq" onClick={(e) => handleScrollTo(e, 'faq')} className="text-lg font-medium text-[#0F2C4E] hover:text-accent py-2 border-b border-slate-50 transition-colors">تواصل معنا</a>
            <div className="flex flex-col gap-3 pt-3">
              <Link to="/login" onClick={() => setIsMenuOpen(false)} className="text-center font-medium text-[#0F2C4E] hover:text-accent py-2.5 border border-[#0F2C4E]/10 rounded-xl transition-colors">تسجيل الدخول</Link>
              <Link to="/register" onClick={() => setIsMenuOpen(false)} className="text-center bg-[#16B89A] hover:bg-accent-600 text-white font-bold py-3 rounded-xl shadow-lg transition-colors">
                ابدأ تجربتك المجانية
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* 2. HERO SECTION — dark navy with glowing orbs + dashboard mockup */}
      <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden bg-gradient-to-br from-[#081A30] via-[#0F2C4E] to-[#0a2240]">
        {/* Decorative glow orbs — slow pulse + drift for a living background */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-accent/20 rounded-full blur-3xl pointer-events-none animate-glow-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none animate-drift" style={{ animationDelay: '1.5s' }} />
        <div className="absolute top-1/3 right-10 w-40 h-40 bg-white/5 rounded-full blur-2xl pointer-events-none animate-float-slow" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">

            {/* Right Column: Title & CTA */}
            <div className="lg:col-span-6 flex flex-col items-start text-right">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-tight mb-6">
                أوقف خسارة المواعيد
                <br />
                واجعل الحجز يتم <span className="text-[#16B89A]">تلقائياً</span>
              </h1>

              <p className="text-lg text-slate-300 mb-8 leading-relaxed max-w-xl">
                نظام حجز مواعيد ذكي لزيادة الحجوزات، تقليل الإلغاءات، وتوفير وقتك لتحسين تجربة عملائك.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto mb-8">
                <Link to="/register" className="inline-flex items-center justify-center gap-2 bg-[#16B89A] hover:bg-accent-600 text-white text-base font-bold px-8 py-4 rounded-2xl shadow-xl shadow-accent/25 transition-all hover:scale-102 active:scale-98">
                  <span>ابدأ تجربة مجانية الآن</span>
                  <HiOutlineArrowLeft className="w-5 h-5" />
                </Link>
                <a href="#features" onClick={(e) => handleScrollTo(e, 'features')} className="inline-flex items-center justify-center bg-white/5 hover:bg-white/10 text-white text-base font-semibold px-8 py-4 rounded-2xl border border-white/20 transition-colors backdrop-blur-sm">
                  احجز عرضاً توضيحياً
                </a>
              </div>

              {/* Trust Row */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-slate-300 font-medium border-t border-white/10 pt-6 w-full lg:w-auto">
                <span className="flex items-center gap-1.5">✓ لا يلزم بطاقة ائتمان</span>
                <span className="flex items-center gap-1.5">⏱ إعداد خلال 5 دقائق</span>
                <span className="flex items-center gap-1.5">🎁 14 يوم تجربة مجاناً</span>
              </div>
            </div>

            {/* Left Column: Dashboard mockup with floating widgets */}
            <div className="lg:col-span-6 relative flex justify-center items-center mt-8 lg:mt-0">

              {/* Floating stat card: total bookings */}
              <div className="absolute -top-6 right-4 sm:right-12 z-20 bg-[#0F2C4E]/90 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl p-4 flex items-center gap-3 animate-bounce-slow">
                <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center text-accent flex-shrink-0">
                  <HiOutlineChartBar className="w-5 h-5" />
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-300 font-bold">إجمالي الحجوزات</div>
                  <div className="text-lg font-black text-white">+2,450</div>
                  <div className="text-[9px] text-accent font-bold">↑ نسبة الشهر الماضي</div>
                </div>
              </div>

              {/* Dashboard window */}
              <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-white/10 overflow-hidden flex">

                {/* Mini sidebar */}
                <div className="w-12 sm:w-14 bg-[#F8FAFC] border-l border-slate-100 flex flex-col items-center py-4 gap-3 flex-shrink-0">
                  {[HiOutlineCalendar, HiOutlineUsers, HiOutlineChartBar, HiOutlineWrenchScrewdriver].map((Icon, i) => (
                    <div key={i} className={`w-8 h-8 rounded-lg flex items-center justify-center ${i === 0 ? 'bg-accent text-white' : 'text-slate-400'}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                  ))}
                </div>

                {/* Calendar Workspace Mockup */}
                <div className="flex-1 p-4 sm:p-5 bg-white flex flex-col gap-4 min-w-0">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-[#0F2C4E]">مايو 2025</span>
                    <div className="flex gap-1.5">
                      <button className="p-1 rounded bg-slate-100 text-xs text-slate-500 font-bold" disabled>&lt;</button>
                      <button className="p-1 rounded bg-slate-100 text-xs text-slate-500 font-bold" disabled>&gt;</button>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-center border-b border-slate-100 pb-2">
                    {['سبت', 'أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة'].map((day) => (
                      <span key={day} className="text-[10px] sm:text-xs font-bold text-slate-400">{day}</span>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1.5">
                    <div className="aspect-square bg-slate-50/50 rounded-lg p-1 text-[10px] text-slate-300">٢٨</div>
                    <div className="aspect-square bg-slate-50/50 rounded-lg p-1 text-[10px] text-slate-300">٢٩</div>
                    <div className="aspect-square bg-slate-50/50 rounded-lg p-1 text-[10px] text-slate-300">٣٠</div>

                    <div className="aspect-square bg-[#D7F5EE]/40 border border-[#8FE0CD] rounded-lg p-1 flex flex-col justify-between">
                      <span className="text-[10px] font-bold text-[#08594A]">١</span>
                      <div className="bg-[#16B89A] text-white text-[7px] p-0.5 rounded text-center truncate font-bold">أحمد</div>
                    </div>
                    <div className="aspect-square bg-slate-50 rounded-lg p-1 border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400">٢</span>
                    </div>
                    <div className="aspect-square bg-slate-50 rounded-lg p-1 border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400">٣</span>
                    </div>
                    <div className="aspect-square bg-[#E8EEF4] border border-blue-200 rounded-lg p-1 flex flex-col justify-between">
                      <span className="text-[10px] font-bold text-[#0F2C4E]">٤</span>
                      <div className="bg-[#0F2C4E] text-white text-[7px] p-0.5 rounded text-center truncate font-bold">منى</div>
                    </div>
                    <div className="aspect-square bg-slate-50 rounded-lg p-1 border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400">٥</span>
                    </div>
                    <div className="aspect-square bg-slate-50 rounded-lg p-1 border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400">٦</span>
                    </div>
                    <div className="aspect-square bg-slate-50 rounded-lg p-1 border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400">٧</span>
                    </div>

                    <div className="aspect-square bg-slate-50 rounded-lg p-1 border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400">٨</span>
                    </div>
                    <div className="aspect-square bg-slate-50 rounded-lg p-1 border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400">٩</span>
                    </div>
                    <div className="aspect-square bg-slate-50 rounded-lg p-1 border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400">١٠</span>
                    </div>
                    <div className="aspect-square bg-white border-2 border-dashed border-accent rounded-lg p-1">
                      <span className="text-[10px] font-bold text-accent">١١</span>
                    </div>
                    <div className="aspect-square bg-slate-50 rounded-lg p-1 border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400">١٢</span>
                    </div>
                    <div className="aspect-square bg-slate-50 rounded-lg p-1 border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400">١٣</span>
                    </div>
                    <div className="aspect-square bg-slate-50 rounded-lg p-1 border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400">١٤</span>
                    </div>

                    <div className="aspect-square bg-slate-50 rounded-lg p-1 border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400">١٥</span>
                    </div>
                    <div className="aspect-square bg-slate-50 rounded-lg p-1 border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400">١٦</span>
                    </div>
                    <div className="aspect-square bg-slate-50 rounded-lg p-1 border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400">١٧</span>
                    </div>
                    <div className="aspect-square bg-slate-50 rounded-lg p-1 border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400">١٨</span>
                    </div>
                    <div className="aspect-square bg-slate-50 rounded-lg p-1 border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400">١٩</span>
                    </div>
                    <div className="aspect-square bg-accent rounded-lg p-1 shadow-md">
                      <span className="text-[10px] font-bold text-white">٢٠</span>
                    </div>
                    <div className="aspect-square bg-slate-50 rounded-lg p-1 border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400">٢١</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating stat card: attendance rate */}
              <div className="absolute -bottom-6 -left-2 sm:left-2 z-20 bg-white rounded-2xl shadow-2xl border border-slate-100 p-4 flex items-center gap-3 max-w-[190px] animate-float" style={{ animationDelay: '0.8s' }}>
                <div className="w-11 h-11 rounded-full border-4 border-accent/20 flex items-center justify-center flex-shrink-0 relative">
                  <span className="absolute inset-0 rounded-full border-4 border-accent border-t-transparent rotate-45" />
                  <span className="text-[10px] font-black text-[#0F2C4E]">92%</span>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-400 font-bold">معدل الحضور</div>
                  <div className="text-sm font-black text-accent-600">ممتاز</div>
                </div>
              </div>

              {/* Floating avatar group */}
              <div className="hidden sm:flex absolute top-1/2 -left-6 z-20 bg-white rounded-2xl shadow-2xl border border-slate-100 p-3 items-center gap-2 animate-float-slow" style={{ animationDelay: '0.4s' }}>
                <div className="flex -space-x-2 rtl:space-x-reverse">
                  {['from-rose-300 to-rose-500', 'from-blue-300 to-blue-500', 'from-amber-300 to-amber-500'].map((g, i) => (
                    <div key={i} className={`w-7 h-7 rounded-full bg-gradient-to-br ${g} border-2 border-white`} />
                  ))}
                </div>
                <span className="text-xs font-black text-[#0F2C4E]">+1.2K</span>
              </div>

            </div>

          </div>
        </div>
      </section>

      {/* 3. SOCIAL PROOF STRIP */}
      <section className="py-8 bg-slate-50 border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm font-bold text-slate-400 mb-5">
            أكثر من 5,000+ شركة تعتمد علينا يومياً
          </p>
          <div className="flex flex-wrap justify-center items-center gap-8 sm:gap-12 md:gap-16 text-slate-400 text-base font-bold opacity-80 grayscale">
            <span className="flex items-center gap-1.5"><HiOutlineHeart className="w-5 h-5" /> عيادات الصفوة</span>
            <span className="flex items-center gap-1.5"><HiOutlineBolt className="w-5 h-5" /> FIT LIFE</span>
            <span className="flex items-center gap-1.5"><HiOutlineScissors className="w-5 h-5" /> مركز بسمة</span>
            <span className="flex items-center gap-1.5"><HiOutlineHeart className="w-5 h-5" /> IDEAL DENTAL</span>
            <span className="flex items-center gap-1.5"><HiOutlineRectangleGroup className="w-5 h-5" /> RITAN</span>
            <span className="flex items-center gap-1.5"><HiOutlineHeart className="w-5 h-5" /> NOVA CLINIC</span>
          </div>
        </div>
      </section>

      {/* 4. CHALLENGES → SOLUTION COMPARISON */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">

          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-black text-[#0F2C4E] mb-4">من التحديات إلى الحلول</h2>
            <div className="w-16 h-1 bg-accent mx-auto rounded-full" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch relative">

            {/* Challenges */}
            <FadeIn delay={100}>
              <div className="bg-rose-50/60 border border-rose-100 rounded-3xl p-8 h-full">
                <h3 className="text-lg font-black text-rose-600 mb-6 text-center">التحديات اليومية</h3>
                <ul className="space-y-4">
                  {[
                    'مواعيد ضائعة وإلغاءات مفاجئة',
                    'مكالمات ورسائل مرهقة لا تنتهي',
                    'إدارة بدوية مرهقة وخطأ بشري',
                    'عدم استغلال كامل للوقت',
                    'عملاء غير راضين',
                  ].map((t) => (
                    <li key={t} className="flex items-center justify-end gap-2 text-sm font-semibold text-slate-600 text-right">
                      <span>{t}</span>
                      <HiXMark className="w-5 h-5 text-rose-400 flex-shrink-0" />
                    </li>
                  ))}
                </ul>
              </div>
            </FadeIn>

            {/* Solution */}
            <FadeIn delay={200}>
              <div className="bg-accent-50/60 border border-accent-100 rounded-3xl p-8 h-full">
                <h3 className="text-lg font-black text-accent-700 mb-6 text-center">مع بسهولة</h3>
                <ul className="space-y-4">
                  {[
                    'حجوزات تلقائية 24/7 بدون تدخل',
                    'تذكيرات ذكية تقلل الإلغاءات',
                    'تقويم موحد وتنظيم كامل',
                    'زيادة الإشغال والإيرادات',
                    'تجربة احترافية لعملائك',
                  ].map((t) => (
                    <li key={t} className="flex items-center justify-end gap-2 text-sm font-semibold text-[#0F2C4E] text-right">
                      <span>{t}</span>
                      <HiCheck className="w-5 h-5 text-accent flex-shrink-0" />
                    </li>
                  ))}
                </ul>
              </div>
            </FadeIn>

            {/* Arrow connector (desktop only) */}
            <div className="hidden md:flex absolute inset-0 items-center justify-center pointer-events-none">
              <div className="w-12 h-12 rounded-full bg-[#0F2C4E] text-white flex items-center justify-center shadow-xl rotate-180">
                <HiOutlineArrowLeft className="w-5 h-5" />
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 5. HOW IT WORKS — 5 steps */}
      <section className="py-20 bg-white border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-black text-[#0F2C4E] mb-4">كيف يعمل بسهولة؟</h2>
            <p className="text-lg text-slate-500">نظام حجز ذكي ومتكامل مصمم خصيصاً ليسهل حياة أصحاب الأعمال وعملائهم</p>
            <div className="w-16 h-1 bg-accent mx-auto rounded-full mt-4" />
          </div>

          {/* Stepper Pipeline */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 relative">

            {[
              { n: '١', icon: HiOutlineWrenchScrewdriver, title: 'أنشئ صفحتك', desc: 'في دقيقتين، حدد نشاطك وخدماتك وساعات عملك.', color: 'bg-accent', iconBg: 'bg-accent-50 text-accent' },
              { n: '٢', icon: HiOutlineLink, title: 'شارك رابط الحجز', desc: 'انسخ رابطك وحطه في بايو إنستجرام أو واتساب.', color: 'bg-[#0F2C4E]', iconBg: 'bg-blue-50 text-primary-700' },
              { n: '٣', icon: HiOutlineCalendar, title: 'يختار العميل', desc: 'عميلك يختار الخدمة والموعد اللي يناسبه بنفسه.', color: 'bg-accent', iconBg: 'bg-accent-50 text-accent' },
              { n: '٤', icon: FaWhatsapp, title: 'تأكيد وتذكير تلقائي', desc: 'النظام بيذكّر العميل قبل الموعد ويقلل الإلغاءات.', color: 'bg-emerald-500', iconBg: 'bg-emerald-50 text-emerald-500' },
              { n: '٥', icon: HiOutlineChartBar, title: 'تقديم الخدمة', desc: 'تقدم خدمتك في الموعد المحدد بكل سهولة.', color: 'bg-amber-500', iconBg: 'bg-amber-50 text-amber-500' },
            ].map((s, i) => (
              <FadeIn key={s.n} delay={i * 100}>
                <div className="bg-[#F8FAFC] border border-slate-100 rounded-2xl p-6 relative hover:shadow-lg transition-shadow duration-300 flex flex-col h-full text-right">
                  <span className={`absolute -top-4 -right-4 w-10 h-10 rounded-full ${s.color} text-white flex items-center justify-center leading-none font-black shadow-md`}>{s.n}</span>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-6 mt-2 ${s.iconBg}`}>
                    <s.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-[#0F2C4E] mb-3">{s.title}</h3>
                  <p className="text-slate-500 text-sm leading-relaxed">{s.desc}</p>
                </div>
              </FadeIn>
            ))}

          </div>

          <div className="mt-16 text-center">
            <Link to="/register" className="inline-flex items-center justify-center gap-2 bg-[#16B89A] hover:bg-accent-600 text-white text-base font-bold px-10 py-4 rounded-2xl shadow-xl shadow-accent/25 transition-all hover:scale-102 active:scale-98">
              <span>ابدأ دلوقتي مجاناً</span>
              <HiOutlineArrowLeft className="w-5 h-5" />
            </Link>
          </div>

        </div>
      </section>

      {/* 6. FEATURES — simple icon grid */}
      <section id="features" className="py-20 bg-slate-50/50 border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-black text-[#0F2C4E] mb-4">ميزات صنعت لأجلك</h2>
            <p className="text-lg text-slate-500">كل اللي تحتاجه لإدارة بيزنسك في مكان واحد</p>
            <div className="w-16 h-1 bg-[#16B89A] mx-auto rounded-full mt-4" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
            {[
              { icon: HiOutlineCalendar, title: 'حجز 24/7', desc: 'استقبل الحجوزات في أي وقت' },
              { icon: FaWhatsapp, title: 'تذكيرات ذكية', desc: 'رسائل واتساب تقلل عدم الحضور' },
              { icon: HiOutlineChartBar, title: 'مدفوعات إلكترونية', desc: 'ادفع الآن أو لاحقاً بكل أمان' },
              { icon: HiOutlineLink, title: 'تقارير وتحليلات', desc: 'اعرف أداء عملك وخذ قرارات أفضل' },
              { icon: HiOutlineUsers, title: 'إدارة الفريق', desc: 'صلاحيات متعددة وتنظيم المهام' },
            ].map((f, i) => (
              <FadeIn key={f.title} delay={i * 80}>
                <div className="bg-white border border-slate-100 rounded-2xl p-6 flex flex-col items-center text-center gap-3 h-full hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                  <div className="w-12 h-12 rounded-xl bg-[#D7F5EE] flex items-center justify-center text-accent">
                    <f.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-[#0F2C4E]">{f.title}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">{f.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>

        </div>
      </section>

      {/* 7. WHO IS THIS FOR (verticals showcase) */}
      <section className="py-20 bg-slate-50/50 border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-black text-[#0F2C4E] mb-4">مصمم لأي بيزنس خدمي</h2>
            <div className="w-16 h-1 bg-accent mx-auto rounded-full" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            {verticals.map((v, i) => (
              <FadeIn key={i} delay={(i % 3) * 100}>
                <div className="bg-white border border-slate-100 hover:border-accent/40 rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-lg cursor-pointer">
                  <div className="mb-4">
                    {v.icon}
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-[#0F2C4E]">
                    {v.title}
                  </h3>
                </div>
              </FadeIn>
            ))}
          </div>

        </div>
      </section>

      {/* 7.5 TESTIMONIALS SECTION */}
      <section id="testimonials" className="py-20 bg-white border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-black text-[#0F2C4E] mb-4">آراء شركاء النجاح</h2>
            <p className="text-lg text-slate-500">تجارب حقيقية لأصحاب أعمال وثقوا في "بسهولة" لتنظيم عملهم</p>
            <div className="w-16 h-1 bg-accent mx-auto rounded-full mt-4" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            
            {/* Testimonial 1 */}
            <FadeIn delay={0}>
              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 relative flex flex-col justify-between h-full">
                <span className="text-5xl text-accent/20 absolute top-4 right-4 leading-none font-serif">“</span>
                <Stars />
                <p className="text-slate-600 text-sm leading-relaxed mb-6 relative z-10 font-medium">
                  "وفّرت ساعتين يومياً كنت بضيعهم في مكالمات الحجز وواتساب، وعملائي مبسوطين جداً بالسهولة. بلمحة واحدة في الصباح بعرف جدول يومي كامل."
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center font-bold text-rose-600 text-sm leading-none">أك</div>
                  <div>
                    <h4 className="text-xs font-bold text-[#0F2C4E]">د. أحمد كمال</h4>
                    <p className="text-[10px] text-slate-400">طبيب أسنان - عيادة كمال</p>
                  </div>
                </div>
              </div>
            </FadeIn>

            {/* Testimonial 2 */}
            <FadeIn delay={100}>
              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 relative flex flex-col justify-between h-full">
                <span className="text-5xl text-accent/20 absolute top-4 right-4 leading-none font-serif">“</span>
                <Stars />
                <p className="text-slate-600 text-sm leading-relaxed mb-6 relative z-10 font-medium">
                  "تذكير الواتساب قلل غياب العملاء لأقل من 5%. خطوة فارقة في شغلي، الحجوزات بتتحرك بسلاسة ومبقاش عندي أوقات ضايعة."
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center font-bold text-purple-600 text-sm leading-none">سج</div>
                  <div>
                    <h4 className="text-xs font-bold text-[#0F2C4E]">سارة الجارحي</h4>
                    <p className="text-[10px] text-slate-400">صالون سارة للتجميل</p>
                  </div>
                </div>
              </div>
            </FadeIn>

            {/* Testimonial 3 */}
            <FadeIn delay={200}>
              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 relative flex flex-col justify-between h-full">
                <span className="text-5xl text-accent/20 absolute top-4 right-4 leading-none font-serif">“</span>
                <Stars />
                <p className="text-slate-600 text-sm leading-relaxed mb-6 relative z-10 font-medium">
                  "النظام رائع وبيجمع كل حجوزات المشتركين في مكان واحد من غير فوضى. إضافة خدمات جديدة وحساب اشتراكات وتدريب سهل جداً."
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600 text-sm leading-none">كح</div>
                  <div>
                    <h4 className="text-xs font-bold text-[#0F2C4E]">كابتن حازم</h4>
                    <p className="text-[10px] text-slate-400">مدرب صالة رياضية - FitZone</p>
                  </div>
                </div>
              </div>
            </FadeIn>

          </div>
        </div>
      </section>

      {/* 8. PRICING SECTION */}
      <section id="pricing" className="py-20 bg-slate-50/50 border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-black text-[#0F2C4E] mb-4">باقات وعروض مرنة تناسب حجم أعمالك</h2>
            <p className="text-lg text-slate-500">ابدأ بـ 14 يوم تجربة مجانية كاملة للمميزات قبل دفع أي شيء</p>
            <div className="w-16 h-1 bg-accent mx-auto rounded-full mt-4" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
            
            {/* Offer 1: 1 Month */}
            <FadeIn delay={0}>
            <div className="bg-white border border-slate-200 rounded-3xl p-8 flex flex-col justify-between shadow-sm relative text-right transition-transform hover:scale-102">
              <div>
                <span className="bg-slate-100 text-slate-700 text-xs font-extrabold px-3 py-1 rounded-full mb-4 inline-block">
                  تجديد شهري مرن
                </span>
                <h3 className="text-xl font-bold text-[#0F2C4E] mb-4">باقة الشهر الواحد</h3>
                <div className="flex items-baseline gap-1.5 mb-2">
                  <span className="text-4xl font-black text-[#0F2C4E]">299 جنيه</span>
                  <span className="text-slate-400 text-sm">/ شهرياً</span>
                </div>
                <p className="text-xs text-emerald-600 font-bold mb-6">✓ تشمل 14 يوم تجربة مجانية</p>
                <div className="w-full h-px bg-slate-100 mb-6" />
                <ul className="space-y-4 text-sm font-semibold text-slate-600 mb-8">
                  <li className="flex items-center gap-2 text-[#0F2C4E]">✓ كل المميزات مفتوحة</li>
                  <li className="flex items-center gap-2 text-[#0F2C4E]">✓ مواعيد وحجوزات غير محدودة</li>
                  <li className="flex items-center gap-2 text-[#0F2C4E]">✓ تذكير واتساب ذكي بلمسة زر</li>
                  <li className="flex items-center gap-2 text-[#0F2C4E]">✓ ملف عملاء وتاريخ كامل</li>
                  <li className="flex items-center gap-2 text-[#0F2C4E]">✓ إدارة فروع متعددة وموظفين</li>
                </ul>
              </div>
              <Link to="/register" className="w-full text-center border border-slate-300 hover:border-[#0F2C4E] text-[#0F2C4E] font-bold py-3.5 rounded-xl transition-colors">
                ابدأ التجربة مجاناً
              </Link>
            </div>
            </FadeIn>

            {/* Offer 2: 3 Months */}
            <FadeIn delay={100}>
            <div className="bg-white border-2 border-accent rounded-3xl p-8 flex flex-col justify-between shadow-xl relative text-right scale-100 md:scale-105 z-10">
              <span className="absolute -top-4 right-1/2 translate-x-1/2 bg-[#16B89A] text-white text-xs font-extrabold px-4 py-1.5 rounded-full uppercase tracking-wider">
                الأكثر طلباً وتوفيراً
              </span>
              <div>
                <span className="bg-[#D7F5EE] text-[#08594A] text-xs font-extrabold px-3 py-1 rounded-full mb-4 inline-block">
                  توفير ٢٧% من السعر الشهري 🔥
                </span>
                <h3 className="text-xl font-bold text-[#0F2C4E] mb-4">عرض 3 شهور</h3>
                <div className="flex items-baseline gap-1.5 mb-1">
                  <span className="text-4xl font-black text-[#0F2C4E]">650 جنيه</span>
                  <span className="text-slate-400 text-sm">/ 3 شهور</span>
                </div>
                <div className="text-xs text-slate-400 mb-2 font-bold">(يعادل 216 جنيه فقط شهرياً)</div>
                <p className="text-xs text-emerald-600 font-bold mb-6">✓ تشمل 14 يوم تجربة مجانية</p>
                <div className="w-full h-px bg-slate-100 mb-6" />
                <ul className="space-y-4 text-sm font-semibold text-slate-600 mb-8">
                  <li className="flex items-center gap-2 text-[#0F2C4E]">✓ كل المميزات مفتوحة</li>
                  <li className="flex items-center gap-2 text-[#0F2C4E]">✓ مواعيد وحجوزات غير محدودة</li>
                  <li className="flex items-center gap-2 text-[#0F2C4E]">✓ تذكير واتساب ذكي بلمسة زر</li>
                  <li className="flex items-center gap-2 text-[#0F2C4E]">✓ ملف عملاء وتاريخ كامل</li>
                  <li className="flex items-center gap-2 text-[#0F2C4E]">✓ إدارة فروع متعددة وموظفين</li>
                  <li className="flex items-center gap-2 text-[#0F2C4E]">✓ دعم فني مخصص عبر الواتساب</li>
                </ul>
              </div>
              <Link to="/register" className="w-full text-center bg-[#16B89A] hover:bg-accent-600 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-accent/20 transition-all hover:scale-102">
                ابدأ التجربة مجاناً
              </Link>
            </div>
            </FadeIn>

            {/* Offer 3: 6 Months */}
            <FadeIn delay={200}>
            <div className="bg-white border border-slate-200 rounded-3xl p-8 flex flex-col justify-between shadow-sm relative text-right transition-transform hover:scale-102">
              <div>
                <span className="bg-amber-100 text-amber-800 text-xs font-extrabold px-3 py-1 rounded-full mb-4 inline-block">
                  أفضل قيمة للمشاريع المستقرة 🌟
                </span>
                <h3 className="text-xl font-bold text-[#0F2C4E] mb-4">عرض 6 شهور</h3>
                <div className="flex items-baseline gap-1.5 mb-1">
                  <span className="text-4xl font-black text-[#0F2C4E]">1200 جنيه</span>
                  <span className="text-slate-400 text-sm">/ 6 شهور</span>
                </div>
                <div className="text-xs text-slate-400 mb-2 font-bold">(يعادل 200 جنيه فقط شهرياً)</div>
                <p className="text-xs text-emerald-600 font-bold mb-6">✓ تشمل 14 يوم تجربة مجانية</p>
                <div className="w-full h-px bg-slate-100 mb-6" />
                <ul className="space-y-4 text-sm font-semibold text-slate-600 mb-8">
                  <li className="flex items-center gap-2 text-[#0F2C4E]">✓ كل المميزات مفتوحة</li>
                  <li className="flex items-center gap-2 text-[#0F2C4E]">✓ مواعيد وحجوزات غير محدودة</li>
                  <li className="flex items-center gap-2 text-[#0F2C4E]">✓ تذكير واتساب ذكي بلمسة زر</li>
                  <li className="flex items-center gap-2 text-[#0F2C4E]">✓ ملف عملاء وتاريخ كامل</li>
                  <li className="flex items-center gap-2 text-[#0F2C4E]">✓ إدارة فروع متعددة وموظفين</li>
                  <li className="flex items-center gap-2 text-[#0F2C4E]">✓ دعم فني ذو أولوية وتفعيل مخصص</li>
                </ul>
              </div>
              <Link to="/register" className="w-full text-center border border-slate-300 hover:border-[#0F2C4E] text-[#0F2C4E] font-bold py-3.5 rounded-xl transition-colors">
                ابدأ التجربة مجاناً
              </Link>
            </div>
            </FadeIn>

          </div>

          <div className="mt-12 text-center text-sm font-semibold text-slate-500">
            <span>محتاج باقة مخصصة؟ </span>
            <a href="https://wa.me/201026046187" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline flex inline-flex items-center gap-1 font-bold">
              تواصل معنا عبر واتساب <FaWhatsapp className="w-4 h-4" />
            </a>
          </div>

        </div>
      </section>

      {/* 9. FAQ SECTION */}
      <section id="faq" className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          
          <div className="text-center mb-16">
            <h2 className="text-3xl font-black text-[#0F2C4E] mb-4">أسئلة شائعة</h2>
            <div className="w-16 h-1 bg-accent mx-auto rounded-full" />
          </div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <FadeIn key={idx} delay={idx * 60}>
                <div className="border border-slate-100 rounded-2xl overflow-hidden transition-all duration-300">
                  <button
                    onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                    className="w-full px-6 py-5 bg-slate-50 hover:bg-slate-100/50 flex justify-between items-center text-right transition-colors"
                  >
                    <span className="font-bold text-[#0F2C4E] text-sm sm:text-base">{faq.q}</span>
                    {openFaq === idx ? (
                      <HiChevronUp className="w-5 h-5 text-accent flex-shrink-0" />
                    ) : (
                      <HiChevronDown className="w-5 h-5 text-[#0F2C4E]/60 flex-shrink-0" />
                    )}
                  </button>
                  <div className={`transition-all duration-300 ease-in-out overflow-hidden ${
                    openFaq === idx ? 'max-h-40 border-t border-slate-100' : 'max-h-0'
                  }`}>
                    <div className="px-6 py-5 text-sm text-slate-500 leading-relaxed bg-white text-right">
                      {faq.a}
                    </div>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>

        </div>
      </section>

      {/* 10. FINAL CTA SECTION */}
      <section className="py-24 bg-[#0F2C4E] text-white text-center relative overflow-hidden">
        {/* Background glow effects */}
        <div className="absolute -top-24 -right-24 w-80 h-80 bg-accent/20 rounded-full blur-3xl animate-glow-pulse" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl animate-drift" style={{ animationDelay: '2s' }} />

        <FadeIn>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 relative z-10">
          <h2 className="text-3xl sm:text-4xl font-black mb-6 leading-tight">
            جاهز تبدأ تنظم بيزنسك؟
          </h2>

          <p className="text-lg text-slate-300 mb-10 max-w-2xl mx-auto leading-relaxed">
            انضم لأصحاب الأعمال اللي بدأوا يوفروا وقتهم وفلوسهم مع بسهولة
          </p>

          <Link to="/register" className="inline-flex items-center justify-center gap-2 bg-[#16B89A] hover:bg-accent-600 text-white text-lg font-bold px-10 py-4.5 rounded-2xl shadow-xl shadow-accent/20 transition-all hover:scale-102 active:scale-98">
            <span>ابدأ تجربتك المجانية الآن</span>
            <HiOutlineArrowLeft className="w-5 h-5" />
          </Link>

          <p className="text-xs text-slate-400 mt-6 font-medium">
            بدون بطاقة بنكية · إعداد في 10 دقايق
          </p>
        </div>
        </FadeIn>
      </section>

      {/* 11. FOOTER */}
      <footer className="bg-slate-900 text-slate-400 py-16 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 mb-12">
            
            {/* Col 1: Logo & Brand Info */}
            <div className="md:col-span-4 flex flex-col items-start text-right">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-8 h-8 text-[#16B89A]" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M75 50C75 63.8071 63.8071 75 50 75C36.1929 75 25 63.8071 25 50C25 36.1929 36.1929 25 50 25C52.5 25 54.8 25.4 57 26.1" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
                  <path d="M50 75C53.866 75 57.618 73.953 60.875 72" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
                  <circle cx="42" cy="45" r="7" fill="#fff" />
                  <circle cx="58" cy="45" r="7" fill="#16B89A" />
                  <path d="M38 58C42 62 48 62 52 58" stroke="#16B89A" strokeWidth="6" strokeLinecap="round" />
                </svg>
                <span className="text-xl font-bold text-white">بسهولة</span>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed max-w-xs mb-4">
                تنظيم أسهل، عملاء أكثر
              </p>
              <div className="flex items-center gap-3">
                <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-accent flex items-center justify-center text-slate-300 hover:text-white transition-colors" aria-label="Instagram">
                  <FaInstagramSquare className="w-4 h-4" />
                </a>
                <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-accent flex items-center justify-center text-slate-300 hover:text-white transition-colors" aria-label="Twitter">
                  <FaTwitter className="w-4 h-4" />
                </a>
                <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-accent flex items-center justify-center text-slate-300 hover:text-white transition-colors" aria-label="Facebook">
                  <FaFacebook className="w-4 h-4" />
                </a>
              </div>
            </div>

            {/* Col 2: Navigation Links */}
            <div className="md:col-span-3 text-right">
              <h4 className="text-white text-sm font-bold uppercase tracking-wider mb-4">المنتج</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" onClick={(e) => handleScrollTo(e, 'features')} className="hover:text-white transition-colors">المميزات</a></li>
                <li><a href="#pricing" onClick={(e) => handleScrollTo(e, 'pricing')} className="hover:text-white transition-colors">الأسعار</a></li>
                <li><Link to="/login" className="hover:text-white transition-colors">تسجيل دخول</Link></li>
                <li><Link to="/register" className="hover:text-white transition-colors">إنشاء حساب جديد</Link></li>
              </ul>
            </div>

            {/* Col 3: Contact Info */}
            <div className="md:col-span-3 text-right">
              <h4 className="text-white text-sm font-bold uppercase tracking-wider mb-4">تواصل معنا</h4>
              <ul className="space-y-3 text-sm">
                <li className="flex items-center gap-2 justify-end">
                  <a href="https://wa.me/201026046187" target="_blank" rel="noopener noreferrer" className="hover:text-white flex items-center gap-1.5 transition-colors">
                    <span>01026046187</span>
                    <FaWhatsapp className="w-4 h-4 text-emerald-500" />
                  </a>
                </li>
                <li className="flex items-center gap-2 justify-end">
                  <a href="mailto:moment.esam15@gmail.com" className="hover:text-white transition-colors">
                    moment.esam15@gmail.com
                  </a>
                </li>
              </ul>
            </div>

            {/* Col 4: Legal & Policy */}
            <div className="md:col-span-2 text-right">
              <h4 className="text-white text-sm font-bold uppercase tracking-wider mb-4">قانوني</h4>
              <ul className="space-y-2 text-sm">
                <li><span className="cursor-not-allowed hover:text-slate-500">سياسة الخصوصية</span></li>
                <li><span className="cursor-not-allowed hover:text-slate-500">الشروط والأحكام</span></li>
              </ul>
            </div>

          </div>

          <div className="border-t border-slate-800 pt-8 flex flex-col md:flex-row justify-between items-center text-xs text-slate-600 gap-4">
            <p className="order-2 md:order-1">
              © 2026 بسهولة. جميع الحقوق محفوظة.
            </p>
            <p className="order-1 md:order-2 flex gap-4">
              <span>بكل فخر في العالم العربي 🇪🇬</span>
            </p>
          </div>

        </div>
      </footer>

    </div>
  )
}
