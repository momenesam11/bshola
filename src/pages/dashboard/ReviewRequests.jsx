import { useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { HiOutlineCheck } from 'react-icons/hi2'
import { FaWhatsapp } from 'react-icons/fa'
import { supabase } from '../../lib/supabase'
import { openWhatsApp, formatDateArabic } from '../../lib/whatsapp'
import { REVIEW_WINDOW_DAYS, generateReviewRequestMessage, isReviewUrl } from '../../lib/reviews'

// The "تقييم" tab of the dashboard's today card: finished visits to ask for a
// Google review (migration 051). `list` is already filtered to the branch.
export default function ReviewRequests({ business, list }) {
  const [sentIds, setSentIds] = useState(new Set())
  const [busyId, setBusyId] = useState(null)
  const hasLink = isReviewUrl(business.google_review_url)

  async function send(visit) {
    if (!openWhatsApp(visit.client_phone, generateReviewRequestMessage(visit, business))) {
      toast.error('المتصفح منع فتح واتساب — اسمح بالنوافذ المنبثقة وجرّب تاني')
      return
    }
    setBusyId(visit.id)
    try {
      const { error } = await supabase.from('appointments')
        .update({ review_requested_at: new Date().toISOString() }).eq('id', visit.id)
      if (error) throw error
      setSentIds(prev => new Set([...prev, visit.id]))
    } catch (e) {
      toast.error(e?.message || 'اتبعتت الرسالة بس ما اتسجلتش')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div data-testid="review-requests" className="space-y-2" dir="rtl">
      <p className="text-xs text-slate-400">زيارات خلصت آخر {REVIEW_WINDOW_DAYS} أيام، وكل مريض بيتسأل مرة واحدة بس</p>
      {!hasLink ? (
        <p className="text-sm text-slate-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
          عندك {list.length} {list.length === 1 ? 'مريض' : 'مرضى'} ممكن تطلب منهم تقييم. حط لينك التقييم بتاع جوجل الأول من{' '}
          <Link to="/settings?tab=reminders" className="font-semibold text-accent-700 underline">الإعدادات</Link>.
        </p>
      ) : list.map(v => {
        const sent = sentIds.has(v.id)
        return (
          <div key={v.id} data-testid="review-candidate"
            className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${sent ? 'bg-accent-50 border-accent-100' : 'bg-white border-slate-100'}`}>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-slate-900 break-words">{v.client_name}</p>
              <p className="text-xs text-slate-400">{[v.services?.name, formatDateArabic(v.appointment_date)].filter(Boolean).join(' · ')}</p>
            </div>
            {sent ? (
              <span className="flex items-center gap-1 text-xs font-semibold text-accent-600"><HiOutlineCheck className="w-4 h-4" /> اتبعت</span>
            ) : (
              <button onClick={() => send(v)} disabled={busyId === v.id}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-500 hover:bg-accent-600 text-white text-xs font-semibold rounded-xl transition-colors min-h-[36px] disabled:opacity-60">
                <FaWhatsapp className="w-3.5 h-3.5" />
                اطلب تقييم
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
