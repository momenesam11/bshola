import { useState } from 'react'
import toast from 'react-hot-toast'
import { parseLeadsCsv, csvTemplate } from '../../../lib/growth/csv'
import { normalizePhone } from '../../../lib/growth/phone'
import { useImportLeads } from '../../../hooks/useGrowth'
import LeadForm from './LeadForm'
import { Btn, Card, Field } from './ui'
import { downloadCsv, inputClass } from './format'
import { MANUAL_SOURCES, SOURCE_BY_KEY } from '../../../lib/growth/constants'
import { HiOutlineArrowDownTray, HiOutlineArrowUpTray, HiOutlineDocumentText, HiOutlineMap, HiOutlinePlus } from 'react-icons/hi2'

/** Add one lead by hand, or import a sheet. */
export default function AddPanel({ leads, partners, onOpen }) {
  return (
    <div className="grid lg:grid-cols-2 gap-4 items-start">
      <Card icon={HiOutlinePlus} title="إضافة عيادة">
        <LeadForm key={leads.length} leads={leads} partners={partners} onSaved={(lead) => onOpen(lead.id)} />
      </Card>
      <div className="space-y-4">
        <ImportCard />
        <HowToCard />
      </div>
    </div>
  )
}

function ImportCard() {
  const [parsed, setParsed] = useState(null)
  const [source, setSource] = useState('google_maps_manual')
  const importLeads = useImportLeads()

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const { rows, error } = parseLeadsCsv(await file.text())
    if (error) return toast.error(error)
    setParsed({ name: file.name, rows })
  }

  async function run() {
    const rows = parsed.rows.map((r) => ({ ...r, phone: r.phone ? (normalizePhone(r.phone) ?? r.phone) : undefined }))
    try {
      let inserted = 0, skipped = 0, invalid = 0
      for (let i = 0; i < rows.length; i += 1000) {
        const res = await importLeads.mutateAsync({ rows: rows.slice(i, i + 1000), source })
        inserted += res.inserted; skipped += res.skipped; invalid += res.invalid
      }
      toast.success(`اتضاف ${inserted} · متكرر ${skipped}${invalid ? ` · ناقص ${invalid}` : ''}`)
      setParsed(null)
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <Card icon={HiOutlineDocumentText} title="استيراد شيت (Excel / CSV)">
      <ol className="text-sm text-ink-soft list-decimal pr-5 space-y-1 mb-3">
        <li>نزّل الشيت الجاهز واملاه (أو استخدم شيت عندك فيه عمود «الاسم»).</li>
        <li>من Excel: <b>حفظ باسم ← CSV UTF-8</b>.</li>
        <li>ارفعه هنا. المتكرر (نفس الرقم أو نفس الاسم في نفس المنطقة) بيتشال لوحده.</li>
      </ol>
      <div className="flex flex-wrap gap-2 items-center">
        <Btn onClick={() => downloadCsv('beshola-leads-template.csv', csvTemplate())}><HiOutlineArrowDownTray className="w-4 h-4" aria-hidden="true" /> الشيت الجاهز</Btn>
        <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-ink text-white cursor-pointer hover:bg-ink-deep">
          <HiOutlineArrowUpTray className="w-4 h-4" aria-hidden="true" /> ارفع CSV
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
        </label>
      </div>
      {parsed && (
        <div className="mt-4 rounded-lg bg-gray-50 p-3 space-y-3">
          <p className="text-sm"><b>{parsed.name}</b>: {parsed.rows.length} صف</p>
          <ul className="text-xs text-ink-soft space-y-0.5 max-h-32 overflow-y-auto">
            {parsed.rows.slice(0, 8).map((r, i) => <li key={i}>• {r.name} {r.phone ? `— ${r.phone}` : ''} {r.area ? `(${r.area})` : ''}</li>)}
            {parsed.rows.length > 8 && <li>… و{parsed.rows.length - 8} كمان</li>}
          </ul>
          <Field label="جبتهم منين؟">
            <select className={inputClass} value={source} onChange={(e) => setSource(e.target.value)}>
              {MANUAL_SOURCES.map((s) => <option key={s} value={s}>{SOURCE_BY_KEY[s].label}</option>)}
            </select>
          </Field>
          <div className="flex gap-2">
            <Btn tone="primary" onClick={run} disabled={importLeads.isPending}>{importLeads.isPending ? 'بيستورد…' : 'استورد'}</Btn>
            <Btn onClick={() => setParsed(null)}>إلغاء</Btn>
          </div>
        </div>
      )}
    </Card>
  )
}

function HowToCard() {
  return (
    <Card icon={HiOutlineMap} title="إزاي تجمع عيادات من خرائط جوجل بإيدك">
      <ol className="text-sm text-ink-soft list-decimal pr-5 space-y-1.5 leading-relaxed">
        <li>افتح <b>maps.google.com</b> ودوّر مثلاً: <b>«عيادة أسنان مدينة نصر»</b>.</li>
        <li>افتح كل عيادة وانسخ: الاسم، الرقم، لينك الخريطة، عدد التقييمات.</li>
        <li>اقرا آخر التقييمات: لو حد اشتكى إن <b>محدش بيرد</b> أو <b>الحجز صعب</b> — اكتبها في الملاحظات (دي أقوى إشارة).</li>
        <li>بص على البايو في إنستجرام: لو مكتوب «احجز على الواتساب» يبقى مفيش حجز أونلاين.</li>
        <li>30–50 عيادة في الشيت ← ارفعه هنا.</li>
      </ol>
      <p className="text-xs text-gray-400 mt-3">ولو ضفت مفتاح Google Places في الإعدادات، تقدر تعمل ده أوتوماتيك من تاب «خرائط جوجل».</p>
    </Card>
  )
}
