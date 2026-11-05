import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { HiOutlineArrowPath, HiOutlineBellAlert, HiOutlineCheck, HiOutlineCheckCircle, HiOutlineChevronLeft, HiOutlineClipboardDocumentList, HiOutlineCpuChip, HiOutlineExclamationTriangle, HiOutlineFire, HiOutlineLightBulb, HiOutlineMapPin, HiOutlinePhone, HiOutlinePlus } from 'react-icons/hi2'
import { FaWhatsapp } from 'react-icons/fa'
import { automationHealth, buildTodayList, pickDailyLeads, poolStats } from '../../../lib/growth/dailyList'
import { chooseAngle, angleStats } from '../../../lib/growth/angles'
import { openingMessage } from '../../../lib/growth/messages'
import { dataQuality } from '../../../lib/growth/quality'
import { displayPhone, telLink, whatsappLink } from '../../../lib/growth/phone'
import { useLogActivity, useSetDailyList } from '../../../hooks/useGrowth'
import { Btn, Card, EmptyState, OutcomeIcon, QualityBadge, ScoreBadge, StageBadge } from './ui'
import { categoryLabel, formatDateTime, sourceLabel } from './format'

const BUCKETS = [
  { key: 0, icon: HiOutlineFire, title: 'كلّمهم الأول', hint: 'طلبوا يتكلّموا، أو لسه مسجّلين', tone: 'border-accent-300 bg-accent-50/60' },
  { key: 1, icon: HiOutlineBellAlert, title: 'متابعات', hint: 'ميعادهم النهارده أو فات', tone: 'border-rule bg-white' },
  { key: 2, icon: HiOutlineClipboardDocumentList, title: 'عيادات جديدة النهارده', hint: 'بتتغيّر كل يوم', tone: 'border-rule bg-white' },
]

// The result of a call, one tap after hanging up.
const QUICK_OUTCOMES = [
  { key: 'no_answer', label: 'مردّش' },
  { key: 'interested', label: 'مهتم' },
  { key: 'call_later', label: 'بعد يومين' },
  { key: 'not_interested', label: 'مش مهتم' },
  { key: 'wrong_number', label: 'رقم غلط' },
]

const isToday = (iso) => !!iso && new Date(iso).toDateString() === new Date().toDateString()

