import { useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { format, differenceInYears, parseISO } from 'date-fns'
import { ar } from 'date-fns/locale'
import toast from 'react-hot-toast'
import {
  HiOutlineUserCircle,
  HiOutlineClipboard,
  HiOutlineDocument,
  HiOutlinePhoto,
  HiOutlinePencil,
  HiOutlineTrash,
  HiOutlinePlus,
  HiOutlineXMark,
  HiOutlineArrowLeft,
  HiOutlinePrinter,
  HiOutlineClipboardDocument,
  HiOutlineChevronDown,
  HiOutlineExclamationTriangle,
  HiOutlineBeaker,
  HiOutlineSparkles,
  HiOutlineHeart,
  HiOutlineCalendarDays,
  HiOutlineBanknotes,
} from 'react-icons/hi2'
import { FaWhatsapp } from 'react-icons/fa'
import { useBusiness } from '../../hooks/useBusiness'
import { MEDICAL_TYPES } from '../../utils/constants'
import {
  usePatientRecord,
  useUpsertPatientRecord,
  useDiagnoses,
  useAddDiagnosis,
  useUpdateDiagnosis,
  usePrescriptions,
  useAddPrescription,
  useAttachments,
  useUploadAttachment,
  useDeleteAttachment,
  usePatientVisits,
} from '../../hooks/usePatientRecord'
import PageWrapper from '../../components/layout/PageWrapper'
import DatePicker from '../../components/ui/DatePicker'
import Dropdown from '../../components/ui/Dropdown'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import ClientPlanTab from '../crm/ClientPlanTab'
import ClientLedgerTab from '../crm/ClientLedgerTab'

// ─── Constants ────────────────────────────────────────────────────
const STATUS_COLORS = {
  confirmed: { dot: 'bg-accent-500', label: 'مؤكد', badge: 'bg-accent-50 text-accent-700 border-accent-200' },
  completed: { dot: 'bg-blue-500', label: 'مكتمل', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  cancelled: { dot: 'bg-red-400', label: 'ملغي', badge: 'bg-red-50 text-red-600 border-red-200' },
  no_show: { dot: 'bg-amber-400', label: 'لم يحضر', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  waitlist: { dot: 'bg-primary-400', label: 'انتظار', badge: 'bg-primary-50 text-primary-700 border-primary-200' },
}

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
const FREQ_OPTIONS = ['يومي', 'مرتين يومياً', '3 مرات يومياً', 'عند الحاجة', 'أسبوعياً']
const FILE_TYPE_LABELS = { xray: 'أشعة', lab: 'تحليل', report: 'تقرير', other: 'أخرى' }
const FILE_TYPE_COLORS = { xray: 'bg-blue-100 text-blue-700', lab: 'bg-purple-100 text-purple-700', report: 'bg-amber-100 text-amber-700', other: 'bg-slate-100 text-slate-600' }

function calcAge(dob) {
  if (!dob) return null
  try { return differenceInYears(new Date(), parseISO(dob)) } catch { return null }
}

// ─── Colored Tag Input ────────────────────────────────────────────
function TagInput({ tags = [], onChange, placeholder, chipClass = 'bg-primary-50 text-primary-700 border-primary-200' }) {
  const [val, setVal] = useState('')
  function add() {
    const t = val.trim()
    if (!t || tags.includes(t)) return
    onChange([...tags, t]); setVal('')
  }
  function remove(t) { onChange(tags.filter(x => x !== t)) }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[36px]">
        {tags.map(t => (
          <span key={t} className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border font-medium ${chipClass}`}>
            {t}
            <button type="button" onClick={() => remove(t)} className="hover:opacity-70">
              <HiOutlineXMark className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder={placeholder}
          className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" />
        <button type="button" onClick={add} className="px-3 py-2 bg-accent-50 text-accent-600 rounded-xl hover:bg-accent-100 transition-colors min-h-[40px]">
          <HiOutlinePlus className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Shared helpers ───────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">{title}</h3>
      {children}
    </div>
  )
}
function Field({ label, children, className = '' }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

// ─── Patient Header with Stats Strip ─────────────────────────────
function PatientHeader({ clientPhone, clientName, visits = [], diagnoses = [] }) {
  const age = null
  const initials = (clientName || '؟').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const lastVisit = visits[0]?.appointment_date
  const totalVisits = visits.length
  const totalDiagnoses = diagnoses.length

  return (
    <div className="bg-white border-b border-slate-100">
      {/* Main header row */}
      <div className="px-4 sm:px-6 pt-5 pb-4 flex items-start gap-4">
        <div className="relative flex-shrink-0">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center text-white text-xl font-bold leading-none shadow-md">
            {initials}
          </div>
        </div>

        <div className="flex-1 min-w-0 pt-0.5">
          <h1 className="text-lg font-bold text-slate-900 leading-tight">{clientName}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs text-slate-400 font-mono" dir="ltr">{clientPhone}</span>
            <button onClick={() => { navigator.clipboard.writeText(clientPhone); toast.success('تم النسخ', { duration: 1200 }) }}
              className="text-slate-300 hover:text-accent-600 transition-colors">
              <HiOutlineClipboardDocument className="w-3.5 h-3.5" />
            </button>
            <a href={`https://wa.me/${clientPhone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-600 rounded-full text-xs font-medium hover:bg-green-100 transition-colors">
              <FaWhatsapp className="w-3 h-3" />
              واتساب
            </a>
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100" dir="ltr">
        {[
          { value: totalVisits, label: 'زيارة', icon: HiOutlineCalendarDays },
          { value: totalDiagnoses, label: 'تشخيص', icon: HiOutlineClipboard },
          { value: lastVisit ? format(parseISO(lastVisit), 'MM/yyyy') : '—', label: 'آخر زيارة', icon: HiOutlineHeart },
        ].map(({ value, label, icon: Icon }) => (
          <div key={label} className="flex flex-col items-center py-2.5 gap-0.5">
            <Icon className="w-3.5 h-3.5 text-slate-300 mb-0.5" />
            <span className="text-sm font-bold text-slate-900">{value}</span>
            <span className="text-[10px] text-slate-400">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── TAB 1: Basic Info ─────────────────────────────────────────────
function TabBasicInfo({ businessId, clientPhone, clientName }) {
  const { data: record } = usePatientRecord(businessId, clientPhone)
  const upsert = useUpsertPatientRecord(businessId, clientPhone)
  const saveTimer = useRef(null)

  function autoSave(field, value) {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        await upsert.mutateAsync({ [field]: value, client_name: clientName })
        toast.success('تم الحفظ', { duration: 1200 })
      } catch (e) { toast.error(e.message) }
    }, 800)
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <Section title="المعلومات الشخصية">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="تاريخ الميلاد">
            <DatePicker value={record?.date_of_birth || ''} onChange={v => autoSave('date_of_birth', v || null)} />
          </Field>
          <Field label="الجنس">
            <div className="flex gap-2">
              {[{ val: 'male', label: 'ذكر' }, { val: 'female', label: 'أنثى' }].map(g => (
                <button key={g.val} type="button" onClick={() => autoSave('gender', record?.gender === g.val ? null : g.val)}
                  className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-medium transition-colors min-h-[44px] ${record?.gender === g.val ? 'border-accent-500 bg-accent-50 text-accent-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                  {g.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="الرقم القومي">
            <input type="text" defaultValue={record?.national_id || ''} onBlur={e => autoSave('national_id', e.target.value)} placeholder="14 رقم" className="field-input" dir="ltr" />
          </Field>
          <Field label="البريد الإلكتروني">
            <input type="email" defaultValue={record?.email || ''} onBlur={e => autoSave('email', e.target.value)} placeholder="example@mail.com" className="field-input" dir="ltr" />
          </Field>
          <Field label="العنوان" className="sm:col-span-2">
            <input type="text" defaultValue={record?.address || ''} onBlur={e => autoSave('address', e.target.value)} placeholder="العنوان التفصيلي" className="field-input" />
          </Field>
        </div>
      </Section>

      <Section title="معلومات الطوارئ">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="اسم جهة الطوارئ">
            <input type="text" defaultValue={record?.emergency_contact_name || ''} onBlur={e => autoSave('emergency_contact_name', e.target.value)} placeholder="اسم الشخص" className="field-input" />
          </Field>
          <Field label="رقم الطوارئ">
            <input type="tel" defaultValue={record?.emergency_contact_phone || ''} onBlur={e => autoSave('emergency_contact_phone', e.target.value)} placeholder="رقم الهاتف" className="field-input" dir="ltr" />
          </Field>
        </div>
      </Section>

      <Section title="المعلومات الطبية">
        <div className="space-y-5">
          <Field label="فصيلة الدم">
            <div className="flex flex-wrap gap-2">
              {BLOOD_TYPES.map(bt => (
                <button key={bt} type="button" onClick={() => autoSave('blood_type', record?.blood_type === bt ? null : bt)}
                  className={`px-3 py-1.5 rounded-xl border-2 text-sm font-medium transition-colors min-h-[40px] ${record?.blood_type === bt ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-200 text-slate-600 hover:border-red-200'}`}>
                  {bt}
                </button>
              ))}
            </div>
          </Field>

          <Field label={<span className="flex items-center gap-1.5"><HiOutlineExclamationTriangle className="w-3.5 h-3.5 text-red-500" />الحساسية</span>}>
            <TagInput tags={record?.allergies || []} onChange={val => autoSave('allergies', val)} placeholder="أضف نوع حساسية..." chipClass="bg-red-50 text-red-700 border-red-200" />
          </Field>
          <Field label={<span className="flex items-center gap-1.5"><HiOutlineHeart className="w-3.5 h-3.5 text-amber-500" />أمراض مزمنة</span>}>
            <TagInput tags={record?.chronic_conditions || []} onChange={val => autoSave('chronic_conditions', val)} placeholder="أضف مرض مزمن..." chipClass="bg-amber-50 text-amber-700 border-amber-200" />
          </Field>
          <Field label={<span className="flex items-center gap-1.5"><HiOutlineSparkles className="w-3.5 h-3.5 text-blue-500" />أدوية حالية</span>}>
            <TagInput tags={record?.current_medications || []} onChange={val => autoSave('current_medications', val)} placeholder="أضف دواء..." chipClass="bg-blue-50 text-blue-700 border-blue-200" />
          </Field>
        </div>
      </Section>
    </div>
  )
}

// ─── TAB 1 (simple, non-medical types): Basic Info only ────────────
function TabBasicInfoSimple({ businessId, clientPhone, clientName, visits = [] }) {
  const { data: record } = usePatientRecord(businessId, clientPhone)
  const upsert = useUpsertPatientRecord(businessId, clientPhone)
  const saveTimer = useRef(null)

  function autoSave(field, value) {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        await upsert.mutateAsync({ [field]: value, client_name: clientName })
        toast.success('تم الحفظ', { duration: 1200 })
      } catch (e) { toast.error(e.message) }
    }, 800)
  }

  const lastVisit = visits[0]?.appointment_date
  const age = calcAge(record?.date_of_birth)

  const billableVisits = visits.filter(v => v.status !== 'cancelled')
  const totalSpent = billableVisits.reduce((s, v) => s + (v.price ?? v.services?.price ?? 0), 0)
  const totalPaid = billableVisits.reduce((s, v) => s + (v.amount_paid || (v.payment_status === 'paid' ? (v.price ?? v.services?.price ?? 0) : 0)), 0)
  const totalOwed = Math.max(0, totalSpent - totalPaid)

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <Section title="بيانات العميل">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="الاسم">
            <input type="text" value={clientName} disabled className="field-input bg-slate-50 text-slate-400" />
          </Field>
          <Field label="رقم الهاتف">
            <input type="text" value={clientPhone} disabled dir="ltr" className="field-input bg-slate-50 text-slate-400" />
          </Field>
          <Field label="تاريخ الميلاد">
            <DatePicker value={record?.date_of_birth || ''} onChange={v => autoSave('date_of_birth', v || null)} />
            {age != null && <p className="text-xs text-slate-400 mt-1">{age} سنة</p>}
          </Field>
        </div>
      </Section>

      <Section title="ملخص الزيارات">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-slate-900">{visits.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">إجمالي الزيارات</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-sm font-bold text-slate-900">{lastVisit ? format(parseISO(lastVisit), 'dd MMMM yyyy', { locale: ar }) : '—'}</p>
            <p className="text-xs text-slate-500 mt-0.5">تاريخ آخر زيارة</p>
          </div>
        </div>
        {totalSpent > 0 && (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="bg-accent-50 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-accent-700">{totalPaid} ج.م</p>
              <p className="text-xs text-accent-600 mt-0.5">إجمالي المدفوع</p>
            </div>
            <div className={`rounded-xl p-3 text-center ${totalOwed > 0 ? 'bg-amber-50' : 'bg-slate-50'}`}>
              <p className={`text-lg font-bold ${totalOwed > 0 ? 'text-amber-700' : 'text-slate-900'}`}>{totalOwed} ج.م</p>
              <p className={`text-xs mt-0.5 ${totalOwed > 0 ? 'text-amber-600' : 'text-slate-500'}`}>المتبقي</p>
            </div>
          </div>
        )}
      </Section>

      <Section title="ملاحظات">
        <textarea defaultValue={record?.notes || ''} onBlur={e => autoSave('notes', e.target.value)} rows={4}
          placeholder="اكتب ملاحظة عن العميل..." className="field-input resize-none" />
      </Section>
    </div>
  )
}

// ─── TAB 2: Visits / Timeline ──────────────────────────────────────
function DiagnosisForm({ appointmentId, businessId, clientPhone, existing, onDone, clientName }) {
  const [diagnosis, setDiagnosis] = useState(existing?.diagnosis || '')
  const [treatment, setTreatment] = useState(existing?.treatment || '')
  const [notes, setNotes] = useState(existing?.notes || '')
  const [followUp, setFollowUp] = useState(existing?.follow_up_date || '')
  const add = useAddDiagnosis(businessId, clientPhone)
  const update = useUpdateDiagnosis(businessId, clientPhone)

  async function handleSave() {
    if (!diagnosis.trim()) return
    try {
      if (existing) await update.mutateAsync({ id: existing.id, diagnosis, treatment, notes, follow_up_date: followUp || null })
      else await add.mutateAsync({ appointmentId, diagnosis, treatment, notes, follow_up_date: followUp || null })
      toast.success('تم الحفظ'); onDone()
    } catch (e) { toast.error(e.message) }
  }

  return (
    <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-primary-100 mt-3">
      {[
        { label: 'التشخيص *', val: diagnosis, set: setDiagnosis, rows: 2 },
        { label: 'العلاج', val: treatment, set: setTreatment, rows: 2 },
        { label: 'ملاحظات', val: notes, set: setNotes, rows: 2 },
      ].map(({ label, val, set, rows }) => (
        <Field key={label} label={label}>
          <textarea value={val} onChange={e => set(e.target.value)} rows={rows} className="field-input resize-none" placeholder={label.replace(' *', '')} />
        </Field>
      ))}
      <Field label="موعد المتابعة">
        <DatePicker value={followUp} onChange={setFollowUp} />
      </Field>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onDone} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-100 transition-colors">إلغاء</button>
        <button type="button" onClick={handleSave} disabled={!diagnosis.trim() || add.isPending || update.isPending}
          className="flex-1 py-2.5 bg-accent-500 hover:bg-accent-600 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
          {add.isPending || update.isPending ? 'جاري الحفظ...' : 'حفظ'}
        </button>
      </div>
    </div>
  )
}

function VisitCard({ visit, businessId, clientPhone, diagnosesMap, clientName }) {
  const [expanded, setExpanded] = useState(false)
  const [showDiagForm, setShowDiagForm] = useState(false)
  const diag = diagnosesMap[visit.id]
  const s = STATUS_COLORS[visit.status] || { dot: 'bg-slate-400', badge: 'bg-slate-50 text-slate-600 border-slate-200' }

  return (
    <div className="relative pr-8" dir="rtl">
      {/* Timeline connector line */}
      <div className="absolute right-[9px] top-6 bottom-[-12px] w-0.5 bg-slate-100 last:hidden" />
      {/* Timeline dot */}
      <div className={`absolute right-1.5 top-[18px] w-3.5 h-3.5 rounded-full ${s.dot} ring-2 ring-white shadow-sm z-10`} />

      <div className={`bg-white rounded-xl border border-slate-100 hover:border-slate-200 transition-all mb-3 shadow-sm overflow-hidden`}>
        {/* Header row */}
        <button type="button" onClick={() => setExpanded(e => !e)}
          className="w-full text-right px-4 py-3.5 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900 text-sm truncate">{visit.services?.name || 'خدمة غير محددة'}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {visit.appointment_date && format(parseISO(visit.appointment_date), 'dd MMMM yyyy', { locale: ar })}
              {visit.appointment_time && ` — ${visit.appointment_time.slice(0, 5)}`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${s.badge}`}>{s.label}</span>
            <HiOutlineChevronDown className={`w-4 h-4 text-slate-300 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </div>
        </button>

        {/* Accordion body */}
        {expanded && (
          <div className="border-t border-slate-50 px-4 pb-4 pt-3 space-y-3">
            {diag ? (
              <div className="space-y-2.5">
                {[
                  { label: 'التشخيص', val: diag.diagnosis, className: 'text-slate-800 font-medium' },
                  { label: 'العلاج', val: diag.treatment, className: 'text-slate-700' },
                  { label: 'ملاحظات', val: diag.notes, className: 'text-slate-500 italic' },
                ].filter(r => r.val).map(({ label, val, className }) => (
                  <div key={label}>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{label}</span>
                    <p className={`text-sm mt-0.5 ${className}`}>{val}</p>
                  </div>
                ))}
                {diag.follow_up_date && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 text-xs rounded-lg border border-amber-200 font-medium">
                    <HiOutlineCalendarDays className="w-3.5 h-3.5" />
                    متابعة: {format(parseISO(diag.follow_up_date), 'dd/MM/yyyy')}
                  </span>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-300 italic">لم يُضف تشخيص بعد</p>
            )}

            {!showDiagForm && (
              <button onClick={e => { e.stopPropagation(); setShowDiagForm(true) }}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-xl transition-colors">
                <HiOutlinePencil className="w-3.5 h-3.5" />
                {diag ? 'تعديل التشخيص' : 'إضافة تشخيص'}
              </button>
            )}

            {showDiagForm && (
              <div onClick={e => e.stopPropagation()}>
                <DiagnosisForm appointmentId={visit.id} businessId={businessId} clientPhone={clientPhone}
                  existing={diag} clientName={clientName} onDone={() => setShowDiagForm(false)} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function TabVisits({ businessId, clientPhone, clientName }) {
  const { data: visits = [], isLoading } = usePatientVisits(businessId, clientPhone)
  const { data: diagnoses = [] } = useDiagnoses(businessId, clientPhone)
  const diagnosesMap = diagnoses.reduce((acc, d) => { if (d.appointment_id) acc[d.appointment_id] = d; return acc }, {})

  if (isLoading) return <div className="p-6 space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>

  if (!visits.length) return (
    <div className="flex flex-col items-center justify-center py-20 text-center p-6">
      <HiOutlineClipboard className="w-12 h-12 text-slate-200 mb-3" />
      <p className="text-slate-400 text-sm">لسه مفيش زيارات مسجلة</p>
    </div>
  )

  return (
    <div className="p-4 sm:p-6" dir="rtl">
      {visits.map(visit => (
        <VisitCard key={visit.id} visit={visit} businessId={businessId} clientPhone={clientPhone}
          diagnosesMap={diagnosesMap} clientName={clientName} />
      ))}
    </div>
  )
}

// ─── TAB 3: Prescriptions ──────────────────────────────────────────
function PrescriptionModal({ onClose, businessId, clientPhone }) {
  const [rows, setRows] = useState([{ drug: '', dose: '', freq: 'يومي', duration: '', notes: '' }])
  const [instructions, setInstructions] = useState('')
  const add = useAddPrescription(businessId, clientPhone)

  function addRow() { setRows(r => [...r, { drug: '', dose: '', freq: 'يومي', duration: '', notes: '' }]) }
  function removeRow(i) { if (rows.length === 1) return; setRows(r => r.filter((_, idx) => idx !== i)) }
  function updateRow(i, field, val) { setRows(r => r.map((row, idx) => idx === i ? { ...row, [field]: val } : row)) }

  async function handleSave() {
    const meds = rows.filter(r => r.drug.trim())
    if (!meds.length) return
    try { await add.mutateAsync({ medications: meds, instructions }); toast.success('تم حفظ الروشتة'); onClose() }
    catch (e) { toast.error(e.message) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 flex items-center gap-2"><HiOutlineDocument className="w-5 h-5 text-accent-500" />روشتة جديدة</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><HiOutlineXMark className="w-6 h-6" /></button>
        </div>
        <div className="p-5 space-y-3">
          {rows.map((row, i) => (
            <div key={i} className="bg-slate-50 rounded-xl p-3 space-y-2 border border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">دواء {i + 1}</span>
                {rows.length > 1 && <button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600"><HiOutlineTrash className="w-4 h-4" /></button>}
              </div>
              <input value={row.drug} onChange={e => updateRow(i, 'drug', e.target.value)} placeholder="اسم الدواء" className="field-input" />
              <div className="grid grid-cols-2 gap-2">
                <input value={row.dose} onChange={e => updateRow(i, 'dose', e.target.value)} placeholder="الجرعة" className="field-input" />
                <Dropdown
                  value={row.freq}
                  onChange={v => updateRow(i, 'freq', v)}
                  options={FREQ_OPTIONS.map(f => ({ value: f, label: f }))}
                />
                <input value={row.duration} onChange={e => updateRow(i, 'duration', e.target.value)} placeholder="المدة" className="field-input" />
                <input value={row.notes} onChange={e => updateRow(i, 'notes', e.target.value)} placeholder="ملاحظات" className="field-input" />
              </div>
            </div>
          ))}
          <button onClick={addRow} className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-500 hover:border-accent-300 hover:text-accent-600 transition-colors">
            <HiOutlinePlus className="w-4 h-4" />إضافة دواء آخر
          </button>
          <Field label="تعليمات عامة">
            <textarea value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="تعليمات للمريض..." rows={3} className="field-input resize-none" />
          </Field>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-slate-100 px-5 py-4">
          <button onClick={handleSave} disabled={add.isPending || !rows.some(r => r.drug.trim())}
            className="w-full py-3 bg-accent-500 hover:bg-accent-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50">
            {add.isPending ? 'جاري الحفظ...' : 'حفظ الروشتة'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TabPrescriptions({ businessId, clientPhone }) {
  const { data: prescriptions = [], isLoading } = usePrescriptions(businessId, clientPhone)
  const [showModal, setShowModal] = useState(false)

  if (isLoading) return <div className="p-6 space-y-3">{[1,2].map(i => <div key={i} className="h-32 bg-slate-100 rounded-xl animate-pulse" />)}</div>

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 px-4 py-2.5 bg-accent-500 hover:bg-accent-600 text-white text-sm font-medium rounded-xl transition-colors no-print">
          <HiOutlinePlus className="w-4 h-4" />روشتة جديدة
        </button>
      </div>

      {prescriptions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <HiOutlineDocument className="w-12 h-12 text-slate-200 mb-3" />
          <p className="text-slate-400 text-sm">لسه مفيش روشتات</p>
        </div>
      ) : (
        <div className="space-y-4">
          {prescriptions.map(p => (
            <div key={p.id} className="bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {p.appointments?.appointment_date
                      ? format(parseISO(p.appointments.appointment_date), 'dd MMMM yyyy', { locale: ar })
                      : format(parseISO(p.created_at), 'dd MMMM yyyy', { locale: ar })}
                  </p>
                  {p.appointments?.services?.name && <p className="text-xs text-slate-400">{p.appointments.services.name}</p>}
                </div>
                <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 text-xs text-slate-500 hover:bg-slate-200 rounded-lg transition-colors no-print">
                  <HiOutlinePrinter className="w-3.5 h-3.5" />طباعة
                </button>
              </div>
              <div className="p-4 overflow-x-auto">
                <table className="w-full text-sm min-w-[360px]">
                  <thead>
                    <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wide border-b border-slate-100">
                      <th className="text-right py-2 font-semibold">الدواء</th>
                      <th className="text-right py-2 font-semibold">الجرعة</th>
                      <th className="text-right py-2 font-semibold">التكرار</th>
                      <th className="text-right py-2 font-semibold">المدة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(p.medications || []).map((med, i) => (
                      <tr key={i} className={`border-b border-slate-50 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}>
                        <td className="py-2.5 pr-1 font-semibold text-slate-800">{med.drug}</td>
                        <td className="py-2.5 text-slate-500">{med.dose}</td>
                        <td className="py-2.5 text-slate-500">{med.freq}</td>
                        <td className="py-2.5 text-slate-500">{med.duration}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {p.instructions && (
                <div className="px-4 pb-4">
                  <p className="text-xs text-slate-400 font-semibold mb-1 uppercase tracking-wide">تعليمات</p>
                  <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3 leading-relaxed border border-slate-100">{p.instructions}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {showModal && <PrescriptionModal onClose={() => setShowModal(false)} businessId={businessId} clientPhone={clientPhone} />}
    </div>
  )
}

// ─── TAB 4: Attachments ────────────────────────────────────────────
function TabAttachments({ businessId, clientPhone, isMedical }) {
  const { data: attachments = [], isLoading } = useAttachments(businessId, clientPhone)
  const upload = useUploadAttachment(businessId, clientPhone)
  const del = useDeleteAttachment(businessId, clientPhone)
  const fileRef = useRef(null)
  const [pending, setPending] = useState(null)
  const [lightbox, setLightbox] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)

  async function uploadDirect(file) {
    try { await upload.mutateAsync({ file, fileType: 'other', notes: '' }); toast.success('تم الرفع بنجاح') }
    catch (e) { toast.error(e.message) }
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (isMedical) setPending({ file, fileType: 'other', notes: '' })
    else uploadDirect(file)
    e.target.value = ''
  }

  function handleDrop(e) {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (isMedical) setPending({ file, fileType: 'other', notes: '' })
    else uploadDirect(file)
  }

  async function handleUpload() {
    if (!pending) return
    try { await upload.mutateAsync(pending); toast.success('تم الرفع بنجاح'); setPending(null) }
    catch (e) { toast.error(e.message) }
  }

  function handleDelete(att) {
    setPendingDelete(att)
  }

  async function confirmDeleteAttachment() {
    const att = pendingDelete
    setPendingDelete(null)
    if (!att) return
    try { await del.mutateAsync({ id: att.id, filePath: att.file_path }); toast.success('تم الحذف') }
    catch (e) { toast.error(e.message) }
  }

  const isImage = name => /\.(jpg|jpeg|png|gif|webp)$/i.test(name || '')

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Animated drop zone */}
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-200 ${dragOver ? 'border-accent-400 bg-accent-50 scale-[1.01]' : 'border-slate-200 hover:border-accent-300 hover:bg-accent-50'}`}
      >
        <HiOutlinePhoto className={`w-10 h-10 transition-colors ${dragOver ? 'text-accent-400' : 'text-slate-300'}`} />
        <p className={`text-sm text-center transition-colors ${dragOver ? 'text-accent-600 font-medium' : 'text-slate-500'}`}>
          {dragOver ? 'أفلت الملف هنا' : 'اسحب الملف هنا أو اضغط للرفع'}
        </p>
        <p className="text-xs text-slate-400">JPG، PNG، PDF</p>
        <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={handleFileChange} className="hidden" />
      </div>

      {!isMedical && upload.isPending && (
        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-1.5 bg-accent-500 rounded-full animate-pulse w-3/4" />
        </div>
      )}

      {/* Pending file config */}
      {pending && (
        <div className="bg-white rounded-xl p-4 space-y-3 border border-accent-200 shadow-sm">
          <p className="text-sm font-semibold text-slate-700 truncate flex items-center gap-2">
            <HiOutlineDocument className="w-4 h-4 text-accent-500 flex-shrink-0" />
            {pending.file.name}
          </p>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(FILE_TYPE_LABELS).map(([val, label]) => (
              <button key={val} onClick={() => setPending(p => ({ ...p, fileType: val }))}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${pending.fileType === val ? 'bg-accent-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {label}
              </button>
            ))}
          </div>
          <input value={pending.notes} onChange={e => setPending(p => ({ ...p, notes: e.target.value }))} placeholder="ملاحظات (اختياري)" className="field-input" />
          {upload.isPending && <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-1.5 bg-accent-500 rounded-full animate-pulse w-3/4" /></div>}
          <div className="flex gap-2">
            <button onClick={() => setPending(null)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-100 transition-colors">إلغاء</button>
            <button onClick={handleUpload} disabled={upload.isPending} className="flex-1 py-2.5 bg-accent-500 hover:bg-accent-600 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
              {upload.isPending ? 'جاري الرفع...' : 'رفع'}
            </button>
          </div>
        </div>
      )}

      {/* File grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{[1,2,3,4].map(i => <div key={i} className="aspect-square bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : attachments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <HiOutlinePhoto className="w-12 h-12 text-slate-200 mb-3" />
          <p className="text-slate-400 text-sm">لسه مفيش ملفات مرفوعة</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {attachments.map(att => (
            <div key={att.id} className="bg-white border border-slate-100 rounded-xl overflow-hidden group flex flex-col">
              {isImage(att.file_name) ? (
                <div className="relative bg-slate-50 cursor-pointer aspect-square" onClick={() => setLightbox(att)}>
                  {att.signed_url
                    ? <img src={att.signed_url} alt={att.file_name} className="absolute inset-0 w-full h-full object-cover" />
                    : <div className="absolute inset-0 flex items-center justify-center"><HiOutlinePhoto className="w-8 h-8 text-slate-300" /></div>}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button onClick={e => { e.stopPropagation(); handleDelete(att) }} className="p-2 bg-red-500 text-white rounded-xl">
                      <HiOutlineTrash className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="aspect-square bg-slate-50 flex flex-col items-center justify-center gap-2 p-4">
                  <HiOutlineDocument className="w-8 h-8 text-slate-300" />
                  <p className="text-xs text-slate-400 text-center truncate w-full">{att.file_name}</p>
                </div>
              )}
              <div className="p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${FILE_TYPE_COLORS[att.file_type] || FILE_TYPE_COLORS.other}`}>
                    {FILE_TYPE_LABELS[att.file_type] || 'أخرى'}
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">{format(new Date(att.uploaded_at), 'dd/MM/yy')}</span>
                </div>
                {att.notes && <p className="text-[10px] text-slate-400 mt-1 truncate">{att.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors" onClick={() => setLightbox(null)}>
            <HiOutlineXMark className="w-8 h-8" />
          </button>
          <img src={lightbox.signed_url} alt={lightbox.file_name} className="max-w-full max-h-[85vh] rounded-xl object-contain shadow-2xl" onClick={e => e.stopPropagation()} />
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDeleteAttachment}
        variant="danger"
        loading={del.isPending}
        title="حذف الملف"
        message={pendingDelete ? `حذف "${pendingDelete.file_name}"؟` : ''}
        confirmLabel="حذف"
      />
    </div>
  )
}

// ─── Tab definitions ───────────────────────────────────────────────
const MEDICAL_TABS = [
  { id: 'info', label: 'البيانات', Icon: HiOutlineUserCircle },
  { id: 'visits', label: 'الزيارات', Icon: HiOutlineClipboard },
  { id: 'plan', label: 'خطة الزيارات', Icon: HiOutlineCalendarDays },
  { id: 'ledger', label: 'كشف الحساب', Icon: HiOutlineBanknotes },
  { id: 'prescriptions', label: 'الروشتات', Icon: HiOutlineDocument },
  { id: 'attachments', label: 'الملفات', Icon: HiOutlinePhoto },
]
const SIMPLE_TABS = [
  { id: 'info', label: 'البيانات', Icon: HiOutlineUserCircle },
  { id: 'plan', label: 'خطة الزيارات', Icon: HiOutlineCalendarDays },
  { id: 'ledger', label: 'كشف الحساب', Icon: HiOutlineBanknotes },
  { id: 'attachments', label: 'الملفات', Icon: HiOutlinePhoto },
]

// ─── Main Page ─────────────────────────────────────────────────────
export default function PatientRecord() {
  const { clientPhone } = useParams()
  const navigate = useNavigate()
  const { data: business } = useBusiness()
  const [tab, setTab] = useState('info')
  const isMedical = MEDICAL_TYPES.includes(business?.type)
  const TABS = isMedical ? MEDICAL_TABS : SIMPLE_TABS

  const { data: visits = [] } = usePatientVisits(business?.id, clientPhone)
  const { data: diagnoses = [] } = useDiagnoses(business?.id, clientPhone)
  const clientName = visits[0]?.client_name || clientPhone || 'مريض'

  return (
    <PageWrapper title={isMedical ? 'الملف الطبي' : 'ملف العميل'}>
      <Helmet>
        <title>{isMedical ? 'الملف الطبي' : 'ملف العميل'} — بسهولة</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="max-w-3xl" dir="rtl">
        {/* Back button */}
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 mb-3 transition-colors no-print">
          <HiOutlineArrowLeft className="w-4 h-4" />رجوع
        </button>

        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
          {/* Patient header with stats */}
          <PatientHeader clientPhone={clientPhone} clientName={clientName} visits={visits} diagnoses={diagnoses} />

          {/* Tabs */}
          <div className="flex overflow-x-auto border-b border-slate-100 no-print">
            {TABS.map(t => {
              const Icon = t.Icon
              const active = tab === t.id
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-1 justify-center ${active ? 'border-accent-500 text-accent-700 bg-accent-50/30' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                  <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-accent-500' : ''}`} />
                  <span>{t.label}</span>
                </button>
              )
            })}
          </div>

          {/* Tab content */}
          <div className="min-h-[400px]">
            {tab === 'info' && business && isMedical && <TabBasicInfo businessId={business.id} clientPhone={clientPhone} clientName={clientName} />}
            {tab === 'info' && business && !isMedical && <TabBasicInfoSimple businessId={business.id} clientPhone={clientPhone} clientName={clientName} visits={visits} />}
            {tab === 'visits' && business && isMedical && <TabVisits businessId={business.id} clientPhone={clientPhone} clientName={clientName} />}
            {tab === 'plan' && business && (
              <div className="p-4 sm:p-6">
                <ClientPlanTab businessId={business.id} clientPhone={clientPhone} clientName={clientName} />
              </div>
            )}
            {tab === 'ledger' && business && (
              <div className="p-4 sm:p-6">
                <ClientLedgerTab businessId={business.id} clientPhone={clientPhone} />
              </div>
            )}
            {tab === 'prescriptions' && business && isMedical && <TabPrescriptions businessId={business.id} clientPhone={clientPhone} />}
            {tab === 'attachments' && business && <TabAttachments businessId={business.id} clientPhone={clientPhone} isMedical={isMedical} />}
          </div>
        </div>
      </div>
    </PageWrapper>
  )
}
