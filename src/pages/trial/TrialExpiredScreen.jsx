import { HiOutlineClock } from 'react-icons/hi2'
import { FaWhatsapp } from 'react-icons/fa'
import { supabase } from '../../lib/supabase'
import { SUPPORT_WHATSAPP } from '../../lib/support'

/** noTrial: the account came from a partner link with no trial (067), so it was never "expired". */
export default function TrialExpiredScreen({ noTrial = false }) {
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
        <h1 className="text-xl font-bold text-gray-900">{noTrial ? 'حسابك جاهز، فاضل التفعيل' : 'انتهت فترة التجربة المجانية'}</h1>
        <p className="text-gray-500 text-sm mt-2">
          {noTrial
            ? 'الحساب ده من غير فترة تجربة. كلّمنا عشان نفعّله، وكل اللي جهزته هيفضل زي ما هو.'
            : 'لمتابعة استخدام بسهولة وعدم فقدان بياناتك، تواصل معنا للاشتراك'}
        </p>
        <a
          href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(noTrial ? 'أهلاً، سجّلت في بسهولة وعايز أفعّل حسابي' : 'أهلاً، حسابي انتهت تجربته وعايز أشترك في بسهولة')}`}
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
