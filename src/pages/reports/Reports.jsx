import { useState, useMemo } from 'react'
import { Helmet } from 'react-helmet-async'
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, format } from 'date-fns'
import {
  HiOutlineCalendarDays,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineChartBarSquare,
  HiOutlineArrowDownTray,
  HiOutlineTableCells,
  HiOutlinePrinter,
} from 'react-icons/hi2'
import { ar } from 'date-fns/locale'
import PageWrapper from '../../components/layout/PageWrapper'
import StatusBadge from '../../components/appointments/StatusBadge'
import { StatCard } from '../../components/ui/Card'
import DatePicker from '../../components/ui/DatePicker'
import { SkeletonStat, SkeletonList } from '../../components/ui/Skeleton'
import { useBusiness } from '../../hooks/useBusiness'
import { useAllAppointments } from '../../hooks/useAppointments'
import { useClients } from '../../hooks/useClients'
import { toISODateString, formatDateAr, formatTime12 } from '../../utils/dateHelpers'
import PrintableReport from './PrintableReport'

const PRESETS = [
  { label: 'هذا الأسبوع', key: 'week' },
  { label: 'هذا الشهر', key: 'month' },
  { label: 'مخصص', key: 'custom' },
]

const STATUS_FILTERS = [
  { value: '', label: 'الكل' },
  { value: 'confirmed', label: 'مؤكد' },
  { value: 'completed', label: 'مكتمل' },
  { value: 'cancelled', label: 'ملغي' },
  { value: 'no_show', label: 'لم يحضر' },
]

