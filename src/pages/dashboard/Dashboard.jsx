import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { HiOutlinePlus } from 'react-icons/hi2'
import PageWrapper from '../../components/layout/PageWrapper'
import AppointmentModal from '../../components/appointments/AppointmentModal'
import BesholaCalendar from '../../components/calendar/BesholaCalendar'
import TomorrowReminders from './TomorrowReminders'
import QueueBoard from './QueueBoard'
import { useBusiness } from '../../hooks/useBusiness'
import { toISODateString } from '../../utils/dateHelpers'

// A clinic that books by turn sees its periods and numbers first (QueueBoard);
// the calendar is one tap away. Clinics that book by time see the calendar.
const VIEW_KEY = 'beshola_dashboard_view'

function readView() {
  try { return localStorage.getItem(VIEW_KEY) || 'turns' } catch { return 'turns' }
}

export default function Dashboard() {
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedTime, setSelectedTime] = useState(null)
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedAppt, setSelectedAppt] = useState(null)
  const [view, setView] = useState(readView)

  const { data: business } = useBusiness()
  const today = toISODateString(new Date())
  const byTurn = business?.booking_mode === 'queue'

  function pickView(v) {
    setView(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* not remembered */ }
  }

  function handleApptClick(appt) {
    setSelectedAppt(appt)
    setSelectedTime(null)
    setSelectedDate(null)
    setModalOpen(true)
  }

  function handleNewAppt({ date, time }) {
    setSelectedAppt(null)
    setSelectedDate(date || today)
    setSelectedTime(time || null)
    setModalOpen(true)
  }

  return (
    <PageWrapper title="الرئيسية">
      <Helmet>
        <title>الرئيسية — بسهولة</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      {business && <TomorrowReminders businessId={business.id} business={business} />}

      {business && byTurn && (
        <div className="flex gap-1 bg-white border border-slate-100 rounded-2xl p-1 mb-3" role="tablist" dir="rtl">
          {[{ key: 'turns', label: 'الأدوار' }, { key: 'calendar', label: 'الكاليندر' }].map(t => (
            <button key={t.key} role="tab" aria-selected={view === t.key} onClick={() => pickView(t.key)}
              className={`flex-1 h-10 rounded-xl text-sm font-semibold transition-colors ${view === t.key ? 'bg-ink text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {business && byTurn && view === 'turns' && (
        <QueueBoard business={business} onOpen={handleApptClick} onNew={handleNewAppt} />
      )}

      {business && (!byTurn || view === 'calendar') && (
        <BesholaCalendar
          businessId={business.id}
          onApptClick={handleApptClick}
          onNewAppt={handleNewAppt}
        />
      )}

      <AppointmentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        businessId={business?.id}
        initialDate={selectedDate || today}
        initialTime={selectedTime}
        appointment={selectedAppt}
      />

      {/* Mobile FAB — right side, so it never overlaps the support button (bottom-left) */}
      <button
        onClick={() => handleNewAppt({ date: today })}
        className="md:hidden fixed bottom-[calc(env(safe-area-inset-bottom)+16px)] right-4 z-40 w-14 h-14 bg-accent-500 hover:bg-accent-600 text-white rounded-full shadow-lg flex items-center justify-center transition-colors active:scale-90"
        aria-label="إضافة موعد جديد"
      >
        <HiOutlinePlus className="w-7 h-7" />
      </button>
    </PageWrapper>
  )
}
