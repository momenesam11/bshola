import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { HiOutlineArrowDownTray, HiOutlineArrowUpTray, HiOutlineCheckCircle, HiOutlineClipboardDocument, HiOutlineDocumentText, HiOutlineListBullet, HiOutlinePencilSquare, HiOutlinePhone, HiOutlineQueueList, HiOutlineShieldCheck, HiOutlineUser } from 'react-icons/hi2'
import { parseLeadsCsv, csvTemplate, parsePastedLeads } from '../../../lib/growth/csv'
import { findDuplicate } from '../../../lib/growth/dedupe'
import { normalizePhone } from '../../../lib/growth/phone'
import { useImportLeads } from '../../../hooks/useGrowth'
import LeadForm from './LeadForm'
import { Btn, Card, Field } from './ui'
import { downloadCsv, inputClass } from './format'
import { MANUAL_SOURCES, SOURCE_BY_KEY } from '../../../lib/growth/constants'

const WAYS = [
  { key: 'one', icon: HiOutlineUser, label: 'عيادة واحدة', hint: 'سمعت عنها أو حد رشّحها' },
  { key: 'paste', icon: HiOutlineClipboardDocument, label: 'الصق قايمة', hint: 'من واتساب أو Excel' },
  { key: 'file', icon: HiOutlineDocumentText, label: 'ارفع ملف', hint: 'CSV فيه عيادات كتير' },
]

/**
 * Adding leads by hand. The strip at the top answers the question this page
 * used to leave open: where does what I add actually go?
 */
export default function AddPanel({ leads, partners, onOpen, onTab }) {
  const [way, setWay] = useState('one')
  const [added, setAdded] = useState(null) // the last thing added, shown as a receipt

  return (
    <div className="space-y-4">
      <WhereItGoes />

      {added && <Receipt added={added} onOpen={onOpen} onTab={onTab} onClose={() => setAdded(null)} />}

      <div role="tablist" aria-label="طريقة الإضافة" className="grid grid-cols-3 gap-2">
        {WAYS.map((w) => (
          <button key={w.key} type="button" role="tab" aria-selected={way === w.key} onClick={() => setWay(w.key)}
            className={`rounded-xl border p-3 text-right transition-colors ${way === w.key ? 'border-accent-500 bg-accent-50' : 'border-rule bg-white hover:bg-paper'}`}>
            <w.icon className={`w-5 h-5 ${way === w.key ? 'text-accent-700' : 'text-ink-soft'}`} aria-hidden="true" />
            <p className="font-bold text-sm text-ink mt-1">{w.label}</p>
            <p className="text-xs text-ink-soft hidden sm:block">{w.hint}</p>
          </button>
        ))}
      </div>

      {way === 'one' && (
        <Card>
          <LeadForm
            key={added?.at ?? 'first'}
            quick
            leads={leads}
            partners={partners}
            onSaved={(lead, { today }) => setAdded({ kind: 'one', lead, today, at: Date.now() })}
          />
        </Card>
      )}
      {way === 'paste' && <PasteCard leads={leads} onDone={(r) => setAdded({ kind: 'many', ...r, at: Date.now() })} />}
      {way === 'file' && <FileCard leads={leads} onDone={(r) => setAdded({ kind: 'many', ...r, at: Date.now() })} />}
    </div>
  )
}

function WhereItGoes() {
  const steps = [
    { icon: HiOutlinePencilSquare, title: 'بتضيف', body: 'بالإيد، أو لصق، أو ملف.' },
    { icon: HiOutlineShieldCheck, title: 'بنشيل المكرر', body: 'نفس الرقم أو نفس الاسم في نفس المنطقة ماينضافش تاني.' },
    { icon: HiOutlineQueueList, title: 'تدخل «كل العملاء»', body: 'حالاً، بمرحلة «جديد»، ومعاها المصدر اللي اخترته.' },
    { icon: HiOutlinePhone, title: 'تظهر في المكالمات', body: 'من بكرة الصبح في قايمة جديدة، أو النهارده لو علّمت «هكلّمها النهارده».' },
  ]
  return (
    <section aria-label="إيه اللي بيحصل للي بتضيفه" className="rounded-xl border border-rule bg-white p-4">
      <p className="text-sm font-bold text-ink mb-3">اللي بتضيفه بيروح فين؟</p>
      <ol className="grid sm:grid-cols-4 gap-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex sm:block gap-2">
            <span className="inline-flex items-center gap-1.5 text-accent-700 font-bold text-sm flex-shrink-0">
              <span className="w-6 h-6 rounded-full bg-accent-50 inline-flex items-center justify-center tabular-nums text-xs">{i + 1}</span>
              <s.icon className="w-4 h-4" aria-hidden="true" />
            </span>
            <div className="sm:mt-1.5">
              <p className="text-sm font-semibold text-ink">{s.title}</p>
              <p className="text-xs text-ink-soft leading-relaxed">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-xs text-ink-soft mt-3 pt-3 border-t border-rule/60">
        مش لازم تضيف بإيدك عشان القايمة تتملى: الخرايط بتملى المخزن لوحدها. الصفحة دي للعيادات اللي إنت عرفتها بنفسك.
      </p>
    </section>
  )
}

