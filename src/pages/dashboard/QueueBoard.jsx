import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { addDays } from 'date-fns'
import { HiOutlinePlus, HiOutlineQueueList } from 'react-icons/hi2'
import { useAppointments, useAllAppointments } from '../../hooks/useAppointments'
import { useBranch } from '../../context/branchState'
import { displayPhone } from '../../lib/countries'
import { groupByPeriod, periodLabel, periodName, periodsOfDay, turnStatus } from '../../lib/queueBooking'
import { formatDateAr, formatTime12, toISODateString, todayISO } from '../../utils/dateHelpers'

// The dashboard of a clinic that books by turn (057): instead of a calendar of
// times, each day's periods with who took which number. The front desk
// (/clinic) is where today's line is run; this is for seeing and adding.

const DAYS = 14

const STATUS_CLS = {
  booked: 'bg-slate-100 text-slate-600',
  arrived: 'bg-green-50 text-green-700',
  inside: 'bg-ink text-white',
  done: 'bg-accent-50 text-accent-700',
  no_show: 'bg-amber-50 text-amber-700',
  waitlist: 'bg-amber-50 text-amber-700',
}

function dayLabel(dateStr, i) {
  if (i === 0) return 'النهارده'
  if (i === 1) return 'بكرا'
  return formatDateAr(dateStr, 'EEEE')
}

