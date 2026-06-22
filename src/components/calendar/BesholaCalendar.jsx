import { useState, useEffect, useRef } from 'react'
import {
  format,
  addDays,
  subDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
} from 'date-fns'
import { ar } from 'date-fns/locale'
import {
  HiOutlineCalendarDays,
  HiOutlineViewColumns,
  HiOutlineTableCells,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlinePlus,
  HiOutlineUserCircle,
} from 'react-icons/hi2'
import {
  useAppointmentsForDay,
  useAppointmentsForWeek,
  useAppointmentsForMonth,
  useCalendarStats,
} from '../../hooks/useCalendar'
import { useBranch } from '../../context/BranchContext'
import { getBranchColor } from '../../utils/constants'
import { useNavigate } from 'react-router-dom'
import DatePicker from '../ui/DatePicker'

// Groups appointments by exact start time so simultaneous bookings (capacity
// > 1 branches, e.g. a salon with multiple chairs) render side-by-side
// instead of stacked on top of each other.
function withColumns(appts) {
  const groups = {}
  for (const a of appts) {
    const t = a.appointment_time?.slice(0, 5)
    if (!groups[t]) groups[t] = []
    groups[t].push(a)
  }
  return appts.map(a => {
    const t = a.appointment_time?.slice(0, 5)
    const group = groups[t]
    return { ...a, _col: group.indexOf(a), _cols: group.length }
  })
}

// ─── Constants ─────────────────────────────────────────────────────
const STATUS_BG = {
  confirmed: 'bg-accent-500',
  completed: 'bg-slate-500',
  cancelled: 'bg-red-500',
  no_show: 'bg-amber-500',
  waitlist: 'bg-primary-500',
}
const STATUS_LIGHT = {
  confirmed: 'bg-accent-50 border-accent-200 text-accent-800',
  completed: 'bg-slate-50 border-slate-200 text-slate-700',
  cancelled: 'bg-red-50 border-red-200 text-red-700',
  no_show: 'bg-amber-50 border-amber-200 text-amber-700',
  waitlist: 'bg-primary-50 border-primary-200 text-primary-700',
}

const AR_DAYS_SHORT = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س']
const AR_DAYS_FULL = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const WEEK_START = 6 // Saturday

const HOURS = Array.from({ length: 16 }, (_, i) => {
  const h = i + 7 // 7:00 → 22:00
  const label = h < 12 ? `${h}:00 ص` : h === 12 ? '12:00 م' : `${h - 12}:00 م`
  return { h, label, time: `${String(h).padStart(2, '0')}:00` }
})

function timeToMinutes(t) {
  const [h, m] = (t || '00:00').split(':').map(Number)
  return h * 60 + m
}

function minutesFromDayStart(time) {
  return timeToMinutes(time) - 7 * 60
}

