import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { subDays } from 'date-fns'
import { HiOutlineStar, HiOutlineCheck, HiOutlineChevronDown, HiOutlineChevronUp } from 'react-icons/hi2'
import { FaWhatsapp } from 'react-icons/fa'
import { supabase } from '../../lib/supabase'
import { openWhatsApp, formatDateArabic } from '../../lib/whatsapp'
import { useBranch } from '../../context/branchState'
import { toISODateString, todayISO } from '../../utils/dateHelpers'
import { REVIEW_WINDOW_DAYS, generateReviewRequestMessage, isReviewUrl, pickReviewCandidates } from '../../lib/reviews'

// Finished visits from the last few days whose patient was never asked for a
// Google review by this clinic (migration 051).
function useReviewCandidates(businessId) {
  return useQuery({
    queryKey: ['review-requests', businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data: visits, error } = await supabase
        .from('appointments')
        .select('id, client_name, client_phone, appointment_date, appointment_time, branch_id, review_requested_at, services(name)')
        .eq('business_id', businessId)
        .eq('status', 'completed')
        .gte('appointment_date', toISODateString(subDays(new Date(), REVIEW_WINDOW_DAYS)))
        .lte('appointment_date', todayISO())
      if (error) throw error
      const phones = [...new Set((visits || []).map(v => v.client_phone))]
      if (!phones.length) return []
      const { data: asked, error: askedError } = await supabase
        .from('appointments')
        .select('client_phone')
        .eq('business_id', businessId)
        .in('client_phone', phones)
        .not('review_requested_at', 'is', null)
      if (askedError) throw askedError
      return pickReviewCandidates(visits || [], (asked || []).map(a => a.client_phone))
    },
  })
}

export default function ReviewRequests({ business }) {
  const branchCtx = useBranch()
  const branchId = branchCtx?.currentBranch?.isAll ? null : branchCtx?.currentBranch?.id || null
  const { data: candidates = [] } = useReviewCandidates(business?.id)
  const [sentIds, setSentIds] = useState(new Set())
  const [busyId, setBusyId] = useState(null)
  const [collapsed, setCollapsed] = useState(false)

  const list = branchId ? candidates.filter(v => v.branch_id === branchId || !v.branch_id) : candidates
  if (!business || !list.length) return null
  const hasLink = isReviewUrl(business.google_review_url)
  const pending = list.filter(v => !sentIds.has(v.id)).length

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
    <div data-testid="review-requests" className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-4" dir="rtl">
      <div className="flex items-center justify-between px-5 py-4 cursor-pointer select-none" onClick={() => setCollapsed(c => !c)}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
            <HiOutlineStar className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-slate-800 text-sm">اطلب تقييم على جوجل</h2>
              {pending > 0 && (
                <span className="text-xs font-bold leading-none px-2 py-1 rounded-full bg-amber-500 text-white">{pending}</span>
              )}
            </div>
            <p className="text-xs text-slate-400">زيارات خلصت آخر {REVIEW_WINDOW_DAYS} أيام، وكل مريض بيتسأل مرة واحدة بس</p>
          </div>
        </div>
        {collapsed ? <HiOutlineChevronDown className="w-4 h-4 text-slate-400" /> : <HiOutlineChevronUp className="w-4 h-4 text-slate-400" />}
      </div>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-2 border-t border-slate-50 pt-3">
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
      )}
    </div>
  )
}
