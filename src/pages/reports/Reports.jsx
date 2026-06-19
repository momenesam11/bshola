import { useState, useMemo } from 'react'
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, format } from 'date-fns'
import {
  HiOutlineCalendarDays,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineChartBarSquare,
  HiOutlineArrowDownTray,
  HiOutlineTableCells,
} from 'react-icons/hi2'
import { ar } from 'date-fns/locale'
import PageWrapper from '../../components/layout/PageWrapper'
import StatusBadge from '../../components/appointments/StatusBadge'
import { StatCard } from '../../components/ui/Card'
import { SkeletonStat, SkeletonList } from '../../components/ui/Skeleton'
import { useBusiness } from '../../hooks/useBusiness'
import { useAllAppointments } from '../../hooks/useAppointments'
import { toISODateString, formatDateAr, formatTime12 } from '../../utils/dateHelpers'

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
{/* Date Range */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6" dir="rtl">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex gap-2">
            {PRESETS.map(p => (
              <button key={p.key} onClick={() => applyPreset(p.key)}
                className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors min-h-[36px] ${preset === p.key ? 'bg-accent-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {p.label}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="flex gap-2 items-center flex-wrap">
              <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" />
              <span className="text-gray-400 text-sm">إلى</span>
              <input type="date" value={to} onChange={e => setTo(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" />
            </div>
          )}
          <button onClick={() => downloadCSV(appointments)} disabled={appointments.length === 0}
            className="mr-auto flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40 transition-colors">
            <HiOutlineArrowDownTray className="w-4 h-4" />
            تصدير CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
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
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden" dir="rtl">
        <div className="flex gap-2 p-4 border-b border-gray-50 flex-wrap items-center">
          {STATUS_FILTERS.map(s => (
            <button key={s.value} onClick={() => setStatusFilter(s.value)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors min-h-[32px] ${statusFilter === s.value ? 'bg-accent-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {s.label}
            </button>
          ))}
          <span className="mr-auto text-xs text-gray-400">{filtered.length} موعد</span>
        </div>

        {isLoading ? (
          <div className="p-4"><SkeletonList count={5} /></div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <HiOutlineTableCells className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">لا توجد بيانات في هذه الفترة</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {['العميل', 'الخدمة', 'التاريخ', 'الوقت', 'الحالة'].map(h => (
                    <th key={h} className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((appt, i) => (
                  <tr key={appt.id} className={`border-b border-slate-50 last:border-0 transition-colors hover:bg-slate-50/50 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-slate-900 text-sm">{appt.client_name}</p>
                      <p className="text-xs text-slate-400 font-mono mt-0.5" dir="ltr">{appt.client_phone}</p>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-600 whitespace-nowrap">{appt.services?.name || '—'}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-600 whitespace-nowrap">{formatDateAr(appt.appointment_date, 'd MMM yyyy')}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-600 whitespace-nowrap font-mono" dir="ltr">{formatTime12(appt.appointment_time?.slice(0, 5))}</td>
                    <td className="px-4 py-3.5"><StatusBadge status={appt.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageWrapper>
  )
}