function Receipt({ added, onOpen, onTab, onClose }) {
  return (
    <div role="status" className="rounded-xl border border-accent-300 bg-accent-50 p-4 flex flex-wrap items-center gap-3">
      <HiOutlineCheckCircle className="w-6 h-6 text-accent-600 flex-shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-[14rem]">
        {added.kind === 'one' ? (
          <>
            <p className="font-bold text-ink">«{added.lead.name}» اتضافت</p>
            <p className="text-sm text-ink-soft">{added.today ? 'هتلاقيها النهارده في «متابعات».' : added.lead.phone ? 'هتدخل قايمة مكالمات يوم من الأيام الجاية حسب تقييمها.' : 'من غير رقم، فمش هتدخل قايمة المكالمات. هتلاقيها في «كل العملاء».'}</p>
          </>
        ) : (
          <>
            <p className="font-bold text-ink">اتضاف {added.inserted} عيادة</p>
            <p className="text-sm text-ink-soft">
              {added.skipped > 0 && `${added.skipped} كانوا موجودين فاتشالوا. `}
              {added.invalid > 0 && `${added.invalid} من غير اسم فاتسابوا. `}
              هيدخلوا قايمة المكالمات من بكرة.
            </p>
          </>
        )}
      </div>
      <div className="flex gap-2">
        {added.kind === 'one' && <Btn onClick={() => onOpen(added.lead.id)}>افتحها</Btn>}
        <Btn onClick={() => onTab(added.today ? 'today' : 'leads')}>{added.today ? 'مكالمات النهارده' : 'كل العملاء'}</Btn>
        <Btn tone="ghost" onClick={onClose}>تمام</Btn>
      </div>
    </div>
  )
}

