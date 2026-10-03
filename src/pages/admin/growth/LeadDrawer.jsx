import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { HiOutlineXMark, HiOutlinePhone, HiOutlineTrash, HiOutlinePencilSquare, HiOutlineArrowTopRightOnSquare } from 'react-icons/hi2'
import { FaWhatsapp } from 'react-icons/fa'
import { STAGES, OUTCOMES, ACTIVITY_KINDS, SIGNAL_LABELS, OUTCOME_BY_KEY } from '../../../lib/growth/constants'
import { scoreLead } from '../../../lib/growth/scoring'
import { chooseAngle, SALES_ANGLES } from '../../../lib/growth/angles'
import { openingMessage, followUpMessage, CALL_SCRIPT } from '../../../lib/growth/messages'
import { displayPhone, whatsappLink, telLink } from '../../../lib/growth/phone'
import { registerLink, previewLink } from '../../../lib/growth/links'
import { defaultPreview, PREVIEW_COLORS } from '../../../lib/growth/preview'
import { useLeadActivities, useLogActivity, useSaveLead, useDeleteLead, useQualifyLead, useQualifyStatus } from '../../../hooks/useGrowth'
import ConfirmDialog from '../../../components/ui/ConfirmDialog'
import LeadForm from './LeadForm'
import { Btn, Card, Field, ScoreBadge, ScoreBar, StageBadge } from './ui'
import { categoryLabel, copyText, formatDateTime, fromLocalInput, inputClass, sourceLabel } from './format'

const PART_LABELS = { fit: 'مناسب لينا قد إيه', intent: 'نيّة الشراء', pain: 'المشكلة واضحة', activity: 'نشاط المكان', contactability: 'سهل نوصله' }

export default function LeadDrawer({ lead, leads, partners, settings, onClose }) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const del = useDeleteLead()

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const { total, parts } = useMemo(
    () => scoreLead(lead, { weights: settings?.weights, targetAreas: settings?.target_areas }),
    [lead, settings]
  )
  const recommended = useMemo(() => chooseAngle(lead), [lead])

  async function remove() {
    try {
      await del.mutateAsync(lead.id)
      toast.success('اتمسح')
      onClose()
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex" dir="rtl">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="relative mr-auto ml-0 h-full w-full max-w-2xl bg-gray-50 shadow-2xl overflow-y-auto">
        <header className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-gray-900 truncate">{lead.name}</h2>
              <ScoreBadge score={total} />
              <StageBadge stage={lead.stage} />
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {categoryLabel(lead.category)}
              {lead.specialty ? ` · ${lead.specialty}` : ''}
              {lead.area || lead.city ? ` · ${[lead.area, lead.city].filter(Boolean).join('، ')}` : ''}
              {` · ${sourceLabel(lead.source)}`}
            </p>
          </div>
          <Btn tone="ghost" onClick={() => setEditing((v) => !v)} title="تعديل البيانات"><HiOutlinePencilSquare className="w-5 h-5" /></Btn>
          <Btn tone="ghost" onClick={onClose} title="إغلاق"><HiOutlineXMark className="w-5 h-5" /></Btn>
        </header>

        <div className="p-4 space-y-4">
          {editing ? (
            <Card title="تعديل البيانات">
              <LeadForm lead={lead} leads={leads} partners={partners} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} />
            </Card>
          ) : (
            <ContactRow lead={lead} />
          )}

          <Recommendation recommended={recommended} />
          <AccountCard lead={lead} />
          <Composer lead={lead} recommended={recommended} />
          <OutcomeLogger lead={lead} angle={recommended.key} />
          <CallScript lead={lead} angle={recommended.key} />
          <Research lead={lead} />

          <Card title="ليه التقييم ده؟">
            <div className="space-y-3">
              {Object.entries(parts).map(([key, part]) => (
                <ScoreBar key={key} label={`${PART_LABELS[key]} (وزن ${settings?.weights?.[key] ?? '—'})`} score={part.score} reasons={part.reasons} />
              ))}
            </div>
          </Card>

          <PreviewEditor lead={lead} />
          <Timeline lead={lead} />

          <div className="flex justify-between items-center pt-2 pb-8">
            <span className="text-[11px] text-gray-400">كود التتبع: <span dir="ltr" className="font-mono">{lead.ref_code}</span> · اتضاف {formatDateTime(lead.created_at)}</span>
            <Btn tone="danger" onClick={() => setConfirmDelete(true)}><HiOutlineTrash className="w-4 h-4" /> مسح</Btn>
          </div>
        </div>
      </aside>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        variant="danger"
        loading={del.isPending}
        title="مسح العميل"
        message={`تمسح ${lead.name} وكل سجل التواصل معاه؟ لو مش عايز تكلّمه تاني، الأحسن تختار «ماتكلّمنيش تاني» بدل المسح — عشان مايتضافش تاني بالغلط.`}
        confirmLabel="مسح"
      />
    </div>
  )
}

