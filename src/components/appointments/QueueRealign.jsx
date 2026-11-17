import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { HiOutlineArrowsRightLeft } from 'react-icons/hi2'
import { FaWhatsapp } from 'react-icons/fa'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import { supabase } from '../../lib/supabase'
import { openWhatsApp, formatDateArabic, formatTimeArabic } from '../../lib/whatsapp'
import { renumberMessage } from '../../lib/queue'
import { invalidateAll } from '../../hooks/useAppointments'

// A clinic that books by turn changed its hours, and bookings made before
// still sit on the old start time with their own numbers (two number 1s in one
// period). queue_realign (061) lists them; this banner shows who moves and how
// their number changes, moves them on the clinic's say-so, and then offers a
// WhatsApp to each patient whose number changed.

const hm = (t) => String(t || '').slice(0, 5)

// Only a patient still waiting needs to hear their new number (063 moves done
// visits and no-shows too, so the period is numbered once).
const waiting = (r) => r.status === 'confirmed' && !r.called_at
const STATUS_LABEL = { completed: 'خلص', no_show: 'ما جاش' }
const statusLabel = (r) => (r.status === 'confirmed' && r.called_at ? 'جوه' : STATUS_LABEL[r.status] || null)

function useRealignPlan(business) {
  const enabled = !!business?.id && business.booking_mode === 'queue'
  return useQuery({
    // Under 'appointments', so any booking change refreshes it.
    queryKey: ['appointments', business?.id, 'realign'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('queue_realign', { p_business_id: business.id, p_apply: false })
      // Before 061 runs the function doesn't exist: nothing to offer.
      if (error) return []
      return data || []
    },
  })
}

export default function QueueRealign({ business }) {
  const qc = useQueryClient()
  const { data: plan = [] } = useRealignPlan(business)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const [sent, setSent] = useState(() => new Set())

  const moving = plan.filter(r => hm(r.old_time) !== hm(r.new_time))
  if (!moving.length && !done) return null
  const oldTimes = [...new Set(moving.map(r => formatTimeArabic(hm(r.old_time))))]

  async function apply() {
    setBusy(true)
    try {
      const { data, error } = await supabase.rpc('queue_realign', { p_business_id: business.id, p_apply: true })
      if (error) throw error
      const changed = (data || []).filter(r => r.old_number !== r.new_number && waiting(r))
      invalidateAll(qc)
      toast.success('الحجوزات اتنقلت لفتراتها')
      setDone(changed)
    } catch (e) {
      toast.error(e?.message || 'تعذر النقل، جرّب تاني')
    } finally {
      setBusy(false)
    }
  }

  function tell(row) {
    const msg = renumberMessage(row, business, { date: formatDateArabic(row.appointment_date), time: formatTimeArabic(hm(row.new_time)) })
    if (!openWhatsApp(row.client_phone, msg)) {
      toast.error('المتصفح منع فتح واتساب — اسمح بالنوافذ المنبثقة وجرّب تاني')
      return
    }
    setSent(s => new Set([...s, row.id]))
  }

  function close() {
    setOpen(false)
    setDone(null)
    setSent(new Set())
  }

  return (
    <>
      {moving.length > 0 && (
        <div data-testid="realign-banner" dir="rtl"
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-3 mb-3">
          <p className="text-sm text-amber-900">
            <b>{moving.length === 1 ? 'حجز واحد' : `${moving.length} حجوزات`}</b> على ساعة مش بداية فترة ({oldTimes.join('، ')}).
            غالبًا ساعات الشغل اتغيرت بعد ما اتحجزوا، فأرقامهم مكررة مع الفترة.
          </p>
          <button onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 px-3 h-10 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold">
            <HiOutlineArrowsRightLeft className="w-4 h-4" /> انقلهم لفتراتهم
          </button>
        </div>
      )}

      <Modal open={open || !!done} onClose={close} title={done ? 'اتنقلوا' : 'نقل الحجوزات لفتراتها'} size="md">
        {!done ? (
          <div className="space-y-3" dir="rtl" data-testid="realign-plan">
            <p className="text-sm text-slate-600">
              كل فترة هتترقّم مرة واحدة: اللي خلصوا الأول بترتيب دخولهم، وبعدهم اللي جوه، وبعدهم المستنيين بترتيب الحجز، و«ما جاش» في الآخر. دول اللي هيتغير ميعادهم أو رقمهم:
            </p>
            <div className="max-h-[50vh] overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-xl">
              {plan.map(r => (
                <div key={r.id} data-testid="realign-row" className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 break-words">
                      {r.client_name}
                      {statusLabel(r) && <span className="mr-1.5 text-[11px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{statusLabel(r)}</span>}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDateArabic(r.appointment_date)}
                      {hm(r.old_time) !== hm(r.new_time) && <> · الساعة {formatTimeArabic(hm(r.old_time))} ← {formatTimeArabic(hm(r.new_time))}</>}
                    </p>
                  </div>
                  <span className={`text-sm font-bold tabular-nums flex-shrink-0 ${r.old_number !== r.new_number ? 'text-amber-700' : 'text-slate-500'}`}>
                    {r.old_number === r.new_number ? `رقم ${r.new_number}` : `رقم ${r.old_number} ← ${r.new_number}`}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500">اللي لسه مستني ورقمه هيتغير، هتقدري تبعتيله رسالة واتساب بعد النقل على طول.</p>
            <div className="flex gap-2">
              <Button onClick={apply} loading={busy} className="flex-1">انقلهم</Button>
              <Button variant="secondary" onClick={close} className="flex-1">مش دلوقتي</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3" dir="rtl" data-testid="realign-done">
            {done.length === 0 ? (
              <p className="text-sm text-slate-600">اتنقلوا من غير ما رقم حد يتغير.</p>
            ) : (
              <>
                <p className="text-sm text-slate-600">دول لسه مستنيين ورقمهم اتغير، ابعتلهم الرقم الجديد:</p>
                <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl">
                  {done.map(r => (
                    <div key={r.id} data-testid="realign-changed" className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 text-sm break-words">{r.client_name}</p>
                        <p className="text-xs text-slate-500">رقم {r.old_number} ← <b className="text-slate-800">{r.new_number}</b> · {formatDateArabic(r.appointment_date)}</p>
                      </div>
                      <button onClick={() => tell(r)} title="ابعتله رقمه الجديد" aria-label={`ابعت لـ${r.client_name} رقمه الجديد`}
                        className={`flex items-center gap-1 px-3 h-9 rounded-lg text-xs font-semibold flex-shrink-0 ${sent.has(r.id) ? 'bg-green-50 text-green-700' : 'bg-green-500 text-white hover:bg-green-600'}`}>
                        <FaWhatsapp className="w-4 h-4" /> {sent.has(r.id) ? 'اتبعت' : 'ابعت'}
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
            <Button variant="secondary" onClick={close} className="w-full">تمام</Button>
          </div>
        )}
      </Modal>
    </>
  )
}
