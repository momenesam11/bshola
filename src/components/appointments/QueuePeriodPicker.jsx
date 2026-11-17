import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { bookablePeriods, periodLabel, periodName } from '../../lib/queueBooking'
import { todayISO } from '../../utils/dateHelpers'

// The clinic adding a booking by turn (057): instead of a time, one of the
// day's working periods, the same ones patients see. A period that already
// ended today can't be picked, and the next number is shown, as when a patient
// books. No other time can be chosen, so a booking never opens a period.

function useQueuePeriodStats(businessId, branchId, date, enabled) {
  return useQuery({
    queryKey: ['queue-periods', businessId, branchId, date],
    enabled: enabled && !!businessId && !!date,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('public_queue_periods', { p_business_id: businessId, p_branch_id: branchId || null, p_date: date })
      if (error) throw error
      return Object.fromEntries((data || []).map(r => [String(r.period_start).slice(0, 5), r]))
    },
  })
}

export default function QueuePeriodPicker({ business, branch, date, value, onChange, appointment = null, error = null }) {
  const keep = appointment?.appointment_date === date ? String(appointment.appointment_time || '').slice(0, 5) : null
  const periods = bookablePeriods(branch, business, date, { keep, today: todayISO() })
  const { data: stats = {} } = useQueuePeriodStats(business?.id, branch?.id, date, !!branch)
  const limit = business?.queue_limit ?? null

  if (!branch) {
    return <p className="text-sm text-slate-500 bg-slate-50 rounded-xl px-3 py-2.5">اختاري الفرع الأول.</p>
  }
  if (!periods.length) {
    return (
      <p data-testid="no-periods" className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
        العيادة مش شغالة اليوم ده في ساعات العمل. اختاري يوم تاني، أو زوّدي فترة من «ساعات العمل».
        {error && <span className="block text-xs text-red-500 mt-1">{error}</span>}
      </p>
    )
  }

  const chosen = periods.find(p => p.start === value)
  const s = chosen ? stats[chosen.start] : null
  // An edited booking that stays in its period keeps its number.
  const keepsNumber = appointment && keep === value && appointment.queue_number != null
  const nextNumber = keepsNumber ? appointment.queue_number : s?.next_number || 1
  const taken = s?.taken || 0
  const full = limit != null && taken >= limit && !keepsNumber

  return (
    <div className="space-y-2" data-testid="period-picker">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="الفترة">
        {periods.map(p => {
          const st = stats[p.start]
          const selected = p.start === value
          return (
            <button key={p.start} type="button" role="radio" aria-checked={selected} disabled={p.over}
              onClick={() => onChange(p.start)}
              className={`text-right rounded-xl border-2 px-3 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${selected ? 'border-accent-500 bg-accent-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
              <span className="block font-bold text-slate-900 text-sm">{periodName(p)}</span>
              <span className="block text-xs text-slate-500">{periodLabel(p)}</span>
              <span className="block text-xs text-slate-500 mt-0.5">
                {p.over ? 'الفترة خلصت' : `اتحجز ${st?.taken || 0}${limit != null ? ` من ${limit}` : ''}`}
              </span>
            </button>
          )
        })}
      </div>
      {chosen && !chosen.over && (
        <p data-testid="next-number" className="text-sm font-semibold text-ink bg-accent-50 border border-accent-200 rounded-xl px-3 py-2">
          {keepsNumber ? `رقمها في الدور: ${nextNumber}` : `رقمها في الدور هيبقى ${nextNumber}`}
        </p>
      )}
      {full && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          الفترة دي مليانة ({taken} من {limit}). هتتضاف فوق الحد لأنك العيادة.
        </p>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
