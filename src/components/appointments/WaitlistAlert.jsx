import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { HiOutlineBell, HiOutlineCheckCircle } from 'react-icons/hi2'
import { FaWhatsapp } from 'react-icons/fa'
import { supabase } from '../../lib/supabase'
import { openWhatsApp } from '../../lib/whatsapp'
import { formatTime12 } from '../../utils/dateHelpers'

// The booking page puts a visitor on the waitlist for a whole day (it has no
// time to offer), so the match is by date and branch, not by time.
export default function WaitlistAlert({ appointment, businessId, onPromoted }) {
  const [waitlist, setWaitlist] = useState([])
  const [notified, setNotified] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!appointment?.appointment_date) return
    let q = supabase
      .from('appointments')
      .select('*')
      .eq('business_id', businessId)
      .eq('appointment_date', appointment.appointment_date)
      .eq('status', 'waitlist')
    if (appointment.branch_id) q = q.eq('branch_id', appointment.branch_id)
    q.order('created_at').then(({ data }) => setWaitlist(data || []))
  }, [appointment, businessId])

  // Frees the slot first (the double-booking guard would refuse the move
  // otherwise), then gives it to the first person waiting, then tells them.
  async function notifyFirst() {
    const first = waitlist[0]
    const time = appointment.appointment_time?.slice(0, 5)
    setBusy(true)
    try {
      const { error: cancelError } = await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', appointment.id)
      if (cancelError) throw cancelError
      const { error } = await supabase.from('appointments')
        .update({ status: 'confirmed', appointment_time: time })
        .eq('id', first.id)
      if (error) throw error
      const msg = `يا ${first.client_name}، اتفرج ميعاد يوم ${appointment.appointment_date} الساعة ${formatTime12(time)} وحجزناه ليك. لو مش مناسب ردّ على الرسالة دي.`
      openWhatsApp(first.client_phone, msg)
      setNotified(true)
      setWaitlist(prev => prev.slice(1))
      onPromoted?.()
    } catch (e) {
      toast.error(e?.message || 'تعذر نقل العميل من قائمة الانتظار')
    } finally {
      setBusy(false)
    }
  }

  if (notified) return (
    <div className="bg-accent-50 border border-accent-200 rounded-xl p-2.5 flex items-center gap-2 text-xs text-accent-700">
      <HiOutlineCheckCircle className="w-4 h-4 flex-shrink-0" />
      تم فتح واتساب للعميل الأول في قائمة الانتظار
    </div>
  )

  if (!waitlist.length) return null

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 text-xs text-amber-700">
        <HiOutlineBell className="w-3.5 h-3.5 flex-shrink-0" />
        <span><strong>{waitlist.length}</strong> في قائمة الانتظار</span>
      </div>
      <button type="button" onClick={notifyFirst} disabled={busy}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-500 hover:bg-accent-600 text-white text-xs font-semibold rounded-lg transition-colors">
        <FaWhatsapp className="w-3.5 h-3.5" />
        أبلّغ {waitlist[0]?.client_name}
      </button>
    </div>
  )
}
