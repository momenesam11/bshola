import { useState } from 'react'
import { HiOutlinePlus } from 'react-icons/hi2'
import PageWrapper from '../../components/layout/PageWrapper'
import AppointmentModal from '../../components/appointments/AppointmentModal'
import MawidCalendar from '../../components/calendar/MawidCalendar'
import TomorrowReminders from './TomorrowReminders'
import { useBusiness } from '../../hooks/useBusiness'
import { toISODateString } from '../../utils/dateHelpers'

export default function Dashboard() {
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedTime, setSelectedTime] = useState(null)
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedAppt, setSelectedAppt] = useState(null)

  const { data: business } = useBusiness()
  const today = toISODateString(new Date())

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
      {business && (
        <TomorrowReminders businessId={business.id} business={business} />
      )}

      {business && (
        <MawidCalendar
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
