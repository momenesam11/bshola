import { useState } from 'react'
import { FaWhatsapp } from 'react-icons/fa'
import Modal from '../ui/Modal'
import { useBusinessSummary } from '../../hooks/useAdmin'
import { attendanceRate, buildSummaryMessage } from '../../lib/monthlySummary'

function Stat({ label, value }) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className="text-lg font-bold text-gray-900 tabular-nums">{value}</p>
    </div>
  )
}

// The clinic's last 30 days, and the same numbers as a WhatsApp message to
// the doctor (migration 052). Mostly used just before a renewal.
export default function SummaryModal({ business, onClose }) {
  const { data: summary, isLoading, isError, error } = useBusinessSummary(business?.id)
  const [now] = useState(() => Date.now())
  if (!business) return null
  const phone = (business.owner_phone || business.phone || '').replace(/[^0-9]/g, '')
  const message = summary ? buildSummaryMessage(business, summary, now) : ''
  const rate = attendanceRate(summary)

  return (
    <Modal open onClose={onClose} title={`ملخص ${business.name}: آخر 30 يوم`} size="md">
      <div className="space-y-4" dir="rtl" data-testid="summary-modal">
        {isLoading && <p className="text-sm text-gray-400">جاري التحميل...</p>}
        {isError && <p className="text-sm text-red-600">{error?.message || 'تعذر تحميل الملخص'}. محتاج مايجريشن 052 وتحديث دالة admin.</p>}
        {summary && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Stat label="مواعيد" value={summary.appointments} />
              <Stat label="حجز أونلاين" value={summary.online_bookings} />
              <Stat label="نسبة الحضور" value={rate === null ? '—' : `${rate}%`} />
              <Stat label="تذكيرات اتبعتت" value={summary.reminders_sent} />
              <Stat label="مرضى جداد" value={summary.new_patients} />
              <Stat label="طلبات تقييم" value={summary.review_requests} />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">الرسالة اللي هتتبعت</p>
              <pre data-testid="summary-message" className="whitespace-pre-wrap text-sm text-gray-800 bg-gray-50 border border-gray-100 rounded-lg p-3 font-sans">{message}</pre>
            </div>
            {phone ? (
              <a
                href={`https://wa.me/${phone}?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-bold transition-colors"
              >
                <FaWhatsapp className="w-4 h-4" />
                ابعت الملخص للدكتور
              </a>
            ) : (
              <p className="text-sm text-amber-700">مفيش رقم للحساب ده.</p>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
