import { HiOutlineClock } from 'react-icons/hi2'
import { FaWhatsapp } from 'react-icons/fa'
import { supabase } from '../../lib/supabase'

const SUPPORT_WHATSAPP = '201021179969'

export default function TrialExpiredScreen() {
  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/95 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-accent-500 rounded-2xl mb-4 shadow-lg">
          <span className="text-white font-bold text-2xl">ب</span>
        </div>
        <HiOutlineClock className="w-16 h-16 text-amber-400 mx-auto mb-3" />
        <h1 className="text-xl font-bold text-gray-900">انتهت فترة التجربة المجانية</h1>
        <p className="text-gray-500 text-sm mt-2">لمتابعة استخدام Mawid وعدم فقدان بياناتك، تواصل معنا للاشتراك</p>
        <a
          href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent('أهلاً، حسابي انتهت تجربته وعايز أشترك في Mawid')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 w-full inline-flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-medium rounded-xl py-3 transition-colors"
        >
          <FaWhatsapp className="w-5 h-5" />
          تواصل معنا للاشتراك
        </a>
        <p className="text-xs text-gray-400 mt-4">بياناتك محفوظة وآمنة لمدة 30 يوم</p>
        <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-gray-600 mt-3 underline">
          تسجيل الخروج
        </button>
      </div>
    </div>
  )
}