function ContactRow({ lead }) {
  const links = [
    lead.google_maps_url && ['خرائط جوجل', lead.google_maps_url],
    lead.instagram && ['إنستجرام', lead.instagram.startsWith('http') ? lead.instagram : `https://instagram.com/${lead.instagram.replace('@', '')}`],
    lead.facebook && ['فيسبوك', lead.facebook],
    lead.website && ['الموقع', lead.website],
  ].filter(Boolean)
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        {lead.phone ? (
          <>
            <a href={telLink(lead.phone)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent-500 text-white text-sm font-bold hover:bg-accent-600">
              <HiOutlinePhone className="w-4 h-4" /> اتصال
            </a>
            <button type="button" onClick={() => copyText(displayPhone(lead.phone), 'الرقم اتنسخ')} className="text-sm font-mono text-gray-700 px-2 py-2 rounded-lg hover:bg-gray-100" dir="ltr">
              {displayPhone(lead.phone)}
            </button>
          </>
        ) : (
          <span className="text-sm text-gray-400">مفيش رقم</span>
        )}
        {lead.contact_person && <span className="text-sm text-gray-600">· {lead.contact_person}</span>}
        {lead.email && <a href={`mailto:${lead.email}`} className="text-sm text-blue-600 hover:underline" dir="ltr">{lead.email}</a>}
      </div>
      {links.length > 0 && (
        <div className="flex flex-wrap gap-3 mt-3 text-xs">
          {links.map(([label, href]) => (
            <a key={label} href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
              {label} <HiOutlineArrowTopRightOnSquare className="w-3 h-3" />
            </a>
          ))}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2 mt-3 text-[11px] text-gray-500">
        <div>آخر تواصل: <b className="text-gray-700">{formatDateTime(lead.last_contacted_at)}</b></div>
        <div>المتابعة الجاية: <b className="text-gray-700">{formatDateTime(lead.next_follow_up_at)}</b></div>
        <div>محاولات: <b className="text-gray-700">{lead.contact_attempts}</b></div>
      </div>
      {lead.notes && <p className="mt-3 text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2 whitespace-pre-wrap">{lead.notes}</p>}
    </Card>
  )
}

function Recommendation({ recommended }) {
  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
      <p className="text-[11px] font-bold text-violet-500">🤖 توصية النظام — مش حقيقة، اقتراح</p>
      <p className="mt-1 font-bold text-violet-900">ابدأ بزاوية: {recommended.label}</p>
      <p className="text-sm text-violet-800 mt-1 leading-relaxed">{recommended.pitch}</p>
      <p className="text-[11px] text-violet-600 mt-2">
        {recommended.basis === 'evidence' ? '📌 على أساس: ' : 'ℹ️ '}
        {recommended.because}
      </p>
    </div>
  )
}

function Composer({ lead, recommended }) {
  const [angle, setAngle] = useState(recommended.key)
  const [variant, setVariant] = useState('opener')
  // Hand edits are kept per angle/variant, so switching tabs doesn't lose them.
  const [edits, setEdits] = useState({})
  const log = useLogActivity()
  const editKey = `${angle}:${variant}`
  const generated = useMemo(
    () => (variant === 'opener' ? openingMessage(lead, angle) : followUpMessage(lead, variant === 'follow2' ? 2 : 1)),
    [lead, angle, variant]
  )
  const text = edits[editKey] ?? generated
  const setText = (value) => setEdits((e) => ({ ...e, [editKey]: value }))

  async function sendEmail() {
    const subject = `صفحة حجز أونلاين لـ ${lead.name}`
    window.location.href = `mailto:${lead.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`
    try {
      await log.mutateAsync({ leadId: lead.id, kind: 'email', outcome: 'sent', salesAngle: angle, note: text })
      toast.success('اتسجّل إنك بعتّ إيميل — المتابعة بعد يومين')
    } catch (e) {
      toast.error(e.message)
    }
  }

  async function send() {
    const url = whatsappLink(lead.phone, text)
    if (!url) return toast.error('مفيش رقم')
    window.open(url, '_blank', 'noopener,noreferrer')
    try {
      await log.mutateAsync({ leadId: lead.id, kind: 'whatsapp', outcome: 'sent', salesAngle: angle, note: text })
      toast.success('اتسجّل إنك بعتّ — المتابعة بعد يومين')
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <Card title="💬 رسالة واتساب" actions={
      <div className="flex gap-1">
        {[['opener', 'أول رسالة'], ['follow1', 'متابعة 1'], ['follow2', 'متابعة أخيرة']].map(([k, label]) => (
          <button key={k} type="button" onClick={() => setVariant(k)}
            className={`text-[11px] px-2 py-1 rounded-md font-semibold ${variant === k ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
            {label}
          </button>
        ))}
      </div>
    }>
      {variant === 'opener' && (
        <select className={`${inputClass} mb-2`} value={angle} onChange={(e) => setAngle(e.target.value)}>
          {Object.entries(SALES_ANGLES).map(([k, a]) => (
            <option key={k} value={k}>{a.label}{k === recommended.key ? ' (مقترحة)' : ''}</option>
          ))}
        </select>
      )}
      <textarea className={`${inputClass} min-h-[150px] leading-relaxed`} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex flex-wrap gap-2 mt-2">
        {lead.phone ? (
          <Btn tone="whatsapp" onClick={send} disabled={log.isPending}>
            <FaWhatsapp className="w-4 h-4" /> افتح الواتساب وابعت
          </Btn>
        ) : lead.email ? (
          <Btn tone="primary" onClick={sendEmail} disabled={log.isPending}>✉️ مفيش رقم — ابعت إيميل</Btn>
        ) : null}
        <Btn onClick={() => copyText(text)}>نسخ</Btn>
      </div>
      {!lead.phone && (
        <p className="text-[11px] text-amber-700 mt-2">
          مفيش رقم للعميل ده (غالباً سجّل قبل ما نبدأ نحفظ الرقم وقت التسجيل). ابعتله إيميل يطلب رقمه، ولما تعرفه ضيفه من ✏️ فوق.
        </p>
      )}
      <p className="text-[11px] text-gray-400 mt-2">الرسالة بتتفتح في الواتساب بتاعك وإنت اللي بتضغط إرسال — النظام مش بيبعت حاجة لوحده.</p>
    </Card>
  )
}

function OutcomeLogger({ lead, angle }) {
  const [kind, setKind] = useState('call')
  const [outcome, setOutcome] = useState(null)
  const [next, setNext] = useState('')
  const [note, setNote] = useState('')
  const [stage, setStage] = useState('')
  const log = useLogActivity()

  const needsDate = outcome === 'call_later'

  async function save() {
    if (!outcome && !note.trim() && !stage && !next) return toast.error('اختار النتيجة أو اكتب ملاحظة')
    if (needsDate && !next) return toast.error('حدد ميعاد المكالمة الجاية')
    try {
      await log.mutateAsync({
        leadId: lead.id,
        kind: outcome ? kind : 'note',
        outcome: outcome ?? undefined,
        note: note.trim() || undefined,
        salesAngle: outcome ? angle : undefined,
        nextFollowUpAt: fromLocalInput(next) ?? undefined,
        stage: stage || undefined,
      })
      toast.success('اتسجّل')
      setOutcome(null); setNext(''); setNote(''); setStage('')
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <Card title="📝 حصل إيه؟">
      <div className="flex gap-1.5 mb-3">
        {['call', 'whatsapp', 'visit'].map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)}
            className={`text-xs px-3 py-1.5 rounded-lg font-semibold ${kind === k ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
            {ACTIVITY_KINDS[k]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {OUTCOMES.map((o) => (
          <button key={o.key} type="button" onClick={() => setOutcome(outcome === o.key ? null : o.key)}
            className={`text-xs px-2 py-2 rounded-lg border font-semibold transition-colors ${outcome === o.key ? 'border-accent-500 bg-accent-50 text-accent-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
            {o.icon} {o.label}
          </button>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 gap-3 mt-3">
        <Field label={needsDate ? 'أكلّمه إمتى؟ *' : 'المتابعة الجاية (اختياري)'} hint="لو سبتها فاضية النظام بيحدد ميعاد مناسب حسب النتيجة">
          <input type="datetime-local" className={inputClass} value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="نقل لمرحلة (اختياري)">
          <select className={inputClass} value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">حسب النتيجة</option>
            {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>
      </div>
      <textarea className={`${inputClass} mt-3 min-h-[60px]`} placeholder="ملاحظة: قال إيه؟ عندهم كام فرع؟ بيستخدموا إيه؟" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex justify-end mt-2">
        <Btn tone="primary" onClick={save} disabled={log.isPending}>{log.isPending ? 'بيتسجّل…' : 'سجّل'}</Btn>
      </div>
    </Card>
  )
}

function CallScript({ lead, angle }) {
  const [open, setOpen] = useState(false)
  return (
    <Card title="📞 سكريبت المكالمة" actions={<Btn tone="ghost" onClick={() => setOpen((v) => !v)}>{open ? 'إخفاء' : 'عرض'}</Btn>}>
      {!open ? (
        <p className="text-sm text-gray-600">{CALL_SCRIPT.opener(lead)}</p>
      ) : (
        <div className="space-y-4 text-sm text-gray-800 leading-relaxed">
          <Step n="1" title="الافتتاح">
            <p>{CALL_SCRIPT.opener(lead)}</p>
            <p className="text-gray-500 mt-1">{CALL_SCRIPT.permission}</p>
          </Step>
          <Step n="2" title="اسأل واسمع (سجّل الإجابات في الملاحظة)">
            <ul className="list-disc pr-5 space-y-1">{CALL_SCRIPT.discovery(lead).map((q) => <li key={q}>{q}</li>)}</ul>
          </Step>
          <Step n="3" title="العرض">
            <p>{CALL_SCRIPT.pitch(angle)}</p>
          </Step>
          <Step n="4" title="الاعتراضات">
            <div className="space-y-2">
              {CALL_SCRIPT.objections.map((o) => (
                <details key={o.q} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                  <summary className="cursor-pointer font-semibold">«{o.q}»</summary>
                  <p className="mt-1.5 text-gray-700">{o.a}</p>
                </details>
              ))}
            </div>
          </Step>
          <Step n="5" title="القفل">
            <ul className="list-disc pr-5 space-y-1">{CALL_SCRIPT.close.map((c) => <li key={c}>{c}</li>)}</ul>
          </Step>
        </div>
      )}
    </Card>
  )
}

function Step({ n, title, children }) {
  return (
    <div className="flex gap-3">
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-bold flex items-center justify-center">{n}</span>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-gray-900 mb-1">{title}</p>
        {children}
      </div>
    </div>
  )
}

const MANUAL_SIGNAL_TYPES = ['manual_booking', 'new_branch', 'active_social', 'review_pain_phone', 'review_pain_wait', 'review_pain_booking', 'review_pain_disorganized', 'likely_new']

function Research({ lead }) {
  const save = useSaveLead()
  const [type, setType] = useState('manual_booking')
  const [kind, setKind] = useState('fact')
  const [evidence, setEvidence] = useState('')
  const signals = Array.isArray(lead.signals) ? lead.signals : []
  const facts = signals.filter((s) => s.kind === 'fact')
  const inferences = signals.filter((s) => s.kind !== 'fact')

  async function add() {
    if (!evidence.trim()) return toast.error('اكتب الدليل: شفت إيه وفين؟')
    const signal = { type, kind, evidence: evidence.trim(), observed_at: new Date().toISOString() }
    try {
      await save.mutateAsync({ id: lead.id, lead: { signals: [...signals.filter((s) => s.type !== type), signal] } })
      setEvidence('')
      toast.success('اتضافت')
    } catch (e) {
      toast.error(e.message)
    }
  }

  async function removeSignal(t) {
    try {
      await save.mutateAsync({ id: lead.id, lead: { signals: signals.filter((s) => s.type !== t) } })
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <Card title="🔎 اللي نعرفه عنهم">
      <p className="text-[11px] font-bold text-gray-500 mb-1.5">✅ حقائق (شفناها)</p>
      <SignalList items={facts} empty="مفيش حقائق مسجّلة لسه" onRemove={removeSignal} />
      <p className="text-[11px] font-bold text-gray-500 mt-4 mb-1.5">💭 استنتاجات (ممكن تكون غلط — اتأكد في المكالمة)</p>
      <SignalList items={inferences} empty="مفيش استنتاجات" onRemove={removeSignal} />
      <div className="mt-4 pt-4 border-t border-gray-100 grid sm:grid-cols-[1fr_auto] gap-2">
        <div className="grid grid-cols-2 gap-2">
          <select className={inputClass} value={type} onChange={(e) => setType(e.target.value)}>
            {MANUAL_SIGNAL_TYPES.map((t) => <option key={t} value={t}>{SIGNAL_LABELS[t]}</option>)}
          </select>
          <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="fact">حقيقة — شفتها بنفسي</option>
            <option value="inference">استنتاج</option>
          </select>
          <input className={`${inputClass} col-span-2`} placeholder="الدليل: مثلاً «البايو بيقول احجز على الواتساب 010…»" value={evidence} onChange={(e) => setEvidence(e.target.value)} />
        </div>
        <Btn onClick={add} disabled={save.isPending} className="self-end">+ إضافة</Btn>
      </div>
    </Card>
  )
}

function SignalList({ items, empty, onRemove }) {
  return items.length === 0 ? (
      <p className="text-xs text-gray-400">{empty}</p>
    ) : (
      <ul className="space-y-2">
        {items.map((s) => (
          <li key={s.type} className="text-sm rounded-lg bg-gray-50 px-3 py-2 flex gap-2 items-start">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-800">{SIGNAL_LABELS[s.type] ?? s.type}</p>
              <p className="text-gray-600 text-xs mt-0.5 leading-relaxed">{s.evidence}</p>
              {s.source_url && <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-600 hover:underline">المصدر ↗</a>}
            </div>
            <button type="button" onClick={() => onRemove(s.type)} className="text-gray-300 hover:text-red-500" title="شيل"><HiOutlineXMark className="w-4 h-4" /></button>
          </li>
        ))}
      </ul>
    )
}

function PreviewEditor({ lead }) {
  const save = useSaveLead()
  const log = useLogActivity()
  const [draft, setDraft] = useState(() => lead.preview ?? defaultPreview(lead))
  const enabled = !!lead.preview?.enabled
  const link = previewLink(lead.ref_code)

  const setService = (i, k, v) =>
    setDraft((d) => ({ ...d, services: d.services.map((s, j) => (j === i ? { ...s, [k]: v } : s)) }))

  async function persist(nextEnabled) {
    const services = draft.services
      .filter((s) => s.name?.trim())
      .map((s) => ({ name: s.name.trim(), duration: Number(s.duration) || 30, ...(s.price ? { price: Number(s.price) } : {}) }))
    try {
      await save.mutateAsync({ id: lead.id, lead: { preview: { ...draft, services, enabled: nextEnabled } } })
      if (nextEnabled && !enabled) {
        await log.mutateAsync({ leadId: lead.id, kind: 'preview', note: `اتعملت صفحة تجريبية: ${link}` })
      }
      toast.success(nextEnabled ? 'الصفحة شغالة — ابعتلهم اللينك' : 'الصفحة اتقفلت')
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <Card title="⭐ صفحة حجز تجريبية باسمهم">
      <p className="text-xs text-gray-500 mb-3 leading-relaxed">
        صفحة توضيحية فيها اسم {lead.name} وخدماتهم، مكتوب عليها بوضوح إنها مثال. لما يدوسوا «فعّل صفحتي» بيسجّلوا ويتحسبوا عليك.
      </p>
      {enabled && (
        <div className="flex flex-wrap items-center gap-2 mb-3 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          <span className="text-xs font-bold text-emerald-700">شغالة:</span>
          <span className="text-xs text-gray-600 font-mono truncate" dir="ltr">{link}</span>
          {/* Relative, so it also opens on localhost / preview builds; the
              copied link is always the real domain the clinic will get. */}
          <a href={`/demo/${lead.ref_code}`} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-blue-600 hover:underline">👁️ افتحها</a>
          <Btn tone="ghost" className="!py-1" onClick={() => copyText(link)}>نسخ اللينك</Btn>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label="التخصص اللي يظهر">
          <input className={inputClass} value={draft.specialty ?? ''} onChange={(e) => setDraft((d) => ({ ...d, specialty: e.target.value }))} />
        </Field>
        <Field label="اللون">
          <div className="flex gap-1.5 pt-1">
            {PREVIEW_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setDraft((d) => ({ ...d, color: c }))}
                className={`w-7 h-7 rounded-full border-2 ${draft.color === c ? 'border-gray-900' : 'border-white'}`} style={{ backgroundColor: c }} aria-label={c} />
            ))}
          </div>
        </Field>
      </div>
      <p className="text-xs font-semibold text-gray-600 mt-3 mb-1">الخدمات (السعر اختياري — سيبه فاضي لو مش عارفه)</p>
      <div className="space-y-1.5">
        {draft.services.map((s, i) => (
          <div key={i} className="grid grid-cols-[1fr_80px_80px_auto] gap-1.5">
            <input className={inputClass} value={s.name} onChange={(e) => setService(i, 'name', e.target.value)} placeholder="الخدمة" />
            <input className={inputClass} type="number" value={s.duration ?? ''} onChange={(e) => setService(i, 'duration', e.target.value)} placeholder="دقيقة" />
            <input className={inputClass} type="number" value={s.price ?? ''} onChange={(e) => setService(i, 'price', e.target.value)} placeholder="سعر" />
            <button type="button" className="text-gray-300 hover:text-red-500 px-1" onClick={() => setDraft((d) => ({ ...d, services: d.services.filter((_, j) => j !== i) }))}><HiOutlineXMark className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <Btn onClick={() => setDraft((d) => ({ ...d, services: [...d.services, { name: '', duration: 30 }] }))}>+ خدمة</Btn>
        <Btn tone="primary" onClick={() => persist(true)} disabled={save.isPending}>{enabled ? 'حفظ التعديلات' : 'شغّل الصفحة'}</Btn>
        {enabled && <Btn tone="danger" onClick={() => persist(false)} disabled={save.isPending}>اقفل الصفحة</Btn>}
      </div>
      <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-gray-500">لينك التسجيل المباشر (بيتحسب عليك):</span>
        <span className="font-mono text-gray-700 truncate" dir="ltr">{registerLink(lead.ref_code)}</span>
        <Btn tone="ghost" className="!py-1" onClick={() => copyText(registerLink(lead.ref_code))}>نسخ</Btn>
      </div>
    </Card>
  )
}

function Timeline({ lead }) {
  const { data: activities = [], isLoading } = useLeadActivities(lead.id)
  return (
    <Card title="🕓 سجل التواصل">
      {isLoading ? (
        <p className="text-sm text-gray-400">بيحمّل…</p>
      ) : activities.length === 0 ? (
        <p className="text-sm text-gray-400">مفيش تواصل لسه</p>
      ) : (
        <ol className="space-y-3">
          {activities.map((a) => (
            <li key={a.id} className="text-sm border-r-2 border-gray-200 pr-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <b className="text-gray-800">{ACTIVITY_KINDS[a.kind] ?? a.kind}</b>
                {a.outcome && <span className="px-1.5 py-0.5 rounded bg-gray-100">{OUTCOME_BY_KEY[a.outcome]?.icon} {OUTCOME_BY_KEY[a.outcome]?.label}</span>}
                {a.sales_angle && <span className="text-violet-600">{SALES_ANGLES[a.sales_angle]?.label}</span>}
                <span>{formatDateTime(a.created_at)}</span>
              </div>
              {a.body && <p className="text-gray-700 mt-1 whitespace-pre-wrap leading-relaxed line-clamp-6">{a.body}</p>}
              {a.meta?.details && Object.keys(a.meta.details).length > 0 && (
                <p className="text-[11px] text-gray-500 mt-1 font-mono" dir="ltr">{JSON.stringify(a.meta.details)}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

/** Test-account flag + "is this a real clinic?" (migration 033). */
function AccountCard({ lead }) {
  const save = useSaveLead()
  const qualify = useQualifyLead()
  const { data: check } = useQualifyStatus(lead.business_id)

  async function toggleTest() {
    try {
      await save.mutateAsync({ id: lead.id, lead: { is_test: !lead.is_test } })
      toast.success(lead.is_test ? 'رجع عميل عادي' : 'اتعلّم حساب تجربة — اختفى من القايمة والأرقام')
    } catch (e) {
      toast.error(e.message)
    }
  }

  async function manualQualify() {
    try {
      await qualify.mutateAsync({ leadId: lead.id, manual: true })
      toast.success('اتأكدت — لو جه من شريك، مكافأة التسجيل اتحسبت له')
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <Card title="🧾 الحساب">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          {lead.is_test ? (
            <span className="font-bold text-gray-500">🧪 حساب تجربة — مش بيظهر في القايمة ولا الأرقام ولا العمولات</span>
          ) : (
            <span className="text-gray-600">عميل حقيقي</span>
          )}
        </div>
        <Btn tone="ghost" onClick={toggleTest} disabled={save.isPending}>
          {lead.is_test ? 'رجّعه عميل عادي' : '🧪 ده حساب تجربة'}
        </Btn>
      </div>

      {lead.business_id && !lead.is_test && (
        <div className="mt-3 pt-3 border-t border-gray-100 text-sm">
          {lead.qualified_at ? (
            <p className="text-emerald-700 font-semibold">
              ✅ عيادة حقيقية — {lead.qualified_by === 'admin' ? 'إنت أكّدتها' : 'عندها حجوزات من عملاء حقيقيين'} ({formatDateTime(lead.qualified_at)})
            </p>
          ) : (
            <>
              <p className="text-gray-700">
                ⏳ لسه مااتأكدناش إنها عيادة حقيقية.
                {check && (
                  <span className="text-gray-500">
                    {' '}حجوزات: <b>{check.appointments}/{check.need_appointments}</b> · عملاء مختلفين: <b>{check.clients}/{check.need_clients}</b>
                    {check.shared_owner_phone && <b className="text-red-600"> · رقم صاحبها مستخدم في حساب تاني ⚠️</b>}
                  </span>
                )}
              </p>
              <p className="text-[11px] text-gray-400 mt-1">بتتأكد لوحدها لما توصل للعدد ده (كل ليلة)، أو أكّدها بإيدك بعد ما تكلّمهم.</p>
              <Btn className="mt-2" onClick={manualQualify} disabled={qualify.isPending}>✅ كلّمتهم — عيادة حقيقية</Btn>
            </>
          )}
        </div>
      )}
    </Card>
  )
}
