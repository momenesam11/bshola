import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  HiOutlineUserCircle,
  HiOutlinePhone,
  HiOutlineCalendarDays,
  HiOutlineClock,
  HiOutlineWrenchScrewdriver,
  HiOutlineMapPin,
} from 'react-icons/hi2'
import { FaWhatsapp } from 'react-icons/fa'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import { supabase } from '../../lib/supabase'
import { formatTime12, formatDateAr, todayISO } from '../../utils/dateHelpers'
import { invalidateAll } from '../../hooks/useAppointments'
import WaitlistAlert from '../appointments/WaitlistAlert'
import { generateConfirmationMessage, openWhatsApp } from '../../lib/whatsapp'
import { displayPhone } from '../../lib/countries'

export default function NotificationDetailModal({ open, onClose, notification, business }) {
  const qc = useQueryClient()
  const appointmentId = notification?.related_appointment_id
  const { data: appointment = null, isLoading: loading } = useQuery({
    queryKey: ['notification-appointment', appointmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('*, services(name), branches(name, address)')
        .eq('id', appointmentId)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: open && !!appointmentId,
  })

  function sendConfirmation() {
    const message = generateConfirmationMessage(appointment, business, appointment.branches)
    openWhatsApp(appointment.client_phone, message)
  }

  return (
    <Modal open={open} onClose={onClose} title="تفاصيل الإشعار" size="sm">
      <div dir="rtl" className="space-y-3">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />)}
          </div>
        ) : !appointment ? (
          <p className="text-sm text-slate-400 text-center py-6">تعذر العثور على تفاصيل هذا الموعد</p>
        ) : (
          <>
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-sm">
                <HiOutlineUserCircle className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="font-semibold text-slate-900">{appointment.client_name}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <HiOutlinePhone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="text-slate-600" dir="ltr">{displayPhone(appointment.client_phone) || appointment.client_phone}</span>
              </div>
              {appointment.services?.name && (
                <div className="flex items-center gap-2 text-sm">
                  <HiOutlineWrenchScrewdriver className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="text-slate-600">{appointment.services.name}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <HiOutlineCalendarDays className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="text-slate-600">{formatDateAr(appointment.appointment_date, 'd MMMM yyyy')}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <HiOutlineClock className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="text-slate-600" dir="ltr">{formatTime12(appointment.appointment_time?.slice(0, 5))}</span>
              </div>
              {appointment.branches?.name && (
                <div className="flex items-center gap-2 text-sm">
                  <HiOutlineMapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="text-slate-600">{appointment.branches.name}</span>
                </div>
              )}
            </div>

            {/* The patient cancelled from their link (054): offer the freed slot to the waitlist. */}
            {notification?.type === 'cancellation' && appointment.cancelled_by_patient_at && appointment.appointment_date >= todayISO() && (
              <WaitlistAlert appointment={appointment} businessId={appointment.business_id} onPromoted={() => invalidateAll(qc)} />
            )}

            {notification?.type === 'new_booking' && (
              <Button onClick={sendConfirmation} className="w-full flex items-center justify-center gap-2">
                <FaWhatsapp className="w-4 h-4" />
                إرسال رسالة تأكيد الحجز
              </Button>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