// ─── Stats Bar ─────────────────────────────────────────────────────
function StatsBar({ businessId, branchId, startDate, endDate }) {
  const { data: stats } = useCalendarStats(businessId, branchId, startDate, endDate)
  if (!stats) return null

  const items = [
    { label: 'إجمالي', value: stats.total, color: 'text-slate-900' },
    { label: 'مؤكدة', value: stats.confirmed, color: 'text-accent-600' },
    { label: 'غيابات', value: stats.no_show, color: 'text-amber-600' },
    { label: 'الحضور', value: `${stats.attendanceRate}%`, color: 'text-primary-600' },
  ]

  return (
    <>
      {/* Desktop/tablet: 4-box grid */}
      <div className="hidden sm:grid grid-cols-4 gap-2 mb-4">
        {items.map(item => (
          <div key={item.label} className="bg-white rounded-xl border border-slate-100 p-3 text-center shadow-sm">
            <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Mobile: single-row scroll strip — lighter than a stacked 2x2 grid */}
      <div className="sm:hidden flex gap-2 overflow-x-auto pb-1 mb-4 scrollbar-none">
        {items.map(item => (
          <div key={item.label} className="flex-shrink-0 min-w-[88px] bg-white rounded-2xl border border-slate-100 px-4 py-3 text-center shadow-sm">
            <p className={`text-xl font-bold leading-none ${item.color}`}>{item.value}</p>
            <p className="text-xs text-slate-400 mt-1 whitespace-nowrap">{item.label}</p>
          </div>
        ))}
      </div>
    </>
  )
}

// ─── View Switcher ─────────────────────────────────────────────────
function ViewSwitcher({ view, onChange }) {
  const tabs = [
    { id: 'day', label: 'اليوم', Icon: HiOutlineCalendarDays },
    { id: 'week', label: 'الأسبوع', Icon: HiOutlineViewColumns },
    { id: 'month', label: 'الشهر', Icon: HiOutlineTableCells },
  ]
  return (
    <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
      {tabs.map(t => {
        const active = view === t.id
        const Icon = t.Icon
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
              active ? 'bg-accent-500 text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="hidden sm:block">{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ─── Mobile Date Strip — replaces day/week/month tabs on phones ────
function DateStrip({ date, onSelect }) {
  const containerRef = useRef(null)
  const days = Array.from({ length: 21 }, (_, i) => addDays(subDays(date, 10), i))

  useEffect(() => {
    const el = containerRef.current?.querySelector('[data-selected="true"]')
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [date])

  return (
    <div ref={containerRef} className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      {days.map(day => {
        const selected = isSameDay(day, date)
        const today = isToday(day)
        return (
          <button
            key={day.toString()}
            data-selected={selected}
            onClick={() => onSelect(day)}
            className={`flex-shrink-0 w-[50px] flex flex-col items-center gap-1 py-2.5 rounded-2xl transition-colors active:scale-95 ${
              selected
                ? 'bg-accent-500 text-white shadow-sm'
                : today
                  ? 'bg-accent-50 text-accent-700'
                  : 'bg-white border border-slate-100 text-slate-600'
            }`}
          >
            <span className="text-[11px] font-medium opacity-80 leading-none">{AR_DAYS_SHORT[day.getDay()]}</span>
            <span className="text-base font-bold leading-none">{format(day, 'd')}</span>
          </button>
        )
      })}
    </div>
  )
}

// ─── DAY VIEW ──────────────────────────────────────────────────────
function DayView({ businessId, branchId, date, onApptClick, onSlotClick, showBranch, colorByBranch, branches }) {
  const dateStr = format(date, 'yyyy-MM-dd')
  const { data: rawAppts = [], isLoading } = useAppointmentsForDay(businessId, branchId, dateStr)
  const appts = withColumns(rawAppts)
  const scrollRef = useRef(null)
  const navigate = useNavigate()
  const SLOT_H = 56 // px per 30 min

  const now = new Date()
  const nowMinutes = minutesFromDayStart(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)
  const nowTop = (nowMinutes / 30) * SLOT_H
  const isCurrentDay = isSameDay(date, now)

  // Scroll the inner grid only (never the outer page) to a sensible
  // starting point: "now" if today, otherwise the first appointment.
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    let target = 0
    if (isCurrentDay && nowTop >= 0) {
      target = nowTop - container.clientHeight / 2
    } else if (appts.length > 0) {
      const firstMinutes = minutesFromDayStart(appts[0].appointment_time?.slice(0, 5))
      target = (firstMinutes / 30) * SLOT_H - container.clientHeight / 3
    }
    container.scrollTop = Math.max(target, 0)
  }, [dateStr, isCurrentDay, nowTop, appts])

  function apptTop(appt) {
    return (minutesFromDayStart(appt.appointment_time?.slice(0, 5)) / 30) * SLOT_H
  }

  function apptHeight(appt) {
    const dur = appt.services?.duration_minutes || 30
    return Math.max((dur / 30) * SLOT_H, SLOT_H * 0.8)
  }

  const totalHeight = HOURS.length * 2 * SLOT_H // 2 slots per hour

  return (
    <div className="md:bg-white md:rounded-xl md:border md:border-slate-100 md:overflow-hidden">
      {/* Mobile: spaced cards instead of a dense divided list */}
      <div className="md:hidden">
        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-[72px] bg-slate-100 rounded-2xl animate-pulse" />)}</div>
        ) : appts.length === 0 ? (
          <div className="py-14 text-center bg-white rounded-2xl border border-slate-100">
            <HiOutlineCalendarDays className="w-10 h-10 text-slate-200 mx-auto mb-2" />
            <p className="text-slate-400 text-sm">لا مواعيد في هذا اليوم</p>
          </div>
        ) : (
          <div className="space-y-2">
            {appts.map(appt => (
              <div
                key={appt.id}
                className="flex items-center gap-3 bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3.5 active:bg-slate-50 transition-colors"
              >
                <div className={`w-1.5 h-12 rounded-full flex-shrink-0 ${STATUS_BG[appt.status]}`} />
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onApptClick(appt)}>
                  <p className="font-bold text-[15px] text-slate-900 truncate">{appt.client_name}</p>
                  <p className="text-sm text-slate-500 truncate mt-0.5">
                    {appt.services?.name}
                    {showBranch && appt.branches?.name && ` · ${appt.branches.name}`}
                  </p>
                </div>
                <span className="text-sm text-slate-500 font-mono font-medium flex-shrink-0 cursor-pointer" onClick={() => onApptClick(appt)}>
                  {appt.appointment_time?.slice(0, 5)}
                </span>
                <button
                  onClick={() => navigate(`/patients/${appt.client_phone}`)}
                  className="flex-shrink-0 w-9 h-9 rounded-xl bg-primary-50 active:bg-primary-100 flex items-center justify-center text-primary-500 transition-colors"
                  title="ملف المريض"
                >
                  <HiOutlineUserCircle className="w-[18px] h-[18px]" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Desktop: time grid */}
      {isLoading ? (
        <div className="hidden md:block p-4 space-y-2">{[1, 2, 3, 4].map(i => <div key={i} className="h-14 bg-slate-50 rounded-xl animate-pulse" />)}</div>
      ) : (
        <div ref={scrollRef} className="hidden md:flex overflow-y-auto" style={{ maxHeight: 520, scrollbarWidth: 'thin' }}>
          {/* Time column */}
          <div className="w-16 flex-shrink-0 border-l border-slate-100" style={{ height: totalHeight }}>
            {HOURS.map(({ h, label }) => (
              <div key={h} style={{ height: SLOT_H * 2 }} className="border-t border-slate-50 first:border-t-0 pt-1">
                <span className="text-xs text-slate-400 font-mono px-2">{label}</span>
              </div>
            ))}
          </div>

          {/* Slots column */}
          <div className="flex-1 relative" style={{ height: totalHeight }}>
            {/* Hour grid lines */}
            {HOURS.map(({ h }) => (
              <div
                key={h}
                className="absolute left-0 right-0 border-t border-slate-50"
                style={{ top: (h - 7) * 2 * SLOT_H }}
              />
            ))}

            {/* Empty slot hover zones */}
            {Array.from({ length: HOURS.length * 2 }, (_, i) => {
              const h = Math.floor(i / 2) + 7
              const m = i % 2 === 0 ? '00' : '30'
              const time = `${String(h).padStart(2, '0')}:${m}`
              return (
                <div
                  key={time}
                  onClick={() => onSlotClick(time, dateStr)}
                  className="absolute left-0 right-0 border-b border-dashed border-slate-50 hover:bg-accent-50 hover:border-accent-100 cursor-pointer transition-colors group flex items-center justify-end px-3"
                  style={{ top: i * SLOT_H, height: SLOT_H }}
                >
                  <HiOutlinePlus className="w-3.5 h-3.5 text-accent-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              )
            })}

            {/* Current time indicator */}
            {isCurrentDay && nowTop >= 0 && (
              <div
                className="absolute left-0 right-0 flex items-center z-10 pointer-events-none"
                style={{ top: nowTop }}
              >
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0 -mr-1.5" />
                <div className="flex-1 h-px bg-red-400" />
              </div>
            )}

            {/* Appointment blocks — laid out in columns when multiple bookings share the same start time */}
            {appts.map(appt => {
              const branchColor = colorByBranch ? getBranchColor(appt.branch_id, branches) : null
              return (
                <div
                  key={appt.id}
                  onClick={() => onApptClick(appt)}
                  className={`absolute rounded-xl border px-2 py-1.5 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-md z-20 overflow-hidden ${STATUS_LIGHT[appt.status]} ${branchColor ? `border-r-4 ${branchColor.border}` : ''}`}
                  style={{
                    top: apptTop(appt) + 2,
                    height: apptHeight(appt) - 4,
                    minHeight: 32,
                    right: `calc(${(appt._col / appt._cols) * 100}% + 4px)`,
                    width: `calc(${100 / appt._cols}% - 8px)`,
                  }}
                >
                  <p className="font-semibold text-xs leading-tight truncate">{appt.client_name}</p>
                  <p className="text-xs opacity-70 truncate">
                    {appt.services?.name}
                    {showBranch && appt.branches?.name && ` · ${appt.branches.name}`}
                  </p>
                  <p className="text-xs opacity-60 font-mono">{appt.appointment_time?.slice(0, 5)}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── WEEK VIEW ─────────────────────────────────────────────────────
function WeekView({ businessId, branchId, date, onApptClick, onSlotClick, onDayClick, showBranch, colorByBranch, branches }) {
  const weekStart = startOfWeek(date, { weekStartsOn: WEEK_START })
  const days = eachDayOfInterval({ start: weekStart, end: endOfWeek(date, { weekStartsOn: WEEK_START }) })
  const { data: appts = [] } = useAppointmentsForWeek(businessId, branchId, date)

  function getAppts(day) {
    const ds = format(day, 'yyyy-MM-dd')
    return appts.filter(a => a.appointment_date === ds)
  }

  return (
    <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
      <div className="min-w-[560px]">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-slate-100">
          {days.map(day => {
            const today = isToday(day)
            return (
              <div
                key={day.toString()}
                onClick={() => onDayClick(day)}
                className={`py-3 text-center cursor-pointer hover:bg-slate-50 transition-colors ${today ? 'bg-accent-50' : ''}`}
              >
                <p className="text-xs text-slate-400">{AR_DAYS_FULL[day.getDay()]}</p>
                <p className={`text-lg font-bold mt-0.5 ${today ? 'text-accent-600' : 'text-slate-800'}`}>
                  {format(day, 'd')}
                </p>
              </div>
            )
          })}
        </div>

        {/* Appointment chips */}
        <div className="grid grid-cols-7 min-h-[280px]">
          {days.map(day => {
            const today = isToday(day)
            const dayAppts = getAppts(day)
            const ds = format(day, 'yyyy-MM-dd')
            return (
              <div
                key={day.toString()}
                className={`p-2 border-l border-slate-50 last:border-0 ${today ? 'bg-accent-50/40' : ''}`}
              >
                <div className="space-y-1">
                  {dayAppts.map(appt => {
                    const branchColor = colorByBranch ? getBranchColor(appt.branch_id, branches) : null
                    return (
                      <div
                        key={appt.id}
                        onClick={() => onApptClick(appt)}
                        className={`px-2 py-1 rounded-lg text-xs cursor-pointer hover:opacity-80 transition-opacity border truncate ${STATUS_LIGHT[appt.status]} ${branchColor ? `border-r-4 ${branchColor.border}` : ''}`}
                      >
                        <span className="font-medium">{appt.client_name}</span>
                        <span className="text-[10px] block opacity-70">
                          {appt.appointment_time?.slice(0, 5)}
                          {showBranch && appt.branches?.name && ` · ${appt.branches.name}`}
                        </span>
                      </div>
                    )
                  })}
                  {dayAppts.length === 0 && (
                    <div
                      onClick={() => onSlotClick(null, ds)}
                      className="h-8 border-2 border-dashed border-slate-100 rounded-lg hover:border-accent-200 cursor-pointer transition-colors"
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── MONTH VIEW ────────────────────────────────────────────────────
function MonthView({ businessId, branchId, date, onApptClick, onDayClick, showBranch, colorByBranch, branches }) {
  const monthStart = startOfMonth(date)
  const monthEnd = endOfMonth(date)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: WEEK_START })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: WEEK_START })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })
  const { data: appts = [] } = useAppointmentsForMonth(businessId, branchId, date.getFullYear(), date.getMonth() + 1)
  const [popoverDay, setPopoverDay] = useState(null)

  function getDayAppts(day) {
    const ds = format(day, 'yyyy-MM-dd')
    return appts.filter(a => a.appointment_date === ds)
  }

  return (
    <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
      {/* Day names header */}
      <div className="grid grid-cols-7 border-b border-slate-100">
        {AR_DAYS_SHORT.map((d, i) => (
          <div key={i} className="py-2 text-center text-xs text-slate-400 font-medium">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 divide-x divide-y divide-slate-50">
        {days.map(day => {
          const inMonth = isSameMonth(day, date)
          const today = isToday(day)
          const dayAppts = getDayAppts(day)
          const visible = dayAppts.slice(0, 3)
          const overflow = dayAppts.length - 3

          return (
            <div
              key={day.toString()}
              onClick={() => onDayClick(day)}
              className={`min-h-[80px] p-1.5 cursor-pointer hover:bg-slate-50 transition-colors relative ${
                !inMonth ? 'bg-slate-50/50' : ''
              }`}
            >
              {/* Date number */}
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold leading-none mx-auto mb-1 ${
                today
                  ? 'bg-accent-500 text-white'
                  : inMonth ? 'text-slate-800' : 'text-slate-300'
              }`}>
                {format(day, 'd')}
              </div>

              {/* Appointment chips */}
              <div className="space-y-0.5">
                {visible.map(appt => {
                  const branchColor = colorByBranch ? getBranchColor(appt.branch_id, branches) : null
                  return (
                    <div
                      key={appt.id}
                      onClick={e => { e.stopPropagation(); onApptClick(appt) }}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] truncate cursor-pointer hover:opacity-80 ${STATUS_LIGHT[appt.status]} ${branchColor ? `border-r-2 ${branchColor.border}` : ''}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_BG[appt.status]}`} />
                      <span className="truncate">{appt.client_name}</span>
                    </div>
                  )
                })}
                {overflow > 0 && (
                  <button
                    onClick={e => { e.stopPropagation(); setPopoverDay(day) }}
                    className="text-[10px] text-primary-600 font-medium px-1"
                  >
                    +{overflow} أخرى
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Overflow popover */}
      {popoverDay && (
        <div className="fixed inset-0 bg-black/20 z-40 flex items-center justify-center p-4" onClick={() => setPopoverDay(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-4 min-w-[240px] max-w-sm" onClick={e => e.stopPropagation()}>
            <p className="font-bold text-sm text-slate-800 mb-3">
              {format(popoverDay, 'EEEE dd MMMM', { locale: ar })}
            </p>
            <div className="space-y-2">
              {getDayAppts(popoverDay).map(appt => {
                const branchColor = colorByBranch ? getBranchColor(appt.branch_id, branches) : null
                return (
                  <div
                    key={appt.id}
                    onClick={() => { onApptClick(appt); setPopoverDay(null) }}
                    className={`px-3 py-2 rounded-xl border cursor-pointer hover:opacity-80 ${STATUS_LIGHT[appt.status]} ${branchColor ? `border-r-4 ${branchColor.border}` : ''}`}
                  >
                    <p className="text-sm font-medium">{appt.client_name}</p>
                    <p className="text-xs opacity-70">
                      {appt.appointment_time?.slice(0, 5)} — {appt.services?.name}
                      {showBranch && appt.branches?.name && ` — ${appt.branches.name}`}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────
export default function BesholaCalendar({ businessId, onApptClick, onNewAppt }) {
  const [view, setView] = useState('day')
  const [date, setDate] = useState(new Date())
  const dateInputRef = useRef(null)
  const branchCtx = useBranch()
  const isMultiBranch = !!branchCtx?.isMultiBranch
  const branches = branchCtx?.branches || []
  const viewingAllBranches = isMultiBranch && !!branchCtx?.currentBranch?.isAll
  // Only filter by branch when the business genuinely has more than one —
  // for the common single-branch case, skip the filter entirely so the
  // calendar can never mismatch against the active branch.
  const branchId = isMultiBranch ? (branchCtx?.currentBranch?.id || null) : null

  function goBack() {
    if (view === 'day') setDate(d => subDays(d, 1))
    else if (view === 'week') setDate(d => subWeeks(d, 1))
    else setDate(d => subMonths(d, 1))
  }

  function goForward() {
    if (view === 'day') setDate(d => addDays(d, 1))
    else if (view === 'week') setDate(d => addWeeks(d, 1))
    else setDate(d => addMonths(d, 1))
  }

  function goToday() { setDate(new Date()) }

  function handleSlotClick(time, dateStr) {
    onNewAppt?.({ date: dateStr, time })
  }

  function handleDayClick(day) {
    setDate(day)
    setView('day')
  }

  // Range for stats
  const statsRange = (() => {
    if (view === 'day') {
      const ds = format(date, 'yyyy-MM-dd')
      return { start: ds, end: ds }
    }
    if (view === 'week') {
      const ws = startOfWeek(date, { weekStartsOn: WEEK_START })
      const we = endOfWeek(date, { weekStartsOn: WEEK_START })
      return { start: format(ws, 'yyyy-MM-dd'), end: format(we, 'yyyy-MM-dd') }
    }
    return {
      start: format(startOfMonth(date), 'yyyy-MM-dd'),
      end: format(endOfMonth(date), 'yyyy-MM-dd'),
    }
  })()

  const heading = (() => {
    if (view === 'day') return format(date, 'EEEE d MMMM yyyy', { locale: ar })
    if (view === 'week') {
      const ws = startOfWeek(date, { weekStartsOn: WEEK_START })
      const we = endOfWeek(date, { weekStartsOn: WEEK_START })
      return `${format(ws, 'd MMM', { locale: ar })} — ${format(we, 'd MMM yyyy', { locale: ar })}`
    }
    return format(date, 'MMMM yyyy', { locale: ar })
  })()

  return (
    <div dir="rtl">
      {/* Stats */}
      <StatsBar businessId={businessId} branchId={branchId} startDate={statsRange.start} endDate={statsRange.end} />

      {/* Branch legend — shown only when viewing all branches together */}
      {viewingAllBranches && branches.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap mb-3 px-1">
          {branches.map(branch => {
            const color = getBranchColor(branch.id, branches)
            return (
              <span key={branch.id} className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${color.dot}`} />
                {branch.name}
              </span>
            )
          })}
        </div>
      )}

      {/* Controls — desktop/tablet: single row */}
      <div className="hidden sm:flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-1">
          <button
            onClick={goForward}
            className="p-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <HiOutlineChevronRight className="w-5 h-5" />
          </button>
          <span className="text-sm font-semibold text-slate-800 text-center min-w-[160px]">{heading}</span>
          <button
            onClick={goBack}
            className="p-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <HiOutlineChevronLeft className="w-5 h-5" />
          </button>
        </div>

        <button
          onClick={goToday}
          className="px-3 py-2 text-sm border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-slate-600 min-h-[44px]"
        >
          اليوم
        </button>

        <DatePicker
          value={format(date, 'yyyy-MM-dd')}
          onChange={v => {
            if (!v) return
            setDate(new Date(v + 'T00:00:00'))
            setView('day')
          }}
          allowClear={false}
          className="w-40"
        />

        <div className="flex-1" />
        <ViewSwitcher view={view} onChange={setView} />

        <button
          onClick={() => onNewAppt?.({ date: format(date, 'yyyy-MM-dd'), time: null })}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-accent-500 hover:bg-accent-600 text-white text-sm font-medium rounded-xl transition-colors min-h-[44px]"
        >
          <HiOutlinePlus className="w-4 h-4" />
          <span className="hidden sm:block">موعد جديد</span>
        </button>
      </div>

      {/* Controls — mobile: no day/week/month tabs, just a scrollable date strip */}
      <div className="sm:hidden mb-3">
        <div className="flex items-center justify-between mb-2 px-0.5">
          <button onClick={goToday} className="text-sm font-bold text-slate-900">{heading}</button>
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                ref={dateInputRef}
                type="date"
                value={format(date, 'yyyy-MM-dd')}
                onChange={e => {
                  if (!e.target.value) return
                  const d = new Date(e.target.value + 'T00:00:00')
                  setDate(d)
                }}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <button
                onClick={() => dateInputRef.current?.showPicker?.()}
                className="w-9 h-9 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-slate-500 flex items-center justify-center"
                aria-label="انتقل لتاريخ"
              >
                <HiOutlineCalendarDays className="w-[18px] h-[18px]" />
              </button>
            </div>
            <button
              onClick={() => onNewAppt?.({ date: format(date, 'yyyy-MM-dd'), time: null })}
              className="w-9 h-9 flex-shrink-0 bg-accent-500 active:bg-accent-600 text-white rounded-xl transition-colors flex items-center justify-center"
              aria-label="موعد جديد"
            >
              <HiOutlinePlus className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>
        <DateStrip date={date} onSelect={setDate} />
      </div>

      {/* Mobile: always a single-day agenda — no week/month grids, they don't read well on a phone */}
      <div className="sm:hidden">
        <DayView
          businessId={businessId}
          branchId={branchId}
          date={date}
          onApptClick={onApptClick}
          onSlotClick={handleSlotClick}
          showBranch={isMultiBranch}
          colorByBranch={viewingAllBranches}
          branches={branches}
        />
      </div>

      {/* Calendar view — desktop/tablet: respects the day/week/month tabs */}
      <div className="hidden sm:block">
      {view === 'day' && (
        <DayView
          businessId={businessId}
          branchId={branchId}
          date={date}
          onApptClick={onApptClick}
          onSlotClick={handleSlotClick}
          showBranch={isMultiBranch}
          colorByBranch={viewingAllBranches}
          branches={branches}
        />
      )}
      {view === 'week' && (
        <WeekView
          businessId={businessId}
          branchId={branchId}
          date={date}
          onApptClick={onApptClick}
          onSlotClick={handleSlotClick}
          onDayClick={handleDayClick}
          showBranch={isMultiBranch}
          colorByBranch={viewingAllBranches}
          branches={branches}
        />
      )}
      {view === 'month' && (
        <MonthView
          businessId={businessId}
          branchId={branchId}
          date={date}
          onApptClick={onApptClick}
          onDayClick={handleDayClick}
          showBranch={isMultiBranch}
          colorByBranch={viewingAllBranches}
          branches={branches}
        />
      )}
      </div>
    </div>
  )
}
