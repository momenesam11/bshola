import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { detectReviewSignals, inferPlaceSignals } from '../../../lib/growth/reviewSignals'
import { normalizePhone, displayPhone } from '../../../lib/growth/phone'
import { findDuplicate } from '../../../lib/growth/dedupe'
import { categoryFromText } from '../../../lib/growth/csv'
import { SIGNAL_LABELS } from '../../../lib/growth/constants'
import { usePlacesSearch, useImportLeads } from '../../../hooks/useGrowth'
import { fetchOsmClinics, OSM_ATTRIBUTION } from '../../../lib/growth/osm'
import { GOVERNORATES, RADIUS_OPTIONS, areasFor } from '../../../lib/growth/regions'
import { Btn, Card, EmptyState, Field } from './ui'
import { inputClass } from './format'
import { HiOutlineExclamationCircle, HiOutlineGlobeAlt, HiOutlineKey, HiOutlineLightBulb, HiOutlineMap } from 'react-icons/hi2'

const KINDS = [
  { key: 'dental', label: 'عيادة أسنان' },
  { key: 'derma', label: 'عيادة جلدية وتجميل' },
  { key: 'clinic', label: 'عيادة' },
  { key: 'clinic', label: 'مركز طبي' },
]
const AREAS = ['مدينة نصر', 'مصر الجديدة', 'المعادي', 'التجمع الخامس', 'الشيخ زايد', '6 أكتوبر', 'المهندسين', 'الدقي', 'الزمالك', 'المقطم', 'شبرا', 'فيصل', 'الهرم', 'حدائق الأهرام', 'العباسية', 'وسط البلد']

/**
 * Google Places search → evidence → leads. Results are shown live and only
 * the ones you tick are saved; each saved lead keeps the signals detected
 * from its reviews (as short quotes) and listing.
 */
