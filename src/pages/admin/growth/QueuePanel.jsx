import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { HiOutlineBeaker, HiOutlineBellAlert, HiOutlineCheck, HiOutlineCheckCircle, HiOutlineChevronLeft, HiOutlineClipboardDocumentList, HiOutlineEnvelope, HiOutlineExclamationTriangle, HiOutlineFire, HiOutlineLightBulb, HiOutlinePhone, HiOutlineShieldExclamation, HiOutlineTrash } from 'react-icons/hi2'
import { FaWhatsapp } from 'react-icons/fa'
import { buildQueue } from '../../../lib/growth/scoring'
import { chooseAngle, angleStats } from '../../../lib/growth/angles'
import { openingMessage } from '../../../lib/growth/messages'
import { dataQuality } from '../../../lib/growth/quality'
import { displayPhone, telLink, whatsappLink } from '../../../lib/growth/phone'
import { useLogActivity, useSaveLead, useQualifyLead, useDeleteLead } from '../../../hooks/useGrowth'
import { Btn, Card, EmptyState, QualityBadge, QUALITY_ICON, ScoreBadge, StageBadge } from './ui'
import { categoryLabel, formatDateTime, sourceLabel } from './format'

const BUCKETS = [
  { key: 0, icon: HiOutlineFire, title: 'طلبوا يتكلّموا معانا', hint: 'كلّمهم الأول — دول جايين لوحدهم', tone: 'border-accent-300 bg-accent-50/60' },
  { key: 1, icon: HiOutlineBellAlert, title: 'متابعات النهارده', hint: 'وعدتهم تكلّمهم النهارده', tone: 'border-rule bg-white' },
  { key: 2, icon: HiOutlineClipboardDocumentList, title: 'عيادات جديدة — الأعلى تقييماً', hint: 'لسه ماتكلّمتش معاهم', tone: 'border-rule bg-white' },
]

const isToday = (iso) => iso && new Date(iso).toDateString() === new Date().toDateString()

