import { useMemo, useState } from 'react'
import { funnel, conversionBy, labelers, headline } from '../../../lib/growth/analytics'
import { ACTIVITY_KINDS, OUTCOME_BY_KEY } from '../../../lib/growth/constants'
import { useActivityStats } from '../../../hooks/useGrowth'
import { Card } from './ui'

function Stat({ label, value, hint }) {
  return (
    <div className="bg-white rounded-xl border border-rule shadow-sm p-4">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-2xl font-bold text-ink mt-1 tabular-nums">{value}</p>
      {hint && <p className="text-[12.5px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  )
}

function ConversionTable({ title, rows }) {
  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">مفيش بيانات لسه</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[12.5px] text-gray-400 border-b border-rule">
              <th className="text-right font-medium py-1.5"> </th>
              <th className="text-center font-medium py-1.5">عملاء</th>
              <th className="text-center font-medium py-1.5">اتكلّموا</th>
              <th className="text-center font-medium py-1.5">تجربة</th>
              <th className="text-center font-medium py-1.5">دفعوا</th>
              <th className="text-center font-medium py-1.5">نسبة الدفع</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-gray-50 last:border-0">
                <td className="py-2 font-semibold text-ink">{r.label}</td>
                <td className="py-2 text-center tabular-nums">{r.leads}</td>
                <td className="py-2 text-center tabular-nums">{r.contacted}</td>
                <td className="py-2 text-center tabular-nums">{r.trial}</td>
                <td className="py-2 text-center tabular-nums font-bold text-accent-700">{r.paid}</td>
                <td className="py-2 text-center tabular-nums">{r.paidRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

/** The growth dashboard: what's working, by source / type / angle. */
export default function NumbersPanel({ leads }) {
  const top = useMemo(() => headline(leads), [leads])
  const steps = useMemo(() => funnel(leads), [leads])
  const { data: activities = [] } = useActivityStats()
  // Fixed at mount: "this week" shouldn't shift while the screen is open.
  const [now] = useState(() => Date.now())

  const effort = useMemo(() => {
    const by = (pred) => activities.filter(pred).length
    const week = now - 7 * 864e5
    return {
      calls30: by((a) => a.kind === 'call'),
      whatsapp30: by((a) => a.kind === 'whatsapp'),
      week: by((a) => ['call', 'whatsapp', 'visit'].includes(a.kind) && new Date(a.created_at).getTime() >= week),
      outcomes: Object.entries(
        activities.filter((a) => a.outcome).reduce((m, a) => ({ ...m, [a.outcome]: (m[a.outcome] ?? 0) + 1 }), {})
      ).sort((a, b) => b[1] - a[1]),
    }
  }, [activities, now])

  const max = steps[0]?.count || 1

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="كل العملاء المحتملين" value={top.total} />
        <Stat label="جداد الأسبوع ده" value={top.newThisWeek} />
        <Stat label="طلبوا يتكلّموا (أسبوع)" value={top.inboundThisWeek} />
        <Stat label="مفتوحين" value={top.open} />
        <Stat label="في التجربة دلوقتي" value={top.trials} />
        <Stat label="دفعوا" value={top.paid} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="📉 القمع">
          <div className="space-y-2.5">
            {steps.map((s) => (
              <div key={s.key}>
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-ink-soft">{s.label}</span>
                  <span className="tabular-nums text-ink-soft">
                    {s.count}{s.rateFromPrev !== null && <span className="text-gray-400"> ({s.rateFromPrev}% من اللي قبله)</span>}
                  </span>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                  <div className="h-full bg-accent-500 rounded-full" style={{ width: `${(s.count / max) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="💪 مجهودك (آخر 30 يوم)">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div><p className="text-2xl font-bold tabular-nums">{effort.calls30}</p><p className="text-xs text-ink-soft">{ACTIVITY_KINDS.call}</p></div>
            <div><p className="text-2xl font-bold tabular-nums">{effort.whatsapp30}</p><p className="text-xs text-ink-soft">{ACTIVITY_KINDS.whatsapp}</p></div>
            <div><p className="text-2xl font-bold tabular-nums">{effort.week}</p><p className="text-xs text-ink-soft">تواصل الأسبوع ده</p></div>
          </div>
          {effort.outcomes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-4">
              {effort.outcomes.map(([k, n]) => (
                <span key={k} className="text-xs bg-gray-100 rounded-full px-2.5 py-1">{OUTCOME_BY_KEY[k]?.icon} {OUTCOME_BY_KEY[k]?.label}: <b>{n}</b></span>
              ))}
            </div>
          )}
        </Card>
      </div>

      <ConversionTable title="📍 حسب المصدر — أنهي مصدر بيجيب فلوس؟" rows={conversionBy(leads, 'source', labelers.source)} />
      <div className="grid lg:grid-cols-2 gap-4">
        <ConversionTable title="🏥 حسب نوع العيادة" rows={conversionBy(leads, 'category', labelers.category)} />
        <ConversionTable title="💡 حسب زاوية البيع" rows={conversionBy(leads.filter((l) => l.sales_angle), 'sales_angle', labelers.sales_angle)} />
      </div>
      <p className="text-[12.5px] text-gray-400">الأرقام دي بتتحسب من القايمة نفسها. التجربة والدفع بيتحدّثوا لوحدهم كل ليلة (أو من زرار «تحديث من النظام»).</p>
    </div>
  )
}
