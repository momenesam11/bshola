import { HiOutlineExclamationTriangle, HiOutlineXMark } from 'react-icons/hi2'

const SUPPORT_WHATSAPP = '201021179969'

export default function TrialWarningBanner({ daysLeft, isPaid, onDismiss }) {
  return (
    <div className="w-full bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-center gap-3 text-sm" dir="rtl">
      <HiOutlineExclamationTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
      <span className="text-amber-800 font-medium">
        باقي {daysLeft} {daysLeft === 1 ? 'يوم' : 'أيام'} على انتهاء {isPaid ? 'اشتراكك' : 'تجربتك المجانية'}
      </span>
      <a
        href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(isPaid ? 'أهلاً، عايز أجدد اشتراكي في بسهولة' : 'أهلاً، عايز أعرف تفاصيل الاشتراك في بسهولة')}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-amber-700 font-semibold hover:underline"
      >
        تواصل معنا
      </a>
      <button onClick={onDismiss} className="text-amber-400 hover:text-amber-600 p-1">
        <HiOutlineXMark className="w-4 h-4" />
      </button>
    </div>
  )
}
