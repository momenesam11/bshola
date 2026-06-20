import { useState } from 'react'
import { HiOutlineCalendarDays } from 'react-icons/hi2'
import PageWrapper from '../../components/layout/PageWrapper'
import AppointmentModal from '../../components/appointments/AppointmentModal'
import StatusBadge from '../../components/appointments/StatusBadge'
import Button from '../../components/ui/Button'
import { SkeletonList } from '../../components/ui/Skeleton'
import { useBusiness } from '../../hooks/useBusiness'
import { useAllAppointments } from '../../hooks/useAppointments'
import { useBranch } from '../../context/BranchContext'
import { getBranchColor } from '../../utils/constants'
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
  const branchCtx = useBranch()
  const isMultiBranch = !!branchCtx?.isMultiBranch
  const branches = branchCtx?.branches || []

  const filtered = statusFilter
    ? appointments.filter(a => a.status === statusFilter)
    : appointments

  function openEdit(appt) {
    setSelectedAppt(appt)
    setModalOpen(true)
  }

  return (
    <PageWrapper title="المواعيد">
      <div className="space-y-3 sm:space-y-0 sm:flex sm:flex-wrap sm:items-center sm:gap-3 mb-6">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:pb-0 sm:flex-wrap scrollbar-none">
          {STATUSES.map(s => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={`flex-shrink-0 px-4 py-2 sm:px-3 sm:py-1.5 rounded-lg text-sm font-medium transition-colors min-h-[40px] sm:min-h-0 ${
                statusFilter === s.value
                  ? 'bg-accent-500 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="sm:mr-auto">
          <Button onClick={() => { setSelectedAppt(null); setModalOpen(true) }} className="w-full sm:w-auto min-h-[44px] sm:min-h-0" size="sm">
            + موعد جديد
          </Button>
        </div>
      </div>

      {isLoading ? (
        <SkeletonList count={5} />
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-16 text-center">
          <HiOutlineCalendarDays className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-gray-500 mb-4">مفيش مواعيد دلوقتي</p>
          <Button onClick={() => { setSelectedAppt(null); setModalOpen(true) }}>
            إضافة أول موعد
          </Button>
        </div>
      ) : (
        <>
          {/* Desktop / tablet: table */}
          <div className="hidden md:block bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm table-fixed">
              <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-slate-500 w-[26%]">العميل</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-slate-500 w-[18%]">الخدمة</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-slate-500 w-[20%]">التاريخ والوقت</th>
                  {isMultiBranch && (
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-500 w-[16%]">الفرع</th>
                  )}
                  <th className="px-4 py-3 text-right text-sm font-semibold text-slate-500 w-[12%]">الحالة</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-slate-500 w-[8%]">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(appt => {
                  const branchColor = isMultiBranch ? getBranchColor(appt.branch_id, branches) : null
                  return (
                    <tr key={appt.id} className="hover:bg-gray-50 transition-colors align-middle">
                      <td className="px-4 py-3 align-middle">
                        <p className="font-medium text-gray-900 truncate">{appt.client_name}</p>
                        <p className="text-xs text-gray-400 truncate text-right" dir="ltr">{appt.client_phone}</p>
                      </td>
                      <td className="px-4 py-3 align-middle text-gray-600 truncate">{appt.services?.name || '—'}</td>
                      <td className="px-4 py-3 align-middle text-gray-600">
                        <p className="truncate">{formatDateAr(appt.appointment_date, 'd MMM yyyy')}</p>
                        <p className="text-xs text-gray-400 text-right" dir="ltr">{formatTime12(appt.appointment_time?.slice(0, 5))}</p>
                      </td>
                      {isMultiBranch && (
                        <td className="px-4 py-3 align-middle text-gray-600">
                          <span className="flex items-center gap-1.5 truncate">
                            {branchColor && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${branchColor.dot}`} />}
                            <span className="truncate">{appt.branches?.name || '—'}</span>
                          </span>
                        </td>
                      )}
                      <td className="px-4 py-3 align-middle"><StatusBadge status={appt.status} /></td>
                      <td className="px-4 py-3 align-middle">
                        <button
                          onClick={() => openEdit(appt)}
                          className="text-sm text-accent-600 hover:text-accent-700 font-medium"
                        >
                          تعديل
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: card list */}
          <div className="md:hidden space-y-3">
            {filtered.map(appt => {
              const branchColor = isMultiBranch ? getBranchColor(appt.branch_id, branches) : null
              return (
                <div
                  key={appt.id}
                  onClick={() => openEdit(appt)}
                  className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-2 cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-gray-900 truncate">{appt.client_name}</p>
                    <StatusBadge status={appt.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-y-1.5 text-sm">
                    <span className="text-gray-400">الخدمة</span>
                    <span className="text-gray-700 text-right truncate">{appt.services?.name || '—'}</span>
                    <span className="text-gray-400">التاريخ</span>
                    <span className="text-gray-700 text-right">{formatDateAr(appt.appointment_date, 'd MMM yyyy')}</span>
                    <span className="text-gray-400">الوقت</span>
                    <span className="text-gray-700 text-right" dir="ltr">{formatTime12(appt.appointment_time?.slice(0, 5))}</span>
                    {isMultiBranch && (
                      <>
                        <span className="text-gray-400">الفرع</span>
                        <span className="text-gray-700 text-right flex items-center justify-end gap-1.5 truncate">
                          {branchColor && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${branchColor.dot}`} />}
                          {appt.branches?.name || '—'}
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 text-right" dir="ltr">{appt.client_phone}</p>
                </div>
              )
            })}
          </div>
        </>
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
