import toast from 'react-hot-toast'
import { FaWhatsapp } from 'react-icons/fa'
import { HiOutlineClipboardDocument } from 'react-icons/hi2'
import { referralLink } from '../../lib/growth/links'
import { REFERRAL_REWARD } from '../../lib/growth/constants'
import { useMyReferrals } from '../../hooks/useGrowth'

/** Settings → account: the owner's personal referral link, and how it's going. */
export default function ReferralCard({ business }) {
  const { data: stats } = useMyReferrals(!!business?.booking_slug)

  if (!business?.booking_slug) {
    return <p className="text-sm text-slate-500">حدّد رابط صفحة الحجز من تبويب «الهوية» الأول، وبعدها هيظهر لينك الترشيح بتاعك هنا.</p>
  }

  const link = referralLink(business.booking_slug)
  const message = `أنا بستخدم «بسهولة» لحجز المواعيد في ${business.name}: المرضى بيحجزوا من لينك والتذكير بيتبعت بضغطة زر. جرّبه 14 يوم ببلاش من هنا: ${link}`

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
        رشّح بسهولة لزميل: لو سجّل من اللينك ده واشترك، بتاخد <b>{REFERRAL_REWARD}</b> بيتضاف لاشتراكك.
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
        className="inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl"
      >
        <FaWhatsapp className="w-4 h-4" /> ابعته على واتساب
      </a>
      {stats && (stats.signed_up > 0 || stats.free_days > 0) && (
        <dl className="grid grid-cols-3 gap-2 text-center pt-1">
          <div className="rounded-xl bg-slate-50 py-2">
            <dd className="text-lg font-bold tabular-nums text-slate-800">{stats.signed_up}</dd>
            <dt className="text-xs text-slate-500">سجّلوا</dt>
          </div>
          <div className="rounded-xl bg-slate-50 py-2">
            <dd className="text-lg font-bold tabular-nums text-slate-800">{stats.paid}</dd>
            <dt className="text-xs text-slate-500">اشتركوا</dt>
          </div>
          <div className="rounded-xl bg-accent-50 py-2">
            <dd className="text-lg font-bold tabular-nums text-accent-800">{stats.free_days}</dd>
            <dt className="text-xs text-slate-500">يوم مجاني اتضاف</dt>
          </div>
        </dl>
      )}
      {stats?.pending_rewards > 0 && (
        <p className="text-sm text-accent-700 font-semibold">عندك {stats.pending_rewards === 1 ? 'شهر مجاني' : `${stats.pending_rewards} شهور مجانية`} في الطريق، هيتضاف قريب.</p>
      )}
    </div>
  )
}