export default function PlacesPanel({ leads, configured }) {
  const [kind, setKind] = useState(KINDS[0].label)
  const [area, setArea] = useState(AREAS[0])
  const [custom, setCustom] = useState('')
  const [results, setResults] = useState([])
  const [nextPageToken, setNextPageToken] = useState(null)
  const [lastQuery, setLastQuery] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const search = usePlacesSearch()
  const importLeads = useImportLeads()

  const enriched = useMemo(
    () =>
      results.map((p) => {
        const signals = [...detectReviewSignals(p.reviews, p.google_maps_url), ...inferPlaceSignals(p)]
        const duplicate = findDuplicate({ phone: p.phone, google_place_id: p.google_place_id, name: p.name }, leads)
        const closed = p.business_status && p.business_status !== 'OPERATIONAL'
        return { ...p, signals, duplicate, closed }
      }),
    [results, leads]
  )

  if (!configured) {
    return (
      <div className="space-y-4">
        <OsmCard leads={leads} />
        <Card>
          <EmptyState icon={HiOutlineKey} title="البحث في خرائط جوجل محتاج مفتاح Google Places">
            جوجل فيه عيادات أكتر بكتير، بس محتاج حساب Google Cloud بكارت. الخطوات في <b>docs/growth-engine.md</b>.
          </EmptyState>
        </Card>
      </div>
    )
  }

  async function run(pageToken) {
    const query = custom.trim() || `${kind} ${area}`
    try {
      const res = await search.mutateAsync({ query, pageToken })
      setLastQuery(query)
      setResults((prev) => (pageToken ? [...prev, ...res.places] : res.places))
      setNextPageToken(res.nextPageToken)
      if (!pageToken) setSelected(new Set())
    } catch (e) {
      toast.error(e.message)
    }
  }

  const toggle = (id) => setSelected((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })

  function selectGood() {
    setSelected(new Set(enriched.filter((p) => !p.duplicate && !p.closed && p.phone).map((p) => p.google_place_id)))
  }

  async function addSelected() {
    const kindKey = KINDS.find((k) => k.label === kind)?.key
    const rows = enriched
      .filter((p) => selected.has(p.google_place_id))
      .map((p) => ({
        name: p.name,
        phone: normalizePhone(p.phone) ?? undefined,
        category: custom.trim() ? categoryFromText(`${p.type_label ?? ''} ${p.name}`) : kindKey,
        area: custom.trim() ? undefined : area,
        city: 'القاهرة',
        address: p.address,
        website: p.website ?? undefined,
        google_maps_url: p.google_maps_url,
        google_place_id: p.google_place_id,
        google_rating: p.google_rating != null ? String(p.google_rating) : undefined,
        google_reviews_count: String(p.google_reviews_count ?? ''),
        source_detail: `بحث: ${lastQuery}`,
        signals: p.signals,
      }))
    if (!rows.length) return toast.error('اختار عيادات الأول')
    try {
      const res = await importLeads.mutateAsync({ rows, source: 'google_maps_api' })
      toast.success(`اتضاف ${res.inserted}${res.skipped ? ` · متكرر ${res.skipped}` : ''}`)
      setSelected(new Set())
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <div className="space-y-4">
      <OsmCard leads={leads} />
      <Card icon={HiOutlineMap} title="دوّر في خرائط جوجل">
        <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
          <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value)} disabled={!!custom.trim()}>
            {KINDS.map((k) => <option key={k.label} value={k.label}>{k.label}</option>)}
          </select>
          <select className={inputClass} value={area} onChange={(e) => setArea(e.target.value)} disabled={!!custom.trim()}>
            {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <Btn tone="primary" onClick={() => run()} disabled={search.isPending}>{search.isPending ? 'بيدوّر…' : 'دوّر'}</Btn>
        </div>
        <input className={`${inputClass} mt-2`} placeholder="أو اكتب بحث بنفسك: «مركز ليزر التجمع»" value={custom} onChange={(e) => setCustom(e.target.value)} />
        <p className="text-[12.5px] text-gray-400 mt-2">كل بحث = طلب واحد من جوجل (بفلوس). فيه حد يومي من الإعدادات عشان ماتتفاجئش بفاتورة.</p>
      </Card>

      {enriched.length > 0 && (
        <Card
          title={`${enriched.length} نتيجة — «${lastQuery}»`}
          actions={
            <div className="flex gap-2">
              <Btn tone="ghost" onClick={selectGood}>اختار الجديد اللي ليه رقم</Btn>
              <Btn tone="primary" onClick={addSelected} disabled={!selected.size || importLeads.isPending}>
                ضيف {selected.size || ''} للقايمة
              </Btn>
            </div>
          }
        >
          <ul className="divide-y divide-gray-50 -my-2">
            {enriched.map((p) => (
              <li key={p.google_place_id} className={`py-3 flex gap-3 ${p.duplicate || p.closed ? 'opacity-50' : ''}`}>
                <input
                  type="checkbox"
                  className="mt-1 w-4 h-4 accent-accent-600"
                  checked={selected.has(p.google_place_id)}
                  disabled={!!p.duplicate}
                  onChange={() => toggle(p.google_place_id)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={p.google_maps_url} target="_blank" rel="noopener noreferrer" className="font-bold text-ink hover:underline">{p.name}</a>
                    {p.google_rating != null && <span className="text-xs text-amber-600">★ {p.google_rating} ({p.google_reviews_count})</span>}
                    {p.duplicate && <span className="text-[12.5px] bg-gray-100 text-ink-soft rounded px-1.5">موجود في القايمة</span>}
                    {p.closed && <span className="text-[12.5px] bg-red-50 text-red-600 rounded px-1.5">مقفول</span>}
                  </div>
                  <p className="text-xs text-ink-soft truncate">{p.address}</p>
                  <p className="text-xs text-ink-soft font-mono mt-0.5" dir="ltr">{p.phone ? displayPhone(normalizePhone(p.phone) ?? '') || p.phone : 'مفيش رقم'}</p>
                  {p.signals.length > 0 && (
                    <ul className="mt-1.5 space-y-1">
                      {p.signals.map((s) => (
                        <li key={s.type} className={`text-[12.5px] leading-relaxed ${s.kind === 'fact' ? 'text-red-700' : 'text-ink-soft'}`}>
                          {s.kind === 'fact' ? <HiOutlineExclamationCircle className="inline-block w-4 h-4 align-[-3px] ml-1" aria-hidden="true" /> : <HiOutlineLightBulb className="inline-block w-4 h-4 align-[-3px] ml-1" aria-hidden="true" />}<b>{SIGNAL_LABELS[s.type]}</b> — {s.evidence}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {nextPageToken && (
            <div className="text-center mt-3">
              <Btn onClick={() => run(nextPageToken)} disabled={search.isPending}>نتايج أكتر</Btn>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

/**
 * Free, keyless source: clinics OpenStreetMap knows in a governorate, or in
 * a circle around one district, that have a phone. Only new ones are offered.
 */
function OsmCard({ leads }) {
  const importLeads = useImportLeads()
  const [governorate, setGovernorate] = useState('cairo')
  const [area, setArea] = useState('')
  const [radiusKm, setRadiusKm] = useState(3)
  const [state, setState] = useState({ status: 'idle', rows: [], label: '' })
  const fresh = state.rows.filter((r) => !findDuplicate(r, leads))
  const areas = areasFor(governorate)

  async function load() {
    setState({ status: 'loading', rows: [], label: '' })
    try {
      const { rows, label } = await fetchOsmClinics({ governorate, area: area || null, radiusKm })
      setState({ status: 'ready', rows, label })
    } catch (e) {
      setState({ status: 'idle', rows: [], label: '' })
      toast.error(e.message)
    }
  }

  async function add() {
    try {
      const res = await importLeads.mutateAsync({ rows: fresh, source: 'openstreetmap' })
      toast.success(`اتضاف ${res.inserted} عيادة${res.skipped ? ` · متكرر ${res.skipped}` : ''}`)
      setState({ status: 'idle', rows: [], label: '' })
    } catch (e) {
      toast.error(e.message)
    }
  }

  const byCategory = fresh.reduce((m, r) => ((m[r.category] = (m[r.category] ?? 0) + 1), m), {})

  return (
    <Card icon={HiOutlineGlobeAlt} title="OpenStreetMap — مجاني ومن غير مفتاح">
      <p className="text-sm text-ink-soft leading-relaxed">
        اختار المكان واضغط «هات»: بيجيب العيادات اللي ليها رقم تليفون (من غير صيدليات ومستشفيات ومعامل)، ويوريك الجداد بس.
      </p>
      <div className="mt-3 grid sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
        <Field label="المحافظة">
          <select className={inputClass} value={governorate} onChange={(e) => { setGovernorate(e.target.value); setArea('') }}>
            {GOVERNORATES.map((g) => <option key={g.key} value={g.key}>{g.name}</option>)}
          </select>
        </Field>
        <Field label="المنطقة">
          <select className={inputClass} value={area} onChange={(e) => setArea(e.target.value)} disabled={!areas.length}>
            <option value="">المحافظة كلها</option>
            {areas.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="حوالين المنطقة">
          <select className={inputClass} value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} disabled={!area}>
            {RADIUS_OPTIONS.map((r) => <option key={r} value={r}>{r} كم</option>)}
          </select>
        </Field>
        <Btn tone="primary" onClick={load} disabled={state.status === 'loading'} className="h-[38px]">
          {state.status === 'loading' ? 'بيجيب…' : 'هات'}
        </Btn>
      </div>
      {!areas.length && <p className="text-[12.5px] text-ink-soft mt-2">المحافظة دي بنبحث فيها كلها — لسه مفيش مناطق محددة جواها.</p>}
      {state.status === 'loading' && <p className="text-[12.5px] text-ink-soft mt-2">ممكن ياخد لحد دقيقة — السيرفرات دي مجانية.</p>}

      {state.status === 'ready' && (
        <div className="mt-3 rounded-lg bg-paper border border-rule p-3 space-y-2">
          <p className="text-sm text-ink">
            <b>{state.label}</b>: لقيت <b>{state.rows.length}</b> عيادة برقم — منهم <b>{fresh.length}</b> جداد مش عندك
            {fresh.length > 0 && (
              <span className="text-ink-soft"> (أسنان {byCategory.dental ?? 0} · جلدية {byCategory.derma ?? 0} · عيادات تانية {byCategory.clinic ?? 0})</span>
            )}
          </p>
          {fresh.length > 0 && (
            <ul className="text-xs text-ink-soft max-h-28 overflow-y-auto space-y-0.5">
              {fresh.slice(0, 12).map((r) => <li key={r.google_maps_url}>• {r.name}</li>)}
              {fresh.length > 12 && <li>… و{fresh.length - 12} كمان</li>}
            </ul>
          )}
          <div className="flex gap-2">
            <Btn tone="primary" onClick={add} disabled={!fresh.length || importLeads.isPending}>
              {importLeads.isPending ? 'بيضيف…' : `ضيف الـ ${fresh.length} للقايمة`}
            </Btn>
            <Btn onClick={() => setState({ status: 'idle', rows: [], label: '' })}>إلغاء</Btn>
          </div>
        </div>
      )}
      <p className="text-[12.5px] text-ink-soft mt-3">البيانات: {OSM_ATTRIBUTION}</p>
    </Card>
  )
}