/** Today's call list, in the order to work it. */
export default function QueuePanel({ leads, settings, onOpen }) {
  const [reviewOpen, setReviewOpen] = useState(false)
  // Where the lead came from — Google search, OpenStreetMap, the "call me"
  // form, a partner… Only sources that have callable leads are offered.
  const [source, setSource] = useState('')

  const stats = useMemo(() => angleStats(leads), [leads])
  const quality = useMemo(() => new Map(leads.map((l) => [l.id, dataQuality(l, leads)])), [leads])
  const suspects = useMemo(
    () => leads.filter((l) => quality.get(l.id)?.level === 'suspect' && !['lost', 'do_not_contact'].includes(l.stage)),
    [leads, quality]
  )

  // Only leads you can actually call. Email-only ones live in «كل العملاء».
  const callable = useMemo(() => leads.filter((l) => l.phone), [leads])
  const sourceCounts = useMemo(() => {
    const counts = {}
    for (const q of buildQueue(callable, { weights: settings?.weights, targetAreas: settings?.target_areas })) {
      counts[q.lead.source] = (counts[q.lead.source] ?? 0) + 1
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [callable, settings])
  const queue = useMemo(
    () => buildQueue(callable.filter((l) => !source || l.source === source), { weights: settings?.weights, targetAreas: settings?.target_areas }),
    [callable, source, settings]
  )

  const doneToday = leads.filter((l) => isToday(l.last_contacted_at)).length
  const total = doneToday + queue.length
  const inbound = queue.filter((q) => q.bucket === 0).length

  return (
    <div className="space-y-4">
      {/* Today at a glance */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={HiOutlinePhone} label="عليك النهارده" value={queue.length} tone="text-ink" />
        <Stat icon={HiOutlineFire} label="طلبوا يكلّموك" value={inbound} tone="text-accent-700" />
        <Stat icon={HiOutlineCheckCircle} label="اتكلّمت معاهم النهارده" value={doneToday} tone="text-accent-600" />
        <button type="button" onClick={() => setReviewOpen((v) => !v)} className="text-right">
          <Stat icon={HiOutlineExclamationTriangle} label="محتاجين مراجعة" value={suspects.length} tone="text-amber-600" hint={suspects.length ? 'اضغط تراجعهم' : null} />
        </button>
      </div>
      {total > 0 && (
        <div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-accent-500 rounded-full transition-all" style={{ width: `${(doneToday / total) * 100}%` }} />
          </div>
          <p className="text-[12.5px] text-ink-soft mt-1">خلصت {doneToday} من {total} النهارده</p>
        </div>
      )}

      {reviewOpen && <ReviewPanel suspects={suspects} quality={quality} onOpen={onOpen} onClose={() => setReviewOpen(false)} />}

      <QualityLegend />

      {sourceCounts.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink-soft">جايين منين:</span>
          <select className="border border-rule rounded-lg px-3 py-1.5 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-accent-400"
            value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">كل المصادر ({sourceCounts.reduce((n, [, c]) => n + c, 0)})</option>
            {sourceCounts.map(([key, count]) => <option key={key} value={key}>{sourceLabel(key)} ({count})</option>)}
          </select>
        </div>
      )}

      {queue.length === 0 ? (
        <Card>
          <EmptyState icon={HiOutlineCheckCircle} title="مفيش حد مستني مكالمة دلوقتي">
            ضيف عيادات من «إضافة» أو شغّل «خرائط جوجل»، أو دوس «تحديث من النظام» يجيب اللي سجّلوا وماكمّلوش.
          </EmptyState>
        </Card>
      ) : (
        BUCKETS.map((bucket) => {
          const items = queue.filter((q) => q.bucket === bucket.key)
          if (!items.length) return null
          // A cold list can be hundreds long; work the best 30 first.
          const shown = bucket.key === 2 ? items.slice(0, 30) : items
          return (
            <section key={bucket.key} className={`rounded-2xl border p-4 ${bucket.tone}`}>
              <header className="flex items-baseline justify-between gap-2 mb-3">
                <h2 className="flex items-center gap-1.5 font-bold text-ink"><bucket.icon className="w-5 h-5 text-accent-600" aria-hidden="true" />{bucket.title} <span className="text-gray-400 font-normal">({items.length})</span></h2>
                <span className="text-xs text-ink-soft">{bucket.hint}</span>
              </header>
              <ul className="space-y-2">
                {shown.map(({ lead, score }) => (
                  <QueueRow key={lead.id} lead={lead} score={score} quality={quality.get(lead.id)} stats={stats} showDue={bucket.key === 1} onOpen={onOpen} />
                ))}
              </ul>
              {shown.length < items.length && <p className="text-xs text-gray-400 mt-3">+ {items.length - shown.length} تانيين في «كل العملاء»</p>}
            </section>
          )
        })
      )}
    </div>
  )
}

function Stat({ icon: Icon, label, value, tone, hint }) {
  return (
    <div className="bg-white rounded-xl border border-rule shadow-sm p-4 h-full">
      <p className="flex items-center gap-1.5 text-xs text-ink-soft">{Icon && <Icon className="w-4 h-4" aria-hidden="true" />}{label}</p>
      <p className={`text-3xl font-bold mt-1 tabular-nums ${tone}`}>{value}</p>
      {hint && <p className="text-[12.5px] text-amber-600 mt-0.5">{hint}</p>}
    </div>
  )
}

function QueueRow({ lead, score, quality, stats, showDue, onOpen }) {
  const log = useLogActivity()
  const angle = chooseAngle(lead, { stats, categoryLabel: categoryLabel(lead.category) })

  async function quickWhatsApp() {
    const text = openingMessage(lead, angle.key)
    window.open(whatsappLink(lead.phone, text), '_blank', 'noopener,noreferrer')
    try {
      await log.mutateAsync({ leadId: lead.id, kind: 'whatsapp', outcome: 'sent', salesAngle: angle.key, note: text })
      toast.success(`اتسجّل — هيرجعلك ${lead.name} للمتابعة بعد يومين`)
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <li className="bg-white rounded-xl border border-rule shadow-sm hover:shadow-md transition-shadow">
      <div className="flex flex-wrap items-center gap-3 p-3">
        <ScoreBadge score={score} />
        <button type="button" onClick={() => onOpen(lead.id)} className="min-w-0 flex-1 text-right">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-ink">{lead.name}</span>
            <QualityBadge quality={quality} compact />
            <StageBadge stage={lead.stage} />
          </div>
          <p className="text-xs text-ink-soft mt-0.5">
            {categoryLabel(lead.category)} · {lead.area || lead.city || 'منطقة مش معروفة'} · {sourceLabel(lead.source)}
            {showDue && lead.next_follow_up_at ? ` · متابعة ${formatDateTime(lead.next_follow_up_at)}` : ''}
          </p>
          <p className="text-xs text-accent-700 mt-1">
            <HiOutlineLightBulb className="inline-block w-4 h-4 align-[-3px] ml-1" aria-hidden="true" />ابدأ بـ «{angle.label}»{angle.basis !== 'default' ? ` — ${angle.because}` : ''}
          </p>
        </button>
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          {lead.phone ? (
            <>
              <a href={telLink(lead.phone)} className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-ink text-white text-sm font-bold hover:bg-ink-deep" title={displayPhone(lead.phone)}>
                <HiOutlinePhone className="w-4 h-4" /> اتصال
              </a>
              <button type="button" onClick={quickWhatsApp} disabled={log.isPending}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-accent-500 text-white text-sm font-bold hover:bg-accent-600 disabled:opacity-50" title="يفتح الواتساب بالرسالة المقترحة ويسجّل إنك بعتّ">
                <FaWhatsapp className="w-4 h-4" /> واتساب
              </button>
            </>
          ) : (
            <span className="text-xs text-amber-700 px-2 inline-flex items-center gap-1"><HiOutlineEnvelope className="w-4 h-4" aria-hidden="true" /> إيميل بس</span>
          )}
          <button type="button" onClick={() => onOpen(lead.id)} className="inline-flex items-center gap-0.5 px-3 py-2 rounded-lg border border-rule text-sm font-semibold text-ink-soft hover:bg-paper">
            التفاصيل <HiOutlineChevronLeft className="w-4 h-4" />
          </button>
        </div>
      </div>
    </li>
  )
}

/** Leads that look like tests or junk, with one-click fixes. */
function ReviewPanel({ suspects, quality, onOpen, onClose }) {
  const save = useSaveLead()
  const qualify = useQualifyLead()
  const del = useDeleteLead()
  const busy = save.isPending || qualify.isPending || del.isPending

  async function run(fn, done) {
    try {
      await fn()
      toast.success(done)
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <Card icon={HiOutlineShieldExclamation} title="راجع البيانات — الحاجات دي شكلها مش طبيعي" actions={<Btn tone="ghost" onClick={onClose}>إخفاء</Btn>}>
      {suspects.length === 0 ? (
        <p className="text-sm text-ink-soft">كله تمام — مفيش حاجة محتاجة مراجعة.</p>
      ) : (
        <ul className="divide-y divide-gray-50 -my-2">
          {suspects.map((l) => (
            <li key={l.id} className="py-3 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => onOpen(l.id)} className="min-w-0 flex-1 text-right">
                <p className="font-semibold text-ink">{l.name}</p>
                <p className="text-xs text-amber-700"><HiOutlineExclamationTriangle className="inline-block w-4 h-4 align-[-3px] ml-1" aria-hidden="true" />{quality.get(l.id)?.reasons.join(' · ')}</p>
                <p className="text-[12.5px] text-gray-400">{sourceLabel(l.source)}{l.phone ? ` · ${displayPhone(l.phone)}` : ''}{l.email ? ` · ${l.email}` : ''}</p>
              </button>
              <div className="flex gap-1.5">
                <Btn disabled={busy} onClick={() => run(() => save.mutateAsync({ id: l.id, lead: { is_test: true } }), 'اتخفى — حساب تيست')}><HiOutlineBeaker className="w-4 h-4" aria-hidden="true" /> تيست بتاعي — اخفيه</Btn>
                <Btn disabled={busy} onClick={() => run(() => qualify.mutateAsync({ leadId: l.id, manual: true }), 'اتعلّمت عيادة حقيقية')}><HiOutlineCheck className="w-4 h-4" aria-hidden="true" /> عيادة حقيقية</Btn>
                <Btn tone="danger" disabled={busy} onClick={() => run(() => del.mutateAsync(l.id), 'اتمسح')} aria-label="مسح"><HiOutlineTrash className="w-4 h-4" aria-hidden="true" /></Btn>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[12.5px] text-gray-400 mt-3">«تيست بتاعي» = حساب إنت عملته وإنت بتجرّب النظام، بيستخبى من القايمة والأرقام والعمولات (مش بيتمسح). «عيادة حقيقية» = إنت متأكد إنها عيادة بجد، فالتحذير بيتشال، ولو جاية من مندوب مكافأته بتتحسب.</p>
    </Card>
  )
}

/** What the verified / not-sure / looks-wrong marks on each clinic mean. */
function QualityLegend() {
  return (
    <div className="grid sm:grid-cols-3 gap-2 text-xs leading-relaxed">
      <p className="rounded-lg bg-accent-50 border border-accent-200 text-ink px-3 py-2">
        <b className="inline-flex items-center gap-1">{(() => { const Q = QUALITY_ICON.real; return <Q className="w-4 h-4 text-accent-600" aria-hidden="true" /> })()} متأكدين إنها عيادة حقيقية</b> — لقيناها على خرائط جوجل، أو عندها حجوزات من مرضى حقيقيين، أو إنت كلّمتها وأكّدت.
      </p>
      <p className="rounded-lg bg-paper border border-rule text-ink px-3 py-2">
        <b className="inline-flex items-center gap-1">{(() => { const Q = QUALITY_ICON.unknown; return <Q className="w-4 h-4 text-ink-soft" aria-hidden="true" /> })()} لسه مش متأكدين</b> — مفيش حاجة غلط، بس مفيش دليل لسه (مثلاً سيبت رقمها في الفورم). اتأكد في أول مكالمة.
      </p>
      <p className="rounded-lg bg-amber-50 border border-amber-200 text-ink px-3 py-2">
        <b className="inline-flex items-center gap-1">{(() => { const Q = QUALITY_ICON.suspect; return <Q className="w-4 h-4 text-amber-600" aria-hidden="true" /> })()} شكلها غلط</b> — رقمك إنت، أو اسم فيه «تجربة» أو «test»، أو رقم متكرر الأرقام… راجعها من «محتاجين مراجعة».
      </p>
    </div>
  )
}