export default function QueueBoard({ business, onOpen, onNew }) {
  const branchCtx = useBranch()
  const branches = branchCtx?.branches || []
  const current = branchCtx?.currentBranch
  const [pickedBranch, setPickedBranch] = useState(null)
  const branch = current && !current.isAll ? current : branches.find(b => b.id === pickedBranch) || branches[0] || null
  const branchId = branch?.id || null

  const today = todayISO()
  const dates = useMemo(() => Array.from({ length: DAYS }, (_, i) => toISODateString(addDays(new Date(`${today}T12:00:00`), i))), [today])
  const [date, setDate] = useState(today)

  // The selected day (with realtime), and two weeks of counts for the day strip.
  const { data: dayRows = [] } = useAppointments(business.id, date)
  const { data: rangeRows = [] } = useAllAppointments(business.id, { from: dates[0], to: dates[dates.length - 1] })
  const inBranch = (a) => !branchId || !a.branch_id || a.branch_id === branchId
  const counts = {}
  for (const a of rangeRows) {
    if (inBranch(a) && ['confirmed', 'completed', 'no_show'].includes(a.status)) counts[a.appointment_date] = (counts[a.appointment_date] || 0) + 1
  }

  const periods = periodsOfDay(branch, business, date)
  const { groups, waitlist, cancelled } = groupByPeriod(dayRows.filter(inBranch), periods)
  const limit = business.queue_limit

  return (
    <div data-testid="queue-board" className="space-y-3" dir="rtl">
      {current?.isAll && branches.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {branches.map(b => (
            <button key={b.id} onClick={() => setPickedBranch(b.id)}
              className={`px-3 py-1.5 rounded-xl text-sm border ${b.id === branchId ? 'bg-accent-50 border-accent-300 text-accent-700 font-semibold' : 'bg-white border-slate-200 text-slate-600'}`}>
              {b.name}
            </button>
          ))}
        </div>
      )}

      {/* Two weeks, with how many took a number each day. */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="اختار اليوم">
        {dates.map((d, i) => {
          const active = d === date
          const closed = periodsOfDay(branch, business, d).length === 0
          return (
            <button key={d} role="tab" aria-selected={active} onClick={() => setDate(d)} data-testid="board-day"
              className={`flex-shrink-0 w-[76px] py-2 rounded-2xl border text-center transition-colors ${active ? 'bg-ink border-ink text-white' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
              <span className="block text-xs font-semibold truncate px-1">{dayLabel(d, i)}</span>
              <span className={`block text-[11px] ${active ? 'text-white/70' : 'text-slate-400'}`}>{formatDateAr(d, 'd MMM')}</span>
              <span className={`block text-xs mt-0.5 tabular-nums ${closed ? (active ? 'text-white/60' : 'text-slate-300') : 'font-bold'}`}>
                {closed ? 'إجازة' : `${counts[d] || 0} حجز`}
              </span>
            </button>
          )
        })}
      </div>

      {date === today && (
        <Link to="/clinic" className="flex items-center justify-center gap-2 h-11 rounded-xl bg-accent-500 hover:bg-accent-600 text-white text-sm font-bold transition-colors">
          <HiOutlineQueueList className="w-5 h-5" /> افتح شاشة الاستقبال (نادي ووصل وخلص)
        </Link>
      )}

      {groups.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-6 text-center text-sm text-slate-500">
          اليوم ده إجازة في ساعات العمل. لو جالك مريض، تقدر تضيفه من زرار «+».
        </div>
      )}

      {groups.map(g => {
        const full = limit != null && g.taken >= limit
        return (
          <section key={g.period.start} data-testid="board-period" className="bg-white rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3 px-4 pt-3 pb-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-900">{g.extra ? `حجوزات الساعة ${formatTime12(g.period.start)}` : periodName(g.period)}</h3>
                <p className="text-xs text-slate-500">{g.extra ? 'أرقامهم لوحدهم، اتسجلوا بساعة غير بداية الفترة' : periodLabel(g.period)}</p>
              </div>
              <div className="text-left flex-shrink-0">
                <p data-testid="period-count" className={`text-sm font-bold tabular-nums ${full ? 'text-amber-600' : 'text-ink'}`}>
                  {limit != null ? `${g.taken} من ${limit}` : `${g.taken} حجز`}
                </p>
                {full && <p className="text-[11px] text-amber-600">اتملت أونلاين</p>}
              </div>
            </div>
            {limit != null && (
              <div className="mx-4 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className={`h-full rounded-full ${full ? 'bg-amber-400' : 'bg-accent-500'}`} style={{ width: `${Math.min(100, (g.taken / limit) * 100)}%` }} />
              </div>
            )}

            <div className="px-2 py-2">
              {g.items.length === 0 && <p className="text-center text-sm text-slate-400 py-3">لسه محدش حجز في الفترة دي.</p>}
              {g.items.map(a => {
                const st = turnStatus(a)
                return (
                  <button key={a.id} onClick={() => onOpen(a)} data-testid="board-row"
                    className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-slate-50 text-right">
                    <span className={`w-9 h-9 rounded-full font-bold flex items-center justify-center tabular-nums flex-shrink-0 ${st.key === 'done' || st.key === 'no_show' ? 'bg-slate-50 text-slate-400' : 'bg-accent-50 text-accent-700'}`}>
                      {a.queue_number ?? '•'}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={`block font-semibold break-words ${st.key === 'done' || st.key === 'no_show' ? 'text-slate-400' : 'text-slate-900'}`}>{a.client_name}</span>
                      <span className="block text-xs text-slate-500">
                        <span dir="ltr" className="tabular-nums">{displayPhone(a.client_phone)}</span>
                        {a.services?.name && <span> · {a.services.name}</span>}
                      </span>
                    </span>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-lg flex-shrink-0 ${STATUS_CLS[st.key] || STATUS_CLS.booked}`}>{st.label}</span>
                  </button>
                )
              })}
            </div>

            {!g.extra && (
              <div className="px-4 pb-3">
                <button onClick={() => onNew({ date, time: g.period.start })}
                  className="w-full h-10 rounded-xl border border-dashed border-accent-300 text-accent-700 text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-accent-50">
                  <HiOutlinePlus className="w-4 h-4" /> رقم جديد في {periodName(g.period)}
                </button>
              </div>
            )}
          </section>
        )
      })}

      {waitlist.length > 0 && (
        <section data-testid="board-waitlist" className="bg-amber-50/60 rounded-2xl border border-amber-200 px-4 py-3 space-y-1">
          <h3 className="font-bold text-amber-800 text-sm">قايمة الانتظار ({waitlist.length})</h3>
          <p className="text-xs text-amber-700">حجزوا والفترة مليانة. كلّمهم وأكّد معاهم أو اعتذر، ومن الموعد تقدر تأكده.</p>
          {waitlist.map(a => (
            <button key={a.id} onClick={() => onOpen(a)} className="w-full flex items-center justify-between gap-2 py-1.5 text-right">
              <span className="font-semibold text-slate-800">{a.client_name}</span>
              <span dir="ltr" className="text-xs text-slate-500 tabular-nums">{displayPhone(a.client_phone)}</span>
            </button>
          ))}
        </section>
      )}

      {cancelled > 0 && <p className="text-center text-xs text-slate-400">{cancelled === 1 ? 'حجز واحد اتلغى' : `${cancelled} حجوزات اتلغت`} في اليوم ده.</p>}
    </div>
  )
}