/** What a batch would do, before anything is saved, and the button that does it. */
function ImportPreview({ rows, leads, onDone, onCancel }) {
  const importLeads = useImportLeads()
  const [source, setSource] = useState('manual')

  const { fresh, dupes, noPhone } = useMemo(() => {
    const out = { fresh: [], dupes: [], noPhone: 0 }
    const seen = new Set()
    for (const r of rows) {
      const phone = normalizePhone(r.phone)
      const dup = findDuplicate(r, leads) || (phone && seen.has(phone))
      if (phone) seen.add(phone)
      if (dup) out.dupes.push(r)
      else {
        out.fresh.push(r)
        if (!phone) out.noPhone += 1
      }
    }
    return out
  }, [rows, leads])

  async function run() {
    const clean = fresh.map((r) => ({ ...r, phone: r.phone ? (normalizePhone(r.phone) ?? r.phone) : undefined }))
    try {
      let inserted = 0
      let skipped = dupes.length
      let invalid = 0
      for (let i = 0; i < clean.length; i += 1000) {
        const res = await importLeads.mutateAsync({ rows: clean.slice(i, i + 1000), source })
        inserted += res.inserted
        skipped += res.skipped
        invalid += res.invalid
      }
      onDone({ inserted, skipped, invalid })
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div className="mt-4 rounded-lg bg-paper border border-rule p-3 space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-accent-50 py-2"><b className="block text-lg tabular-nums text-accent-800">{fresh.length}</b><span className="text-xs text-ink-soft">جداد هيتضافوا</span></div>
        <div className="rounded-lg bg-white border border-rule py-2"><b className="block text-lg tabular-nums">{dupes.length}</b><span className="text-xs text-ink-soft">موجودين، هيتشالوا</span></div>
        <div className={`rounded-lg py-2 ${noPhone ? 'bg-amber-50' : 'bg-white border border-rule'}`}><b className="block text-lg tabular-nums">{noPhone}</b><span className="text-xs text-ink-soft">من غير رقم صحيح</span></div>
      </div>
      {noPhone > 0 && <p className="text-xs text-amber-800">اللي من غير رقم صحيح هيتضافوا، بس مش هيدخلوا قايمة المكالمات لحد ما تكمّل رقمهم.</p>}
      {fresh.length > 0 && (
        <ul className="text-xs text-ink-soft space-y-0.5 max-h-32 overflow-y-auto">
          {fresh.slice(0, 8).map((r, i) => <li key={i}>• {r.name}{r.phone ? ` — ${r.phone}` : ''}{r.area ? ` (${r.area})` : ''}</li>)}
          {fresh.length > 8 && <li>… و{fresh.length - 8} كمان</li>}
        </ul>
      )}
      <Field label="جبتهم منين؟" hint="عشان «الأرقام» تقولك أنهي مصدر بيجيب فلوس.">
        <select className={inputClass} value={source} onChange={(e) => setSource(e.target.value)}>
          {MANUAL_SOURCES.map((s) => <option key={s} value={s}>{SOURCE_BY_KEY[s].label}</option>)}
        </select>
      </Field>
      <div className="flex gap-2">
        <Btn tone="primary" onClick={run} disabled={importLeads.isPending || !fresh.length}>{importLeads.isPending ? 'بيضيف…' : `ضيف الـ ${fresh.length}`}</Btn>
        <Btn onClick={onCancel}>إلغاء</Btn>
      </div>
    </div>
  )
}

function PasteCard({ leads, onDone }) {
  const [text, setText] = useState('')
  const [rows, setRows] = useState(null)

  function read() {
    const parsed = parsePastedLeads(text)
    if (!parsed.length) return toast.error('مش لاقي أسماء أو أرقام في اللي لصقته')
    setRows(parsed)
  }

  return (
    <Card icon={HiOutlineListBullet} title="الصق قايمة">
      <p className="text-sm text-ink-soft mb-2 leading-relaxed">
        كل عيادة في سطر: الاسم والرقم بأي ترتيب، أو انسخ صفوف من Excel بعمود لاسم وعمود للرقم والمنطقة.
      </p>
      <textarea className={`${inputClass} min-h-[140px]`} aria-label="القايمة" value={text} onChange={(e) => { setText(e.target.value); setRows(null) }}
        placeholder={'عيادة د. سارة 01012345678\nمركز النور للأسنان، 0111 222 3333\n01234567890'} />
      {rows ? (
        <ImportPreview rows={rows} leads={leads} onCancel={() => setRows(null)} onDone={(r) => { setText(''); setRows(null); onDone(r) }} />
      ) : (
        <Btn tone="primary" className="mt-2" onClick={read} disabled={!text.trim()}>راجع قبل ما تضيف</Btn>
      )}
    </Card>
  )
}

function FileCard({ leads, onDone }) {
  const [parsed, setParsed] = useState(null)

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const { rows, error } = parseLeadsCsv(await file.text())
    if (error) return toast.error(error)
    if (!rows.length) return toast.error('الملف فاضي')
    setParsed({ name: file.name, rows })
  }

  return (
    <Card icon={HiOutlineDocumentText} title="ارفع ملف CSV">
      <ol className="text-sm text-ink-soft list-decimal pr-5 space-y-1 mb-3">
        <li>نزّل الشيت الجاهز واملاه، أو استخدم شيت عندك فيه عمود «الاسم».</li>
        <li>من Excel: <b>حفظ باسم ← CSV UTF-8</b>. (أو انسخ الصفوف واستخدم «الصق قايمة»، أسهل.)</li>
        <li>ارفعه، وهتشوف الجديد والمكرر قبل ما أي حاجة تتضاف.</li>
      </ol>
      <div className="flex flex-wrap gap-2 items-center">
        <Btn onClick={() => downloadCsv('beshola-leads-template.csv', csvTemplate())}><HiOutlineArrowDownTray className="w-4 h-4" aria-hidden="true" /> الشيت الجاهز</Btn>
        <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-ink text-white cursor-pointer hover:bg-ink-deep">
          <HiOutlineArrowUpTray className="w-4 h-4" aria-hidden="true" /> ارفع CSV
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
        </label>
        {parsed && <span className="text-sm text-ink-soft">{parsed.name}</span>}
      </div>
      {parsed && <ImportPreview rows={parsed.rows} leads={leads} onCancel={() => setParsed(null)} onDone={(r) => { setParsed(null); onDone(r) }} />}
    </Card>
  )
}
