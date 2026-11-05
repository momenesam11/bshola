import { useMemo } from 'react'
import { HiOutlineChartBar, HiOutlineCheckCircle, HiOutlineCpuChip, HiOutlineExclamationTriangle, HiOutlineMapPin, HiOutlineSquares2X2 } from 'react-icons/hi2'
import { coverageMatrix, sourceBoard } from '../../../lib/growth/analytics'
import { automationHealth, poolStats } from '../../../lib/growth/dailyList'
import { OVERTURE_ATTRIBUTION } from '../../../lib/growth/overture'
import { sourceLabel, formatDateTime } from './format'
import { Card } from './ui'

const REPO_ACTIONS = 'https://github.com/momenesam11/bshola/actions/workflows/growth-daily.yml'

/** Top of the sources screen: how much you have, from where, and where the gaps are. */
export default function SourcesOverview({ leads, settings, runs = [] }) {
  const real = useMemo(() => leads.filter((l) => !l.is_test), [leads])
  const pool = useMemo(() => poolStats(real, settings ?? {}), [real, settings])
  const board = useMemo(() => sourceBoard(real), [real])
  const coverage = useMemo(() => coverageMatrix(real), [real])

  return (
    <div className="space-y-4">
      <OvertureCard pool={pool} settings={settings} runs={runs} />
      {board.length > 0 && <SourceBoard rows={board} />}
      {coverage.length > 0 && <Coverage rows={coverage} />}
    </div>
  )
}

function OvertureCard({ pool, settings, runs }) {
  const health = automationHealth(runs)
  const last = runs.find((r) => r.finished_at && r.summary?.overture)?.summary?.overture
  const working = health.state === 'ok'
  return (
    <Card icon={HiOutlineCpuChip} title="Overture Maps: عيادات حقيقية ببلاش">
      <p className="text-sm text-ink-soft leading-relaxed">
        خريطة مفتوحة فيها عيادات حقيقية برقم وصفحة فيسبوك، مسموح تخزينها، ومن غير مفتاح ولا كارت. في القاهرة والجيزة فيها حوالي <b className="text-ink">4,900 عيادة</b> بعد الفلترة
        (أسنان 2,500 · جلدية 340 · تخصصات تانية 2,000)، و94% منهم موبايل عليه واتساب غالباً.
      </p>
      <div className="grid grid-cols-3 gap-2 mt-3 text-center">
        <Mini value={pool.ready.toLocaleString('en-EG')} label="جاهزين في المخزن" />
        <Mini value={pool.resting.toLocaleString('en-EG')} label="راحة لسه اتعرضوا" />
        <Mini value={settings?.pool_target ?? 300} label="الحجم المستهدف" />
      </div>
      {working ? (
        <p className="text-sm mt-3 flex items-start gap-1.5 text-accent-700">
          <HiOutlineCheckCircle className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
          <span>
            آخر تشغيل {formatDateTime(health.last.finished_at)}{last?.inserted ? `: ضاف ${last.inserted} عيادة` : ''}.{' '}
            <a href={REPO_ACTIONS} target="_blank" rel="noopener noreferrer" className="font-semibold underline">السجل على GitHub</a>
          </span>
        </p>
      ) : (
        <p className="text-sm mt-3 flex items-start gap-1.5 text-ink-soft">
          <HiOutlineExclamationTriangle className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
          <span>المخزن مش بيتملى لوحده: لما يقل، زوّد دفعة من ملفات العيادات.</span>
        </p>
      )}
      <p className="text-[12.5px] text-ink-soft mt-2">البيانات: {OVERTURE_ATTRIBUTION}. الرقم من صفحة العيادة العامة، ومش متأكدين منه غير لما تكلّمهم، فـ«رقم غلط» بيقفلها.</p>
    </Card>
  )
}

const Mini = ({ value, label }) => (
  <div className="rounded-lg bg-paper border border-rule py-2">
    <b className="block text-lg tabular-nums text-ink">{value}</b>
    <span className="text-xs text-ink-soft">{label}</span>
  </div>
)

/** Which source is worth your time: not how many it brings, how many pay. */
function SourceBoard({ rows }) {
  return (
    <Card icon={HiOutlineChartBar} title="أنهي مصدر بيجيب فلوس؟">
      <div className="overflow-x-auto -mx-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-ink-soft border-b border-rule">
              <th className="text-right font-medium px-4 py-2">المصدر</th>
              <th className="text-center font-medium px-2 py-2">عيادات</th>
              <th className="text-center font-medium px-2 py-2">موبايل</th>
              <th className="text-center font-medium px-2 py-2">اتكلّمنا</th>
              <th className="text-center font-medium px-2 py-2">تجربة</th>
              <th className="text-center font-medium px-2 py-2">دفعوا</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-rule/60 last:border-0">
                <td className="px-4 py-2 font-semibold text-ink">{sourceLabel(r.key)}</td>
                <td className="px-2 py-2 text-center">{r.total.toLocaleString('en-EG')}</td>
                <td className="px-2 py-2 text-center">{r.total ? Math.round((r.mobile / r.total) * 100) : 0}%</td>
                <td className="px-2 py-2 text-center">{r.called}</td>
                <td className="px-2 py-2 text-center">{r.trial}</td>
                <td className="px-2 py-2 text-center font-bold text-accent-700">{r.paid}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/** District × specialty: where you have stock, where you've worked, where you've won. */
function Coverage({ rows }) {
  const max = Math.max(1, ...rows.flatMap((r) => Object.values(r.cells)))
  const shade = (n) => (n === 0 ? 'bg-paper text-ink-soft' : n / max > 0.5 ? 'bg-accent-500 text-white' : n / max > 0.15 ? 'bg-accent-100 text-accent-800' : 'bg-accent-50 text-accent-800')
  return (
    <Card icon={HiOutlineSquares2X2} title="خريطة التغطية: كل منطقة فيها إيه">
      <p className="text-xs text-ink-soft mb-3 leading-relaxed">الأغمق فيه عيادات أكتر. «اتكلّمنا» بتقولك وصلت لكام منهم، و«كسبنا» كام بدأ تجربة أو دفع. منطقة فيها عيادات كتير ومفيش كسب = جرّب تزورها أو تدوّر فيها على شريك.</p>
      <div className="overflow-x-auto -mx-4 max-h-96">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="text-xs text-ink-soft border-b border-rule">
              <th className="text-right font-medium px-4 py-2"><HiOutlineMapPin className="inline-block w-4 h-4 align-[-3px] ml-1" aria-hidden="true" />المنطقة</th>
              <th className="text-center font-medium px-1 py-2">أسنان</th>
              <th className="text-center font-medium px-1 py-2">جلدية</th>
              <th className="text-center font-medium px-1 py-2">تانية</th>
              <th className="text-center font-medium px-2 py-2">اتكلّمنا</th>
              <th className="text-center font-medium px-2 py-2">كسبنا</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((r) => (
              <tr key={r.area} className="border-b border-rule/60 last:border-0">
                <td className="px-4 py-1.5 font-semibold text-ink whitespace-nowrap">{r.area}</td>
                {['dental', 'derma', 'clinic'].map((c) => (
                  <td key={c} className="px-1 py-1.5 text-center"><span className={`inline-block min-w-9 rounded px-1.5 py-0.5 text-xs font-bold ${shade(r.cells[c])}`}>{r.cells[c]}</span></td>
                ))}
                <td className="px-2 py-1.5 text-center">{r.reached}</td>
                <td className={`px-2 py-1.5 text-center ${r.won ? 'font-bold text-accent-700' : ''}`}>{r.won}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
