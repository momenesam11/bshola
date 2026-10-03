import toast from 'react-hot-toast'
import { FaWhatsapp } from 'react-icons/fa'
import { HiOutlineClipboardDocument } from 'react-icons/hi2'
import { referralLink } from '../../lib/growth/links'
import { REFERRAL_REWARD } from '../../lib/growth/constants'

/** Settings → account: the owner's personal referral link. */
export default function ReferralCard({ business }) {
  if (!business?.booking_slug) {
    return <p className="text-sm text-slate-500">حدّد رابط صفحة الحجز من تبويب «الهوية» الأول، وبعدها هيظهر لينك الترشيح بتاعك هنا.</p>
  }

  const link = referralLink(business.booking_slug)
  const message = `أنا بستخدم «بسهولة» لحجز المواعيد في ${business.name} — المرضى بيحجزوا من لينك والتذكير بيتبعت بضغطة زر. جرّبه 14 يوم ببلاش من هنا: ${link}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      toast.success('اللينك اتنسخ')
    } catch {
      toast.error('انسخ اللينك بإيدك')
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600 leading-relaxed">
        رشّح بسهولة لزميل: لو سجّل من اللينك ده واشترك، بتاخد <b>{REFERRAL_REWARD}</b>.
      </p>
      <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
        <span className="flex-1 min-w-0 truncate text-sm font-mono text-slate-700" dir="ltr">{link}</span>
        <button type="button" onClick={copy} className="text-slate-500 hover:text-slate-800 p-1" aria-label="نسخ اللينك">
          <HiOutlineClipboardDocument className="w-5 h-5" />
        </button>
      </div>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(message)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl"
      >
        <FaWhatsapp className="w-4 h-4" /> ابعته على واتساب
      </a>
    </div>
  )
}