function downloadCSV(appointments) {
  const headers = ['الاسم', 'الهاتف', 'الخدمة', 'التاريخ', 'الوقت', 'الحالة']
  const rows = appointments.map(a => [
    a.client_name,
    a.client_phone,
    a.services?.name || '',
    a.appointment_date,
    a.appointment_time?.slice(0, 5) || '',
    a.status,
  ])
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `مواعيد-${format(new Date(), 'yyyy-MM-dd')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function Reports() {
  const today = new Date()
  const [preset, setPreset] = useState('month')
  const [from, setFrom] = useState(toISODateString(startOfMonth(today)))
  const [to, setTo] = useState(toISODateString(endOfMonth(today)))
  const [statusFilter, setStatusFilter] = useState('')

  const { data: business } = useBusiness()
  const { data: appointments = [], isLoading } = useAllAppointments(business?.id, { from, to })
  const { data: allClients = [] } = useClients(business?.id)
  const bookingUrl = business ? `${window.location.origin}/book/${business.booking_slug || business.id}` : ''
  const visitCountByPhone = useMemo(() => {
    const map = {}
    for (const c of allClients) map[c.phone] = c.visits
    return map
  }, [allClients])

  function applyPreset(key) {
    setPreset(key)
    if (key === 'week') {
      setFrom(toISODateString(startOfWeek(today, { weekStartsOn: 6 })))
      setTo(toISODateString(endOfWeek(today, { weekStartsOn: 6 })))
    } else if (key === 'month') {
      setFrom(toISODateString(startOfMonth(today)))
      setTo(toISODateString(endOfMonth(today)))
    }
  }

  const stats = useMemo(() => {
    const total = appointments.length
    const completed = appointments.filter(a => a.status === 'completed').length
    const cancelled = appointments.filter(a => a.status === 'cancelled').length
    const noShow = appointments.filter(a => a.status === 'no_show').length
    const attendanceRate = total > 0 ? Math.round((completed / total) * 100) : 0
    return { total, completed, cancelled, noShow, attendanceRate }
  }, [appointments])

  const filtered = statusFilter ? appointments.filter(a => a.status === statusFilter) : appointments

  return (
    <PageWrapper title="التقارير">
      <Helmet>
        <title>التقارير — بسهولة</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      {/* Hidden on screen, shown only when printing — see index.css .print-only */}
      <PrintableReport business={business} bookingUrl={bookingUrl} from={from} to={to} stats={stats} appointments={filtered} visitCountByPhone={visitCountByPhone} />

{/* Date Range */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6 no-print" dir="rtl">
        <div className="space-y-3 sm:space-y-0 sm:flex sm:flex-wrap sm:gap-3 sm:items-center">
          <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-4 px-4 sm:mx-0 sm:px-0 sm:overflow-visible scrollbar-none">
            {PRESETS.map(p => (
              <button key={p.key} onClick={() => applyPreset(p.key)}
                className={`flex-shrink-0 px-3 py-2 rounded-xl text-sm font-medium transition-colors min-h-[40px] sm:min-h-[36px] ${preset === p.key ? 'bg-accent-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {p.label}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="flex gap-2 items-center flex-wrap">
              <DatePicker value={from} onChange={setFrom} allowClear={false} className="w-40" />
              <span className="text-gray-400 text-sm">إلى</span>
              <DatePicker value={to} onChange={setTo} allowClear={false} className="w-40" />
            </div>
          )}
          <div className="flex gap-2 w-full sm:w-auto sm:mr-auto">
            <button onClick={() => downloadCSV(appointments)} disabled={appointments.length === 0}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40 transition-colors min-h-[44px] sm:min-h-0">
              <HiOutlineArrowDownTray className="w-4 h-4" />
              تصدير CSV
            </button>
            <button onClick={() => window.print()} disabled={appointments.length === 0}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-accent-500 text-white hover:bg-accent-600 disabled:opacity-40 transition-colors min-h-[44px] sm:min-h-0">
              <HiOutlinePrinter className="w-4 h-4" />
              تصدير PDF
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 no-print">
        {isLoading ? (
          <><SkeletonStat /><SkeletonStat /><SkeletonStat /><SkeletonStat /></>
        ) : (
          <>
            <StatCard label="إجمالي المواعيد" value={stats.total} Icon={HiOutlineCalendarDays} color="accent" />
            <StatCard label="الحضور" value={stats.completed} Icon={HiOutlineCheckCircle} color="blue" />
            <StatCard label="الغياب" value={stats.noShow} Icon={HiOutlineXCircle} color="orange" />
            <StatCard label="معدل الحضور" value={`${stats.attendanceRate}%`} Icon={HiOutlineChartBarSquare} color="accent" />
          </>
        )}
      </div>

      {/* Filter + Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden no-print" dir="rtl">
        <div className="flex items-center gap-2 p-4 border-b border-gray-50">
          <div className="flex gap-2 overflow-x-auto scrollbar-none no-print">
            {STATUS_FILTERS.map(s => (
              <button key={s.value} onClick={() => setStatusFilter(s.value)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors min-h-[36px] sm:min-h-[32px] ${statusFilter === s.value ? 'bg-accent-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {s.label}
              </button>
            ))}
          </div>
          <span className="mr-auto flex-shrink-0 text-xs text-gray-400">{filtered.length} موعد</span>
        </div>

        {isLoading ? (
          <div className="p-4"><SkeletonList count={5} /></div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <HiOutlineTableCells className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">لا توجد بيانات في هذه الفترة</p>
          </div>
        ) : (
          <>
            {/* Desktop / tablet: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full table-fixed">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-500 w-[24%]">العميل</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-500 w-[18%]">الخدمة</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-500 w-[18%]">التاريخ</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-500 w-[14%]">الوقت</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-500 w-[14%]">الحالة</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-slate-500 w-[12%]">إجمالي الزيارات</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((appt, i) => (
                    <tr key={appt.id} className={`border-b border-slate-50 last:border-0 transition-colors hover:bg-slate-50/50 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                      <td className="px-4 py-3.5 align-middle">
                        <p className="font-semibold text-slate-900 text-sm truncate">{appt.client_name}</p>
                        <p className="text-xs text-slate-400 font-mono mt-0.5 text-right" dir="ltr">{appt.client_phone}</p>
                      </td>
                      <td className="px-4 py-3.5 align-middle text-sm text-slate-600 truncate">{appt.services?.name || '—'}</td>
                      <td className="px-4 py-3.5 align-middle text-sm text-slate-600 truncate">{formatDateAr(appt.appointment_date, 'd MMM yyyy')}</td>
                      <td className="px-4 py-3.5 align-middle text-sm text-slate-600 font-mono text-right" dir="ltr">{formatTime12(appt.appointment_time?.slice(0, 5))}</td>
                      <td className="px-4 py-3.5 align-middle"><StatusBadge status={appt.status} /></td>
                      <td className="px-4 py-3.5 align-middle text-sm text-slate-600 text-center">{visitCountByPhone[appt.client_phone] || 1}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: card list — avoids horizontal scroll */}
            <div className="md:hidden divide-y divide-slate-50">
              {filtered.map(appt => (
                <div key={appt.id} className="px-4 py-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-slate-900 text-sm truncate">{appt.client_name}</p>
                    <StatusBadge status={appt.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-y-1 text-sm">
                    <span className="text-slate-400">الخدمة</span>
                    <span className="text-slate-700 text-right truncate">{appt.services?.name || '—'}</span>
                    <span className="text-slate-400">التاريخ</span>
                    <span className="text-slate-700 text-right">{formatDateAr(appt.appointment_date, 'd MMM yyyy')}</span>
                    <span className="text-slate-400">الوقت</span>
                    <span className="text-slate-700 text-right font-mono" dir="ltr">{formatTime12(appt.appointment_time?.slice(0, 5))}</span>
                    <span className="text-slate-400">إجمالي الزيارات</span>
                    <span className="text-slate-700 text-right">{visitCountByPhone[appt.client_phone] || 1}</span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono text-right" dir="ltr">{appt.client_phone}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </PageWrapper>
  )
}
