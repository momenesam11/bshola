import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  HiOutlineArrowLeft,
  HiOutlineCalendar,
  HiOutlineExclamationTriangle,
  HiOutlineChartBar,
  HiOutlineLink,
  HiOutlineUsers,
  HiOutlineBuildingOffice2,
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
  HiCheck
} from 'react-icons/hi2'
import { FaWhatsapp } from 'react-icons/fa'

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
                  <circle cx="42" cy="45" r="7" fill="#0F2C4E" />
                  <circle cx="58" cy="45" r="7" fill="#16B89A" />
                  <path d="M38 58C42 62 48 62 52 58" stroke="#16B89A" strokeWidth="6" strokeLinecap="round" />
                </svg>
                <span className="text-2xl font-bold tracking-tight text-[#0F2C4E]">بسهولة</span>
              </Link>
            </div>

            {/* Nav Links Center */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" onClick={(e) => handleScrollTo(e, 'features')} className="text-sm font-medium text-[#0F2C4E]/80 hover:text-accent transition-colors">المميزات</a>
              <a href="#testimonials" onClick={(e) => handleScrollTo(e, 'testimonials')} className="text-sm font-medium text-[#0F2C4E]/80 hover:text-accent transition-colors">آراء العملاء</a>
              <a href="#pricing" onClick={(e) => handleScrollTo(e, 'pricing')} className="text-sm font-medium text-[#0F2C4E]/80 hover:text-accent transition-colors">الأسعار</a>
              <a href="#faq" onClick={(e) => handleScrollTo(e, 'faq')} className="text-sm font-medium text-[#0F2C4E]/80 hover:text-accent transition-colors">تواصل معنا</a>
            </div>

            {/* CTA Left */}
            <div className="hidden md:flex items-center gap-4">
              <Link to="/login" className="text-sm font-medium text-[#0F2C4E] hover:text-accent transition-colors">تسجيل الدخول</Link>
              <Link to="/register" className="bg-[#16B89A] hover:bg-accent-600 text-white text-sm font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-accent/20 transition-all hover:scale-102 active:scale-98">
                جرّب مجاناً
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <div className="md:hidden flex items-center">
              <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="text-[#0F2C4E] hover:text-accent p-2" aria-label="Toggle menu">
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

      {/* 2. HERO SECTION */}
      <section className="pt-28 pb-16 md:pt-36 md:pb-24 overflow-hidden bg-gradient-to-b from-[#D7F5EE]/40 via-white to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            
            {/* Right Column: Title & CTA */}
            <div className="lg:col-span-6 flex flex-col items-start text-right">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#D7F5EE] text-[#08594A] text-xs font-bold mb-6">
                <span className="text-base leading-none">🗓️</span>
                <span>نظام حجز ومتابعة عملاء بالواتساب لبيزنسي</span>
              </div>
              
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#0F2C4E] leading-tight mb-6">
                وقف خسارة الغياب.
                <br />
                <span className="text-[#16B89A]">خلي عملاءك يحجزوا، ويفكروا، ويرجعوا.</span>
              </h1>
              
              <p className="text-lg text-slate-500 mb-8 leading-relaxed max-w-xl">
                بسهولة هو نظام إدارة حجوزات وعملاء بالواتساب — للعيادات، الصالونات، مراكز اللياقة، والمزيد. جرّبه مجاناً 14 يوم بدون أي بطاقة بنكية.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto mb-8">
                <Link to="/register" className="inline-flex items-center justify-center gap-2 bg-[#16B89A] hover:bg-accent-600 text-white text-base font-bold px-8 py-4 rounded-2xl shadow-xl shadow-accent/25 transition-all hover:scale-102 active:scale-98">
                  <span>ابدأ تجربتك المجانية لمدة 14 يوم</span>
                  <HiOutlineArrowLeft className="w-5 h-5" />
                </Link>
                <a href="#features" onClick={(e) => handleScrollTo(e, 'features')} className="inline-flex items-center justify-center bg-white hover:bg-slate-50 text-[#0F2C4E] text-base font-semibold px-8 py-4 rounded-2xl border border-slate-200 transition-colors shadow-sm">
                  شوف إزاي بيشتغل
                </a>
              </div>
              
              {/* Trust Row */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-slate-400 font-medium border-t border-slate-100 pt-6 w-full lg:w-auto">
                <span className="flex items-center gap-1">✓ بدون بطاقة بنكية</span>
                <span className="flex items-center gap-1">✓ إعداد في 10 دقايق</span>
                <span className="flex items-center gap-1">✓ إلغاء في أي وقت</span>
              </div>
            </div>

            {/* Left Column: Stylized calendar mockup */}
            <div className="lg:col-span-6 relative flex justify-center items-center">
              
              {/* Decorative gradients behind mockup */}
              <div className="absolute -top-10 -right-10 w-72 h-72 bg-[#D7F5EE]/60 rounded-full blur-3xl -z-10" />
              <div className="absolute -bottom-10 -left-10 w-72 h-72 bg-blue-100/50 rounded-full blur-3xl -z-10" />

              {/* Main CSS Browser Calendar Mockup */}
              <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col">
                
                {/* Browser Header */}
                <div className="bg-slate-50 border-b border-slate-100 px-4 py-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-rose-400" />
                    <span className="w-3 h-3 rounded-full bg-amber-400" />
                    <span className="w-3 h-3 rounded-full bg-emerald-400" />
                  </div>
                  <div className="bg-white border border-slate-200 rounded-lg px-6 py-1 text-xs text-slate-400 font-medium select-none text-center truncate max-w-[200px]">
                    bessohola.com/booking
                  </div>
                  <div className="w-12" /> {/* spacing */}
                </div>

                {/* Calendar Workspace Mockup */}
                <div className="p-4 sm:p-5 bg-white flex flex-col gap-4">
                  {/* Calendar Top Controls */}
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-[#0F2C4E]">يونيو 2026</span>
                    <div className="flex gap-1.5">
                      <button className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-xs text-slate-500 font-bold" disabled>&lt;</button>
                      <button className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-xs text-slate-500 font-bold" disabled>&gt;</button>
                    </div>
                  </div>

                  {/* Calendar Grid header (RTL - Saturday to Friday) */}
                  <div className="grid grid-cols-7 gap-1 text-center border-b border-slate-100 pb-2">
                    {['سبت', 'أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة'].map((day) => (
                      <span key={day} className="text-xs font-bold text-slate-400">{day}</span>
                    ))}
                  </div>

                  {/* Calendar Grid cells */}
                  <div className="grid grid-cols-7 gap-1.5">
                    {/* Empty starting cells */}
                    <div className="aspect-square bg-slate-50/50 rounded-lg p-1 text-[10px] text-slate-300">٢٨</div>
                    <div className="aspect-square bg-slate-50/50 rounded-lg p-1 text-[10px] text-slate-300">٢٩</div>
                    <div className="aspect-square bg-slate-50/50 rounded-lg p-1 text-[10px] text-slate-300">٣٠</div>
                    
                    {/* Actual active calendar cells */}
                    <div className="aspect-square bg-slate-50 rounded-lg p-1 flex flex-col justify-between border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400">١</span>
                    </div>
                    
                    {/* Cell with Booking item */}
                    <div className="aspect-square bg-[#D7F5EE]/40 border border-[#8FE0CD] rounded-lg p-1 flex flex-col justify-between">
                      <span className="text-[10px] font-bold text-[#08594A]">٢</span>
                      <div className="bg-[#16B89A] text-white text-[7px] p-0.5 rounded text-center truncate font-bold">
                        أحمد كمال
                      </div>
                    </div>

                    <div className="aspect-square bg-slate-50 rounded-lg p-1 flex flex-col justify-between border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400">٣</span>
                    </div>

                    <div className="aspect-square bg-slate-50 rounded-lg p-1 flex flex-col justify-between border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400">٤</span>
                    </div>

                    {/* Another booking */}
                    <div className="aspect-square bg-[#E8EEF4] border border-blue-200 rounded-lg p-1 flex flex-col justify-between">
                      <span className="text-[10px] font-bold text-[#0F2C4E]">٥</span>
                      <div className="bg-[#0F2C4E] text-white text-[7px] p-0.5 rounded text-center truncate font-bold">
                        منى زكي
                      </div>
                    </div>

                    <div className="aspect-square bg-slate-50 rounded-lg p-1 flex flex-col justify-between border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400">٦</span>
                    </div>

                    {/* Active hover select demo */}
                    <div className="aspect-square bg-white border-2 border-dashed border-[#16B89A] rounded-lg p-1 flex flex-col justify-between relative cursor-pointer group">
                      <span className="text-[10px] font-bold text-accent">٧</span>
                      <div className="bg-accent/10 text-accent text-[8px] p-0.5 rounded text-center font-bold">
                        + متاح
                      </div>
                    </div>

                    <div className="aspect-square bg-slate-50 rounded-lg p-1 flex flex-col justify-between border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400">٨</span>
                    </div>
                    <div className="aspect-square bg-slate-50 rounded-lg p-1 flex flex-col justify-between border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400">٩</span>
                    </div>
                    <div className="aspect-square bg-slate-50 rounded-lg p-1 flex flex-col justify-between border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400">١٠</span>
                    </div>
                    <div className="aspect-square bg-slate-50 rounded-lg p-1 flex flex-col justify-between border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400">١١</span>
                    </div>
                  </div>

                  {/* Summary row */}
                  <div className="border-t border-slate-100 pt-3.5 flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-medium">الخدمات المفعلة: ٢</span>
                    <span className="text-[#0F2C4E] font-bold flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#16B89A]" />
                      استقبال الحجوزات مفتوح
                    </span>
                  </div>
                </div>

              </div>

              {/* Floating accent card overlapping (absolute position) */}
              <div className="absolute -bottom-6 -left-6 sm:left-4 bg-white rounded-xl shadow-xl border border-slate-100 p-4 flex items-center gap-3 animate-bounce-slow max-w-[200px]">
                <div className="w-10 h-10 rounded-full bg-[#D7F5EE] flex items-center justify-center text-xl">
                  📅
                </div>
                <div>
                  <div className="text-xs text-slate-400 font-bold">حالة اليوم</div>
                  <div className="text-sm font-black text-[#0F2C4E]">12 موعد اليوم</div>
                </div>
              </div>

            </div>

          </div>
        </div>
      </section>

      {/* 3. SOCIAL PROOF STRIP */}
      <section className="py-8 bg-slate-50 border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">
            بُني خصيصاً لاحتياجات السوق المصري والعربي
          </p>
          <div className="flex flex-wrap justify-center items-center gap-8 sm:gap-12 md:gap-16 text-slate-500 text-sm font-medium">
            <span className="flex items-center gap-2">
              <HiOutlineHeart className="w-5 h-5 text-[#0F2C4E]/60" /> عيادات ومراكز طبية
            </span>
            <span className="flex items-center gap-2">
              <HiOutlineScissors className="w-5 h-5 text-[#0F2C4E]/60" /> صالونات ومراكز تجميل
            </span>
            <span className="flex items-center gap-2">
              <HiOutlineBolt className="w-5 h-5 text-[#0F2C4E]/60" /> أندية وصالات رياضية
            </span>
            <span className="flex items-center gap-2">
              <HiOutlineAcademicCap className="w-5 h-5 text-[#0F2C4E]/60" /> أكاديميات ومراكز تعليمية
            </span>
          </div>
        </div>
      </section>

      {/* 4. PROBLEM/PAIN SECTION */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-black text-[#0F2C4E] mb-4">بتعرف الإحساس ده؟</h2>
            <div className="w-16 h-1 bg-rose-400 mx-auto rounded-full" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            
            {/* Card 1 */}
            <FadeIn delay={100}>
              <div className="bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-100 transition-all duration-300 hover:shadow-lg flex flex-col h-full text-right">
                <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center text-rose-500 mb-6">
                  <HiOutlineCalendar className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-[#0F2C4E] mb-3">مواعيد فوضى على واتساب</h3>
                <p className="text-slate-500 leading-relaxed text-sm">
                  كل حجز يدوي، وأي تعارض بيكلفك وقت وعملاء
                </p>
              </div>
            </FadeIn>

            {/* Card 2 */}
            <FadeIn delay={200}>
              <div className="bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-100 transition-all duration-300 hover:shadow-lg flex flex-col h-full text-right">
                <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500 mb-6">
                  <HiOutlineExclamationTriangle className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-[#0F2C4E] mb-3">غياب بيخسرك فلوس</h3>
                <p className="text-slate-500 leading-relaxed text-sm">
                  عميل بينسى الموعد، والوقت يضيع من غير أي إيراد
                </p>
              </div>
            </FadeIn>

            {/* Card 3 */}
            <FadeIn delay={300}>
              <div className="bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-100 transition-all duration-300 hover:shadow-lg flex flex-col h-full text-right">
                <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 mb-6">
                  <HiOutlineChartBar className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-[#0F2C4E] mb-3">مفيش بيانات تساعدك تقرر</h3>
                <p className="text-slate-500 leading-relaxed text-sm">
                  مش عارف عملاءك الدائمين مين، ومين محتاج تتابعه
                </p>
              </div>
            </FadeIn>

          </div>
        </div>
      </section>

      {/* 5. SOLUTION / FEATURES SECTION */}
      <section id="features" className="py-20 bg-slate-50/50 border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-3xl font-black text-[#0F2C4E] mb-4">بسهولة بيحل ده كله</h2>
            <p className="text-lg text-slate-500">كل اللي تحتاجه لإدارة بيزنسك في مكان واحد</p>
            <div className="w-16 h-1 bg-[#16B89A] mx-auto rounded-full mt-4" />
          </div>

          <div className="flex flex-col gap-24">
            
            {/* Feature 1: Branded Booking Page */}
            <FadeIn>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
                <div className="lg:col-span-5 order-2 lg:order-1 flex justify-center">
                  {/* Visual Mockup */}
                  <div className="w-full max-w-[320px] bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden flex flex-col aspect-[9/16] relative">
                    <div className="h-6 bg-slate-800 flex items-center justify-center">
                      <span className="w-16 h-4 bg-slate-900 rounded-full" />
                    </div>
                    {/* Header */}
                    <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-white font-bold">ص</div>
                      <div>
                        <h4 className="text-sm font-bold text-[#0F2C4E]">صالون النخبة للتجميل</h4>
                        <p className="text-[10px] text-slate-400">فرع مصر الجديدة</p>
                      </div>
                    </div>
                    {/* Services list */}
                    <div className="p-4 flex flex-col gap-3 flex-grow overflow-y-auto">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">اختار الخدمة</span>
                      <div className="border border-slate-100 rounded-xl p-3 bg-white hover:border-accent transition-colors flex justify-between items-center">
                        <div>
                          <p className="text-xs font-bold text-[#0F2C4E]">قص وتصفيف كلاسيك</p>
                          <p className="text-[10px] text-slate-400">⏱️ ٣٠ دقيقة · ٧٥ جنيه</p>
                        </div>
                        <button className="bg-accent/10 text-accent font-bold text-xs px-3 py-1.5 rounded-lg">حجز</button>
                      </div>
                      <div className="border border-slate-100 rounded-xl p-3 bg-white flex justify-between items-center">
                        <div>
                          <p className="text-xs font-bold text-[#0F2C4E]">تنعيم وحلاقة ذقن</p>
                          <p className="text-[10px] text-slate-400">⏱️ ٢٠ دقيقة · ٥٠ جنيه</p>
                        </div>
                        <button className="bg-accent/10 text-accent font-bold text-xs px-3 py-1.5 rounded-lg">حجز</button>
                      </div>
                      
                      {/* Booking calendar sample inside phone */}
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mt-2">اختار الوقت المناسب</span>
                      <div className="flex gap-2 justify-center overflow-x-auto pb-1">
                        <span className="bg-[#D7F5EE] border border-accent text-accent font-bold text-[10px] px-2.5 py-1 rounded-lg text-center">السبت<br/>١٢ يونيو</span>
                        <span className="bg-slate-50 border border-slate-100 text-slate-500 text-[10px] px-2.5 py-1 rounded-lg text-center">الأحد<br/>١٣ يونيو</span>
                        <span className="bg-slate-50 border border-slate-100 text-slate-500 text-[10px] px-2.5 py-1 rounded-lg text-center">الإثنين<br/>١٤ يونيو</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="lg:col-span-7 order-1 lg:order-2 text-right">
                  <div className="w-12 h-12 rounded-xl bg-[#D7F5EE] flex items-center justify-center text-accent mb-6">
                    <HiOutlineLink className="w-6 h-6" />
                  </div>
                  <h3 className="text-2xl font-black text-[#0F2C4E] mb-4">صفحة حجز خاصة بيك</h3>
                  <p className="text-slate-500 text-base leading-relaxed mb-6">
                    رابط حجز بهويتك — شعارك، ألوانك، ومعلوماتك. عملاؤك يحجزوا في ثواني من أي مكان، بدون تطبيق.
                  </p>
                </div>
              </div>
            </FadeIn>

            {/* Feature 2: WhatsApp Reminder */}
            <FadeIn>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
                <div className="lg:col-span-7 text-right">
                  <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center text-[#16B89A] mb-6">
                    <FaWhatsapp className="w-7 h-7" />
                  </div>
                  <h3 className="text-2xl font-black text-[#0F2C4E] mb-4">تذكير واتساب أوتوماتيك</h3>
                  <p className="text-slate-500 text-base leading-relaxed mb-6">
                    قلل الغياب بتذكير عملاءك تلقائياً قبل موعدهم. النظام بيجهزلك الرسالة، وانت بس تضغط إرسال.
                  </p>
                </div>
                <div className="lg:col-span-5 flex justify-center">
                  {/* Visual Mockup: WhatsApp bubble */}
                  <div className="w-full max-w-[320px] bg-[#E5DDD5] rounded-3xl shadow-xl border border-slate-200 overflow-hidden flex flex-col aspect-[9/16] relative p-3">
                    {/* WhatsApp Top Header Bar */}
                    <div className="absolute top-0 left-0 right-0 bg-[#075E54] text-white px-4 py-2 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-300 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-bold">بسهولة للتأكيد</p>
                        <p className="text-[8px] text-emerald-300">متصل الآن</p>
                      </div>
                    </div>

                    <div className="flex-grow flex flex-col justify-end gap-3 pb-12 pt-10">
                      {/* WhatsApp message bubble */}
                      <div className="bg-[#DCF8C6] border border-slate-300/30 rounded-xl p-3 max-w-[90%] self-end shadow-sm text-right text-xs text-slate-800 relative">
                        <p className="font-bold mb-1 text-[#075E54]">تذكير بموعدك 📅</p>
                        <p className="mb-2">أهلاً أستاذ محمد، نود تذكيرك بموعد حجزك غداً في <span className="font-bold">صالون النخبة</span>.</p>
                        <p className="text-[10px] text-slate-600 bg-white/60 p-2 rounded-lg mb-2">
                          📌 <span className="font-bold">الخدمة:</span> حلاقة شعر كلاسيك<br/>
                          ⏰ <span className="font-bold">الموعد:</span> السبت ٥:٠٠ مساءً
                        </p>
                        <p>لتعديل الحجز أو الإلغاء، يرجى الضغط هنا: booking.me/r/159</p>
                        <span className="text-[8px] text-slate-400 absolute bottom-1 left-2">٩:٠٠ م ✓✓</span>
                      </div>

                      {/* Action Button inside App Mockup */}
                      <div className="bg-white rounded-xl shadow-lg border border-slate-100 p-2.5 flex items-center justify-between text-xs mx-4">
                        <span className="font-bold text-slate-500">الرسالة جاهزة للإرسال</span>
                        <button className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors">
                          <FaWhatsapp className="w-4 h-4" />
                          <span>إرسال</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </FadeIn>

            {/* Feature 3: Clients History */}
            <FadeIn>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
                <div className="lg:col-span-5 order-2 lg:order-1 flex justify-center">
                  {/* Visual Mockup: Client Profile Card */}
                  <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-100 p-5 flex flex-col gap-4">
                    {/* Header */}
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-[#D7F5EE] flex items-center justify-center font-bold text-accent text-lg">مح</div>
                      <div className="flex-grow">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-[#0F2C4E]">محمد علي كمال</h4>
                          <span className="bg-[#D7F5EE] text-[#08594A] text-[9px] px-2 py-0.5 rounded-full font-bold">عميل دائم ✨</span>
                        </div>
                        <p className="text-xs text-slate-400">الهاتف: 0106754xxxx</p>
                      </div>
                    </div>
                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-2 bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                      <div>
                        <div className="text-xs text-slate-400">الحجوزات</div>
                        <div className="text-base font-black text-[#0F2C4E]">١٨</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">الغياب</div>
                        <div className="text-base font-black text-rose-500">٠</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">المبيعات</div>
                        <div className="text-base font-black text-emerald-600">١٢٥٠ ج</div>
                      </div>
                    </div>
                    {/* Timeline logs */}
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">آخر الحجوزات</p>
                      <div className="flex flex-col gap-2">
                        <div className="flex justify-between items-center text-xs border-b border-slate-50 pb-2">
                          <span className="font-semibold text-[#0F2C4E]">قص وتصفيف كلاسيك</span>
                          <span className="text-slate-400">منذ يومين</span>
                        </div>
                        <div className="flex justify-between items-center text-xs border-b border-slate-50 pb-2">
                          <span className="font-semibold text-[#0F2C4E]">عناية بالوجه والماسك</span>
                          <span className="text-slate-400">١٢ مايو ٢٠٢٦</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="lg:col-span-7 order-1 lg:order-2 text-right">
                  <div className="w-12 h-12 rounded-xl bg-[#D7F5EE] flex items-center justify-center text-accent mb-6">
                    <HiOutlineUsers className="w-6 h-6" />
                  </div>
                  <h3 className="text-2xl font-black text-[#0F2C4E] mb-4">كل عميل وتاريخه في مكان واحد</h3>
                  <p className="text-slate-500 text-base leading-relaxed mb-6">
                    اعرف عملاءك الدائمين، مين محتاج متابعة، وكام مرة حجزوا — كل ده أوتوماتيك من غير ما تكتب حاجة.
                  </p>
                </div>
              </div>
            </FadeIn>

            {/* Feature 4: Multi Branch Management */}
            <FadeIn>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
                <div className="lg:col-span-7 text-right">
                  <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center text-accent mb-6">
                    <HiOutlineBuildingOffice2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-2xl font-black text-[#0F2C4E] mb-4">إدارة فروع متعددة</h3>
                  <p className="text-slate-500 text-base leading-relaxed mb-6">
                    عندك أكتر من فرع؟ ولا مشكلة. كل فرع بمواعيده وتقاريره، وانت تتابع الكل من حساب واحد.
                  </p>
                </div>
                <div className="lg:col-span-5 flex justify-center">
                  {/* Visual Mockup: Branch Switcher */}
                  <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-100 p-5 flex flex-col gap-4">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">لوحة التحكم الرئيسية</span>
                    <div className="border border-slate-100 rounded-xl p-3 bg-slate-50 flex justify-between items-center">
                      <span className="text-xs font-semibold text-slate-500">الفرع النشط حالياً</span>
                      <div className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-[#0F2C4E] font-bold flex items-center gap-2 shadow-sm cursor-pointer hover:border-accent">
                        <span>📍 فرع المعادي</span>
                        <HiChevronDown className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                    </div>

                    {/* Dropdown list mockup */}
                    <div className="border border-slate-100 rounded-xl overflow-hidden shadow-sm flex flex-col text-right">
                      <div className="p-2.5 bg-[#D7F5EE]/40 border-b border-slate-100 flex items-center justify-between text-xs text-[#08594A] font-bold">
                        <span>📍 فرع المعادي</span>
                        <HiCheck className="w-4 h-4 text-accent" />
                      </div>
                      <div className="p-2.5 bg-white border-b border-slate-100 flex items-center justify-between text-xs text-[#0F2C4E] font-medium hover:bg-slate-50 cursor-pointer">
                        <span>📍 فرع التجمع الخامس</span>
                        <span className="text-[9px] text-slate-400">نشط</span>
                      </div>
                      <div className="p-2.5 bg-white flex items-center justify-between text-xs text-[#0F2C4E] font-medium hover:bg-slate-50 cursor-pointer">
                        <span>📍 فرع مصر الجديدة</span>
                        <span className="text-[9px] text-slate-400">نشط</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </FadeIn>

          </div>
        </div>
      </section>

      {/* 6. HOW IT WORKS */}
      <section className="py-20 bg-white border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-black text-[#0F2C4E] mb-4">آلية التشغيل: بيزنسك شغال أوتوماتيك في 4 خطوات</h2>
            <p className="text-lg text-slate-500">نظام حجز ذكي ومتكامل مصمم خصيصاً ليسهل حياة أصحاب الأعمال وعملائهم</p>
            <div className="w-16 h-1 bg-accent mx-auto rounded-full mt-4" />
          </div>

          {/* Stepper Pipeline */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 relative">
            
            {/* Step 1 */}
            <div className="bg-[#F8FAFC] border border-slate-100 rounded-2xl p-6 relative hover:shadow-lg transition-shadow duration-300 flex flex-col h-full text-right">
              <span className="absolute -top-4 -right-4 w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center font-black shadow-md">١</span>
              <div className="w-12 h-12 rounded-xl bg-accent-50 flex items-center justify-center text-accent mb-6 mt-2">
                <HiOutlineWrenchScrewdriver className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#0F2C4E] mb-3">حدد نشاطك ومواعيدك</h3>
              <p className="text-slate-500 text-sm leading-relaxed">
                في دقيقتين بس، حدد تخصص نشاطك (عيادة، صالون، جيم)، ضيف خدماتك، وساعات عملك المتاحة.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-[#F8FAFC] border border-slate-100 rounded-2xl p-6 relative hover:shadow-lg transition-shadow duration-300 flex flex-col h-full text-right">
              <span className="absolute -top-4 -right-4 w-10 h-10 rounded-full bg-[#0F2C4E] text-white flex items-center justify-center font-black shadow-md">٢</span>
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-primary-700 mb-6 mt-2">
                <HiOutlineLink className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#0F2C4E] mb-3">شير لينك الحجز</h3>
              <p className="text-slate-500 text-sm leading-relaxed">
                انسخ رابط الحجز المخصص لمشروعك، وحطه في بايو إنستجرام، فيسبوك، أو ابعته لعملائك مباشرة.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-[#F8FAFC] border border-slate-100 rounded-2xl p-6 relative hover:shadow-lg transition-shadow duration-300 flex flex-col h-full text-right">
              <span className="absolute -top-4 -right-4 w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center font-black shadow-md">٣</span>
              <div className="w-12 h-12 rounded-xl bg-accent-50 flex items-center justify-center text-accent mb-6 mt-2">
                <HiOutlineCalendar className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#0F2C4E] mb-3">العميل يحجز تلقائي</h3>
              <p className="text-slate-500 text-sm leading-relaxed">
                عميلك هيفتح الرابط، يختار الخدمة والموعد اللي يناسبه، ويحجز في ثواني بدون تطبيق وبدون تعقيد.
              </p>
            </div>

            {/* Step 4 */}
            <div className="bg-[#F8FAFC] border border-slate-100 rounded-2xl p-6 relative hover:shadow-lg transition-shadow duration-300 flex flex-col h-full text-right">
              <span className="absolute -top-4 -right-4 w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center font-black shadow-md">٤</span>
              <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-500 mb-6 mt-2">
                <FaWhatsapp className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#0F2C4E] mb-3">تابع وذكّر على واتساب</h3>
              <p className="text-slate-500 text-sm leading-relaxed">
                النظام بيجهزلك رسائل التذكير بالموعد والتفاصيل. بضغطة واحدة بتبعت للعميل على الواتساب وتمنع غيابه تماماً.
              </p>
            </div>

          </div>

          <div className="mt-16 text-center">
            <Link to="/register" className="inline-flex items-center justify-center gap-2 bg-[#16B89A] hover:bg-accent-600 text-white text-base font-bold px-10 py-4 rounded-2xl shadow-xl shadow-accent/25 transition-all hover:scale-102 active:scale-98">
              <span>ابدأ دلوقتي مجاناً</span>
              <HiOutlineArrowLeft className="w-5 h-5" />
            </Link>
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
              <div key={i} className="bg-white border border-slate-100 hover:border-accent/40 rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-lg cursor-pointer">
                <div className="mb-4">
                  {v.icon}
                </div>
                <h3 className="text-base sm:text-lg font-bold text-[#0F2C4E]">
                  {v.title}
                </h3>
              </div>
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
            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 relative flex flex-col justify-between">
              <span className="text-5xl text-accent/20 absolute top-4 right-4 leading-none font-serif">“</span>
              <p className="text-slate-600 text-sm leading-relaxed mb-6 relative z-10 font-medium">
                "وفّرت ساعتين يومياً كنت بضيعهم في مكالمات الحجز وواتساب، وعملائي مبسوطين جداً بالسهولة. بلمحة واحدة في الصباح بعرف جدول يومي كامل."
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center font-bold text-rose-600 text-sm">أك</div>
                <div>
                  <h4 className="text-xs font-bold text-[#0F2C4E]">د. أحمد كمال</h4>
                  <p className="text-[10px] text-slate-400">طبيب أسنان - عيادة كمال</p>
                </div>
              </div>
            </div>

            {/* Testimonial 2 */}
            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 relative flex flex-col justify-between">
              <span className="text-5xl text-accent/20 absolute top-4 right-4 leading-none font-serif">“</span>
              <p className="text-slate-600 text-sm leading-relaxed mb-6 relative z-10 font-medium">
                "تذكير الواتساب قلل غياب العملاء لأقل من 5%. خطوة فارقة في شغلي، الحجوزات بتتحرك بسلاسة ومبقاش عندي أوقات ضايعة."
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center font-bold text-purple-600 text-sm">سج</div>
                <div>
                  <h4 className="text-xs font-bold text-[#0F2C4E]">سارة الجارحي</h4>
                  <p className="text-[10px] text-slate-400">صالون سارة للتجميل</p>
                </div>
              </div>
            </div>

            {/* Testimonial 3 */}
            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 relative flex flex-col justify-between">
              <span className="text-5xl text-accent/20 absolute top-4 right-4 leading-none font-serif">“</span>
              <p className="text-slate-600 text-sm leading-relaxed mb-6 relative z-10 font-medium">
                "النظام رائع وبيجمع كل حجوزات المشتركين في مكان واحد من غير فوضى. إضافة خدمات جديدة وحساب اشتراكات وتدريب سهل جداً."
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600 text-sm">كح</div>
                <div>
                  <h4 className="text-xs font-bold text-[#0F2C4E]">كابتن حازم</h4>
                  <p className="text-[10px] text-slate-400">مدرب صالة رياضية - FitZone</p>
                </div>
              </div>
            </div>

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

            {/* Offer 2: 3 Months */}
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

            {/* Offer 3: 6 Months */}
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
              <div key={idx} className="border border-slate-100 rounded-2xl overflow-hidden transition-all duration-300">
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
            ))}
          </div>

        </div>
      </section>

      {/* 10. FINAL CTA SECTION */}
      <section className="py-24 bg-[#0F2C4E] text-white text-center relative overflow-hidden">
        {/* Background glow effects */}
        <div className="absolute -top-24 -right-24 w-80 h-80 bg-accent/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl" />

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
              <p className="text-sm text-slate-500 leading-relaxed max-w-xs">
                تنظيم أسهل، عملاء أكثر
              </p>
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