/** Today's call list: where it came from, and the fastest way to get through it. */
export default function QueuePanel({ leads, settings, dailyList = [], runs = [], onOpen, onTab }) {
  const stats = useMemo(() => angleStats(leads), [leads])
  const quality = useMemo(() => new Map(leads.map((l) => [l.id, dataQuality(l, leads)])), [leads])
  const opts = useMemo(() => ({ weights: settings?.weights, targetAreas: settings?.target_areas }), [settings])
  const list = useMemo(() => buildTodayList(leads, dailyList, opts), [leads, dailyList, opts])
  const pool = useMemo(() => poolStats(leads, settings ?? {}), [leads, settings])
  const setDaily = useSetDailyList()

  const doneToday = leads.filter((l) => isToday(l.last_contacted_at)).length
  const total = doneToday + list.length

  const sources = useMemo(() => {
    const counts = {}
    for (const { lead } of list) counts[lead.source] = (counts[lead.source] ?? 0) + 1
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [list])

  async function changeBatch(mode) {
    const onList = mode === 'rebuild' ? [] : dailyList
    const ids = pickDailyLeads(leads, settings ?? {}, { exclude: mode === 'rebuild' ? dailyList : onList, count: mode === 'append' ? 10 : settings?.daily_new_calls ?? 30 })
    if (!ids.length) return toast.error('المخزن فاضي: مفيش عيادات جاهزة دلوقتي')
    try {
      const { result } = await setDaily.mutateAsync({ ids, mode })
      toast.success(mode === 'append' ? `اتضاف ${result.added} عيادة` : `قايمة جديدة: ${result.total} عيادة`)
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-rule shadow-sm p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold text-ink">{new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
          <p className="text-sm text-ink-soft tabular-nums">خلصت <b className="text-ink">{doneToday}</b> من {total}</p>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-2">
          <div className="h-full bg-accent-500 rounded-full transition-all" style={{ width: `${total ? (doneToday / total) * 100 : 0}%` }} />
        </div>
      </div>

      <AutomationStrip runs={runs} pool={pool} settings={settings} onTab={onTab} />

      {sources.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-ink-soft font-semibold">القايمة دي جاية من:</span>
          {sources.map(([key, n]) => (
            <span key={key} className="bg-white border border-rule rounded-full px-2.5 py-1 text-ink">{sourceLabel(key)} <b className="tabular-nums">{n}</b></span>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <Card>
          <EmptyState icon={HiOutlineCheckCircle} title={doneToday ? 'خلصت قايمة النهارده' : 'مفيش حد مستني مكالمة دلوقتي'}>
            {pool.ready > 0
              ? 'لو عايز تكمّل، خد 10 عيادات كمان من المخزن. بكرة الصبح هتلاقي قايمة جديدة.'
              : 'المخزن فاضي. ضيف عيادات من «إضافة» أو شغّل المصادر من «الخرائط والمصادر».'}
            {pool.ready > 0 && (
              <div className="mt-3"><Btn tone="primary" onClick={() => changeBatch('append')} disabled={setDaily.isPending}><HiOutlinePlus className="w-4 h-4" aria-hidden="true" /> هات 10 كمان</Btn></div>
            )}
          </EmptyState>
        </Card>
      ) : (
        BUCKETS.map((bucket) => {
          const items = list.filter((q) => q.bucket === bucket.key)
          if (!items.length) return null
          return (
            <section key={bucket.key} className={`rounded-2xl border p-4 ${bucket.tone}`}>
              <header className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 className="flex items-center gap-1.5 font-bold text-ink"><bucket.icon className="w-5 h-5 text-accent-600" aria-hidden="true" />{bucket.title} <span className="text-ink-soft font-normal">({items.length})</span></h2>
                {bucket.key === 2 ? (
                  <div className="flex gap-1">
                    <Btn tone="ghost" className="!py-1 text-xs" onClick={() => changeBatch('append')} disabled={setDaily.isPending || !pool.ready}><HiOutlinePlus className="w-4 h-4" aria-hidden="true" /> 10 كمان</Btn>
                    <Btn tone="ghost" className="!py-1 text-xs" onClick={() => changeBatch('rebuild')} disabled={setDaily.isPending || !pool.ready} title="يبدّل اللي لسه ماكلّمتهمش بعيادات تانية"><HiOutlineArrowPath className="w-4 h-4" aria-hidden="true" /> بدّلهم</Btn>
                  </div>
                ) : (
                  <span className="text-xs text-ink-soft">{bucket.hint}</span>
                )}
              </header>
              <ul className="space-y-2">
                {items.map(({ lead, score, why }) => (
                  <CallRow key={lead.id} lead={lead} score={score} why={why} quality={quality.get(lead.id)} stats={stats} showDue={bucket.key === 1} onOpen={onOpen} />
                ))}
              </ul>
            </section>
          )
        })
      )}
    </div>
  )
}

/** Is the morning job alive, what did it do, and how long will the pool last? */
function AutomationStrip({ runs, pool, settings, onTab }) {
  const health = useMemo(() => automationHealth(runs), [runs])
  const added = health.last ? Object.values(health.last.summary ?? {}).reduce((n, s) => n + (Number(s?.inserted) || 0), 0) : 0
  const status = {
    never: { tone: 'border-amber-200 bg-amber-50', icon: HiOutlineExclamationTriangle, iconTone: 'text-amber-600', title: 'التجديد الأوتوماتيك لسه ماشتغلش', body: 'القايمة بتتعمل دلوقتي لما تفتح الصفحة بس، والمخزن مش بيتملى لوحده. الخطوات في docs/growth-engine.md.' },
    stale: { tone: 'border-amber-200 bg-amber-50', icon: HiOutlineExclamationTriangle, iconTone: 'text-amber-600', title: `التجديد الأوتوماتيك واقف من ${health.hours} ساعة`, body: 'افتح GitHub ← Actions ← Growth — daily leads وشوف السبب، أو دوس Run workflow.' },
    failed: { tone: 'border-red-200 bg-red-50', icon: HiOutlineExclamationTriangle, iconTone: 'text-red-600', title: 'آخر تجديد أوتوماتيك فيه خطوة فشلت', body: Object.entries(health.last?.summary ?? {}).filter(([, s]) => s?.error).map(([k, s]) => `${k}: ${s.error}`).join(' · ') },
    ok: { tone: 'border-rule bg-white', icon: HiOutlineCpuChip, iconTone: 'text-accent-600', title: `القايمة اتجددت لوحدها ${health.last ? formatDateTime(health.last.finished_at) : ''}`, body: added ? `ضاف ${added} عيادة جديدة للمخزن.` : 'مكانش محتاج يضيف عيادات جديدة.' },
  }[health.state]
  const lowPool = pool.daysLeft < 7

  return (
    <div className={`rounded-xl border p-3 flex flex-wrap items-center gap-x-4 gap-y-2 ${status.tone}`}>
      <div className="flex items-start gap-2 min-w-0 flex-1">
        <status.icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${status.iconTone}`} aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">{status.title}</p>
          <p className="text-xs text-ink-soft mt-0.5 leading-relaxed break-words">{status.body}</p>
        </div>
      </div>
      <button type="button" onClick={() => onTab?.('maps')} className="text-right flex-shrink-0 hover:underline" title="افتح الخرائط والمصادر">
        <p className={`text-sm font-bold tabular-nums ${lowPool ? 'text-amber-700' : 'text-ink'}`}>
          <HiOutlineMapPin className="inline-block w-4 h-4 align-[-3px] ml-1" aria-hidden="true" />{pool.ready.toLocaleString('en-EG')} عيادة في المخزن
        </p>
        <p className="text-xs text-ink-soft">
          {pool.ready ? `تكفي حوالي ${pool.daysLeft} يوم بمعدل ${settings?.daily_new_calls ?? 30} في اليوم` : 'المخزن فاضي'}
        </p>
      </button>
    </div>
  )
}

function CallRow({ lead, score, why, quality, stats, showDue, onOpen }) {
  const log = useLogActivity()
  const [calling, setCalling] = useState(false)
  const angle = chooseAngle(lead, { stats, categoryLabel: categoryLabel(lead.category) })
  const overdue = showDue && lead.next_follow_up_at && !isToday(lead.next_follow_up_at)

  async function quickWhatsApp() {
    const text = openingMessage(lead, angle.key)
    window.open(whatsappLink(lead.phone, text), '_blank', 'noopener,noreferrer')
    try {
      await log.mutateAsync({ leadId: lead.id, kind: 'whatsapp', outcome: 'sent', salesAngle: angle.key, note: text })
      toast.success(`اتسجّل. ${lead.name} هترجعلك بعد يومين`)
    } catch (e) {
      toast.error(e.message)
    }
  }

  async function record(outcome) {
    try {
      await log.mutateAsync({ leadId: lead.id, kind: 'call', outcome, salesAngle: angle.key })
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <li className="group bg-white rounded-xl border border-rule shadow-sm">
      <div className="flex flex-wrap items-center gap-3 p-3">
        <ScoreBadge score={score} />
        <button type="button" onClick={() => onOpen(lead.id)} className="min-w-0 flex-1 text-right">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-ink">{lead.name}</span>
            <QualityBadge quality={quality} compact />
            {lead.stage !== 'new' && <StageBadge stage={lead.stage} />}
          </div>
          <p className="text-xs text-ink-soft mt-0.5">
            {categoryLabel(lead.category)} · {lead.area || lead.city || 'منطقة مش معروفة'} · <b className="font-semibold" title={lead.source_detail ?? undefined}>{sourceLabel(lead.source)}</b>
          </p>
          {showDue && lead.next_follow_up_at && (
            <p className={`text-xs mt-0.5 ${overdue ? 'text-red-700 font-semibold' : 'text-ink-soft'}`}>{overdue ? 'فات ميعادها: ' : 'ميعادها: '}{formatDateTime(lead.next_follow_up_at)}</p>
          )}
          <p className="text-xs text-accent-700 mt-1">
            <HiOutlineLightBulb className="inline-block w-4 h-4 align-[-3px] ml-1" aria-hidden="true" />{why && !['من قايمة النهارده', 'ميعاد المتابعة النهارده'].includes(why) ? `${why}. ` : ''}ابدأ بـ «{angle.label}»
          </p>
        </button>
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <a href={telLink(lead.phone)} onClick={() => setCalling(true)} className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-ink text-white text-sm font-bold hover:bg-ink-deep">
            <HiOutlinePhone className="w-4 h-4" aria-hidden="true" /> <span dir="ltr" className="tabular-nums">{displayPhone(lead.phone)}</span>
          </a>
          <button type="button" onClick={quickWhatsApp} disabled={log.isPending} aria-label={`واتساب ${lead.name}`} title="يفتح الواتساب بالرسالة المقترحة ويسجّل إنك بعتّ"
            className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-accent-500 text-white hover:bg-accent-600 disabled:opacity-50">
            <FaWhatsapp className="w-5 h-5" />
          </button>
          <button type="button" onClick={() => onOpen(lead.id)} aria-label={`تفاصيل ${lead.name}`} className="inline-flex items-center px-2 py-2 rounded-lg border border-rule text-ink-soft hover:bg-paper">
            <HiOutlineChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      {/* Shown on the row you're working: after tapping call, or on hover/keyboard focus. */}
      <div className={`flex-wrap items-center gap-1.5 px-3 pb-3 ${calling ? 'flex' : 'hidden group-hover:flex group-focus-within:flex'}`}>
        <span className="text-xs text-ink-soft ml-1 inline-flex items-center gap-1"><HiOutlineCheck className="w-4 h-4" aria-hidden="true" /> حصل إيه؟</span>
        {QUICK_OUTCOMES.map((o) => (
          <button key={o.key} type="button" disabled={log.isPending} onClick={() => record(o.key)}
            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-full border border-rule text-ink hover:bg-paper disabled:opacity-50">
            <OutcomeIcon outcome={o.key} className="w-3.5 h-3.5" /> {o.label}
          </button>
        ))}
      </div>
    </li>
  )
}
