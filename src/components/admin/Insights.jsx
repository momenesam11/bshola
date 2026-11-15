import { useState } from 'react'

// /admin numbers from migration 059. Counts only: nothing here names a patient.

function Card({ label, value, hint }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  )
}

function weekLabel(iso) {
  const d = new Date(`${iso}T12:00:00`)
  return `${d.getDate()}/${d.getMonth() + 1}`
}

// One measure per chart (bookings and signups differ in scale, so they never
// share an axis). Thin bars with rounded tops, a 2px gap, a recessive baseline,
// the latest week labelled, and a tooltip on hover or focus for every week.
function WeeklyBars({ title, rows, field, testId }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...rows.map(r => r[field]))
  const last = rows[rows.length - 1]
  return (
    <figure data-testid={testId} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 m-0">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-gray-800">{title}</span>
        {last && <span className="text-xs text-gray-500">الأسبوع ده: <b className="text-gray-900 tabular-nums">{last[field]}</b></span>}
      </figcaption>
      <div className="relative mt-3" dir="ltr">
        <div className="flex items-end gap-[2px] h-28 border-b border-gray-200">
          {rows.map((r, i) => (
            <button key={r.week} type="button"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)} onBlur={() => setHover(null)}
              aria-label={`أسبوع ${weekLabel(r.week)}: ${r[field]}`}
              className="flex-1 h-full flex items-end group focus:outline-none">
              <span className={`w-full rounded-t-[4px] transition-colors ${hover === i ? 'bg-accent-600' : 'bg-accent-500/80 group-focus-visible:bg-accent-600'}`}
                style={{ height: `${Math.max(r[field] ? 3 : 0, (r[field] / max) * 100)}%` }} />
            </button>
          ))}
        </div>
        {hover != null && (
          <div role="status" className="absolute -top-2 -translate-y-full px-2 py-1 rounded-md bg-gray-900 text-white text-xs whitespace-nowrap pointer-events-none"
            style={{ left: `${((hover + 0.5) / rows.length) * 100}%`, transform: 'translate(-50%, -100%)' }} dir="rtl">
            أسبوع {weekLabel(rows[hover].week)}: <b className="tabular-nums">{rows[hover][field]}</b>
          </div>
        )}
        <div className="flex justify-between text-[10px] text-gray-400 mt-1">
          <span>{rows[0] && weekLabel(rows[0].week)}</span>
          <span>{last && weekLabel(last.week)}</span>
        </div>
      </div>
    </figure>
  )
}

export function PlatformInsights({ platform }) {
  const [table, setTable] = useState(false)
  if (!platform) return null
  const weekly = platform.weekly || []
  return (
    <section data-testid="platform-insights" className="space-y-3">
      <h2 className="text-sm font-bold text-gray-700">نشاط كل العيادات</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card label="حجوزات النهارده" value={platform.bookings_today} />
        <Card label="حجوزات آخر 7 أيام" value={platform.bookings_7d} />
        <Card label="عيادات حجزت آخر 7 أيام" value={platform.active_clinics_7d} />
        <Card label="رسايل «اتحرك» آخر 7 أيام" value={platform.heads_up_7d} hint="من صفحة العيادة" />
        <Card label="عيادات بالدور" value={platform.queue_clinics} />
        <Card label="بيستخدموا صفحة العيادة" value={platform.front_desk_clinics_30d} hint="نادوا مريض آخر 30 يوم" />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <WeeklyBars title="حجوزات كل أسبوع (آخر 12 أسبوع)" rows={weekly} field="bookings" testId="weekly-bookings" />
        <WeeklyBars title="تسجيلات جديدة كل أسبوع" rows={weekly} field="signups" testId="weekly-signups" />
      </div>
      <button type="button" onClick={() => setTable(t => !t)} className="text-xs text-accent-700 hover:underline">
        {table ? 'اخفي الجدول' : 'اعرض الأرقام كجدول'}
      </button>
      {table && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-xs" data-testid="weekly-table">
            <thead><tr className="text-gray-400"><th className="text-right px-3 py-2 font-medium">الأسبوع اللي بيبدأ</th><th className="text-right px-3 py-2 font-medium">حجوزات</th><th className="text-right px-3 py-2 font-medium">تسجيلات</th></tr></thead>
            <tbody>
              {weekly.map(r => (
                <tr key={r.week} className="border-t border-gray-50">
                  <td className="px-3 py-1.5 tabular-nums">{r.week}</td>
                  <td className="px-3 py-1.5 tabular-nums">{r.bookings}</td>
                  <td className="px-3 py-1.5 tabular-nums">{r.signups}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

const SETUP = [
  { key: 'services', label: 'خدمات', ok: f => f.services > 0 },
  { key: 'hours', label: 'مواعيد', ok: f => f.has_hours },
  { key: 'logo', label: 'لوجو', ok: f => f.has_logo },
  { key: 'map', label: 'خريطة', ok: f => f.has_map },
]

// One clinic's feature use: by time or by turn, front desk use, WhatsApp
// heads-ups in 30 days, and which setup steps are still missing.
export function FeatureCell({ features }) {
  if (!features) return <span className="text-xs text-gray-300">—</span>
  const missing = SETUP.filter(s => !s.ok(features))
  return (
    <div className="space-y-1 min-w-[150px]">
      <div className="flex flex-wrap items-center gap-1">
        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${features.booking_mode === 'queue' ? 'bg-ink text-white' : 'bg-gray-100 text-gray-600'}`}>
          {features.booking_mode === 'queue' ? 'بالدور' : 'بالميعاد'}
        </span>
        <span className="text-[11px] text-gray-600 tabular-nums" title="آخر 30 يوم">نداء {features.calls_30d} · وصل {features.arrivals_30d} · اتحرك {features.heads_up_30d}</span>
      </div>
      <div className={`text-[11px] ${missing.length ? 'text-amber-600' : 'text-green-600'}`} data-testid="setup-status">
        {missing.length ? `ناقص: ${missing.map(m => m.label).join('، ')}` : 'الإعداد كامل'}
      </div>
    </div>
  )
}
