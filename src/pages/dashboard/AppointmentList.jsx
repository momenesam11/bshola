import { useState } from 'react'
import PageWrapper from '../../components/layout/PageWrapper'
import AppointmentModal from '../../components/appointments/AppointmentModal'
import StatusBadge from '../../components/appointments/StatusBadge'
import Button from '../../components/ui/Button'
import { SkeletonList } from '../../components/ui/Skeleton'
import { useBusiness } from '../../hooks/useBusiness'
import { useAllAppointments } from '../../hooks/useAppointments'
import { useBranch } from '../../context/BranchContext'
import { todayISO, formatDateAr, formatTime12 } from '../../utils/dateHelpers'

const STATUSES = [
  { value: '', label: 'الكل' },
  { value: 'confirmed', label: 'مؤكد' },
  { value: 'completed', label: 'مكتمل' },
  { value: 'cancelled', label: 'ملغي' },
  { value: 'no_show', label: 'لم يحضر' },
]

export default function AppointmentList() {
  const [statusFilter, setStatusFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedAppt, setSelectedAppt] = useState(null)
  const { data: business } = useBusiness()
  const { data: appointments = [], isLoading } = useAllAppointments(business?.id, { from: todayISO() })
  const isMultiBranch = !!useBranch()?.isMultiBranch

  const filtered = statusFilter
    ? appointments.filter(a => a.status === statusFilter)
    : appointments

  return (
    <PageWrapper title="المواعيد">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex gap-2 flex-wrap">
          {STATUSES.map(s => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === s.value
                  ? 'bg-accent-500 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="mr-auto">
          <Button size="sm" onClick={() => { setSelectedAppt(null); setModalOpen(true) }}>
            + موعد جديد
          </Button>
        </div>
      </div>

      {isLoading ? (
        <SkeletonList count={5} />
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-16 text-center">
          <p className="text-3xl mb-3">📅</p>
          <p className="text-gray-500 mb-4">مفيش مواعيد دلوقتي</p>
          <Button onClick={() => { setSelectedAppt(null); setModalOpen(true) }}>
            إضافة أول موعد
          </Button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">العميل</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">الخدمة</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">التاريخ والوقت</th>
                {isMultiBranch && <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">الفرع</th>}
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">الحالة</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(appt => (
                <tr key={appt.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{appt.client_name}</p>
                    <p className="text-xs text-gray-400" dir="ltr">{appt.client_phone}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{appt.services?.name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    <p>{formatDateAr(appt.appointment_date, 'd MMM yyyy')}</p>
                    <p className="text-xs text-gray-400" dir="ltr">{formatTime12(appt.appointment_time?.slice(0, 5))}</p>
                  </td>
                  {isMultiBranch && (
                    <td className="px-4 py-3 text-gray-600">{appt.branches?.name || '—'}</td>
                  )}
                  <td className="px-4 py-3"><StatusBadge status={appt.status} /></td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => { setSelectedAppt(appt); setModalOpen(true) }}
                      className="text-gray-400 hover:text-gray-600 text-xs"
                    >
                      تعديل
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AppointmentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        businessId={business?.id}
        appointment={selectedAppt}
      />
    </PageWrapper>
  )
}
