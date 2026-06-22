import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { HiOutlineCalendarDays, HiOutlineMagnifyingGlass, HiOutlineXMark, HiOutlineAdjustmentsHorizontal, HiOutlineChevronDown } from 'react-icons/hi2'
import PageWrapper from '../../components/layout/PageWrapper'
import AppointmentModal from '../../components/appointments/AppointmentModal'
import StatusBadge from '../../components/appointments/StatusBadge'
import Button from '../../components/ui/Button'
import Dropdown from '../../components/ui/Dropdown'
import DatePicker from '../../components/ui/DatePicker'
import { SkeletonList } from '../../components/ui/Skeleton'
import { useBusiness, useServices } from '../../hooks/useBusiness'
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
  const [search, setSearch] = useState('')
  const [moreOpen, setMoreOpen] = useState(false)
  const [dateFrom, setDateFrom] = useState(todayISO())
  const [dateTo, setDateTo] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [serviceFilter, setServiceFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedAppt, setSelectedAppt] = useState(null)
  const { data: business } = useBusiness()
  const { data: appointments = [], isLoading } = useAllAppointments(business?.id, {
    from: dateFrom || undefined,
    to: dateTo || undefined,
  })
  const { data: services = [] } = useServices(business?.id)
  const branchCtx = useBranch()
  const isMultiBranch = !!branchCtx?.isMultiBranch
  const branches = branchCtx?.branches || []

  const filtered = appointments.filter(a => {
    if (statusFilter && a.status !== statusFilter) return false
    if (branchFilter && a.branch_id !== branchFilter) return false
    if (serviceFilter && a.service_id !== serviceFilter) return false
    if (search) {
      const q = search.trim().toLowerCase()
      const matchesName = a.client_name?.toLowerCase().includes(q)
      const matchesPhone = a.client_phone?.includes(search.trim())
      if (!matchesName && !matchesPhone) return false
    }
    return true
  })

  const extraFilterCount = [dateFrom !== todayISO(), !!dateTo, !!branchFilter, !!serviceFilter].filter(Boolean).length
  const hasActiveFilters = statusFilter || search || extraFilterCount > 0

  function clearFilters() {
    setStatusFilter('')
    setSearch('')
    setDateFrom(todayISO())
    setDateTo('')
    setBranchFilter('')
    setServiceFilter('')
  }

  function openEdit(appt) {
    setSelectedAppt(appt)
    setModalOpen(true)
  }

  return (
    <PageWrapper title="المواعيد">
      <Helmet>
        <title>المواعيد — بسهولة</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="space-y-3 mb-6">
        {/* Search + new appointment */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 sm:max-w-xs">
            <HiOutlineMagnifyingGlass className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ابحث باسم العميل أو رقمه..."
              className="w-full border border-gray-200 rounded-xl pr-9 pl-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 bg-white min-h-[44px] sm:min-h-0"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <HiOutlineXMark className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="sm:mr-auto">
            <Button onClick={() => { setSelectedAppt(null); setModalOpen(true) }} className="w-full sm:w-auto min-h-[44px] sm:min-h-0" size="sm">
              + موعد جديد
            </Button>
          </div>
        </div>

        {/* Status tabs + advanced filters toggle */}
        <div className="flex items-center gap-2">
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 flex-1 scrollbar-none">
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
          <button
            onClick={() => setMoreOpen(o => !o)}
            className={`relative flex-shrink-0 flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg text-sm font-medium transition-colors min-h-[40px] sm:min-h-0 ${
              moreOpen || extraFilterCount > 0
                ? 'bg-accent-50 text-accent-700 border border-accent-200'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <HiOutlineAdjustmentsHorizontal className="w-4 h-4" />
            <span className="hidden sm:block">فلاتر أكتر</span>
            {extraFilterCount > 0 && (
              <span className="w-5 h-5 flex items-center justify-center rounded-full bg-accent-500 text-white text-[11px] font-bold">
                {extraFilterCount}
              </span>
            )}
            <HiOutlineChevronDown className={`w-3.5 h-3.5 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Advanced filters panel: date range + branch + service */}
        {moreOpen && (
          <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">من تاريخ</label>
                <DatePicker value={dateFrom} onChange={setDateFrom} />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">إلى تاريخ</label>
                <DatePicker value={dateTo} onChange={setDateTo} placeholder="بدون حد" />
              </div>
              {isMultiBranch && (
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">الفرع</label>
                  <Dropdown
                    value={branchFilter}
                    onChange={setBranchFilter}
                    placeholder="كل الفروع"
                    options={[{ value: '', label: 'كل الفروع' }, ...branches.map(b => ({ value: b.id, label: b.name }))]}
                  />
                </div>
              )}
              {services.length > 0 && (
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">الخدمة</label>
                  <Dropdown
                    value={serviceFilter}
                    onChange={setServiceFilter}
                    placeholder="كل الخدمات"
                    options={[{ value: '', label: 'كل الخدمات' }, ...services.map(svc => ({ value: svc.id, label: svc.name }))]}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {hasActiveFilters && (
          <button onClick={clearFilters} className="text-sm text-accent-600 hover:text-accent-700 font-medium">
            إلغاء كل الفلاتر
          </button>
        )}
      </div>

      {isLoading ? (
        <SkeletonList count={5} />
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-16 text-center">
          <HiOutlineCalendarDays className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          {hasActiveFilters ? (
            <>
              <p className="text-gray-500 mb-4">لا توجد مواعيد مطابقة لهذا البحث</p>
              <Button variant="secondary" onClick={clearFilters}>إلغاء الفلاتر</Button>
            </>
          ) : (
            <>
              <p className="text-gray-500 mb-4">مفيش مواعيد دلوقتي</p>
              <Button onClick={() => { setSelectedAppt(null); setModalOpen(true) }}>
                إضافة أول موعد
              </Button>
            </>
          )}
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
