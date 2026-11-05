import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { HiOutlineArchiveBox, HiOutlineArrowDownTray, HiOutlineArrowUturnLeft, HiOutlineBeaker, HiOutlineChevronDown, HiOutlineEnvelope, HiOutlineFunnel, HiOutlineMagnifyingGlass, HiOutlineSparkles, HiOutlineXMark } from 'react-icons/hi2'
import { CATEGORIES, CLOSED_STAGES, SOURCES, STAGES } from '../../../lib/growth/constants'
import { scoreLead } from '../../../lib/growth/scoring'
import { leadsToCsv } from '../../../lib/growth/csv'
import { CLEANUP_GROUPS, cleanupReport } from '../../../lib/growth/cleanup'
import { displayPhone, normalizePhone } from '../../../lib/growth/phone'
import { useArchivedLeads, useBulkLeads } from '../../../hooks/useGrowth'
import { Btn, Card, EmptyState, ScoreBadge, StageBadge } from './ui'
import { categoryLabel, downloadCsv, formatDate, inputClass, sourceLabel } from './format'

const SORTS = {
  score: { label: 'الأعلى تقييماً', fn: (a, b) => b.score - a.score },
  newest: { label: 'الأحدث', fn: (a, b) => new Date(b.lead.created_at) - new Date(a.lead.created_at) },
  follow: { label: 'أقرب متابعة', fn: (a, b) => (new Date(a.lead.next_follow_up_at || 8.64e15)) - (new Date(b.lead.next_follow_up_at || 8.64e15)) },
}

// The questions you actually open this page with.
const VIEWS = [
  { key: 'open', label: 'شغالين عليهم', test: (l) => !CLOSED_STAGES.includes(l.stage) && l.stage !== 'new' && l.stage !== 'trial' },
  { key: 'new', label: 'لسه ماتكلّمناش', test: (l) => l.stage === 'new' },
  { key: 'trial', label: 'في التجربة', test: (l) => l.stage === 'trial' },
  { key: 'paid', label: 'دفعوا', test: (l) => l.stage === 'paid' },
  { key: 'closed', label: 'اتقفلوا', test: (l) => l.stage === 'lost' || l.stage === 'do_not_contact' },
  { key: 'all', label: 'الكل', test: () => true },
]

const PAGE = 50

/** Every lead: pick a view, find someone, fix what's wrong. */
export default function LeadsPanel({ leads, settings, archivedCount = 0, onOpen }) {
  const [view, setView] = useState('open')
  const [q, setQ] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [stage, setStage] = useState('')
  const [source, setSource] = useState('')
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState('score')
  const [shown, setShown] = useState(PAGE)
  const [selected, setSelected] = useState(() => new Set())
  const [panel, setPanel] = useState(null) // 'cleanup' | 'archive' | null
  const bulk = useBulkLeads()

  const real = useMemo(() => leads.filter((l) => !l.is_test), [leads])
  const tests = useMemo(() => leads.filter((l) => l.is_test), [leads])
  const report = useMemo(() => cleanupReport(leads), [leads])
  const counts = useMemo(() => Object.fromEntries(VIEWS.map((v) => [v.key, real.filter(v.test).length])), [real])
  const activeFilters = [stage, source, category].filter(Boolean).length

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const phoneNeedle = normalizePhone(q) ?? q.replace(/[^0-9]/g, '')
    const base = view === 'tests' ? tests : real.filter(VIEWS.find((v) => v.key === view).test)
    return base
      .filter((l) => !stage || l.stage === stage)
      .filter((l) => !source || l.source === source)
      .filter((l) => !category || l.category === category)
      .filter((l) =>
        !needle ||
        l.name?.toLowerCase().includes(needle) ||
        l.area?.toLowerCase().includes(needle) ||
        l.contact_person?.toLowerCase().includes(needle) ||
        l.email?.toLowerCase().includes(needle) ||
        (phoneNeedle.length >= 4 && l.phone?.includes(phoneNeedle))
      )
      .map((lead) => ({ lead, score: scoreLead(lead, { weights: settings?.weights, targetAreas: settings?.target_areas }).total }))
      .sort(SORTS[sort].fn)
  }, [real, tests, view, q, stage, source, category, sort, settings])

  const page = rows.slice(0, shown)
  const allOnPage = page.length > 0 && page.every((r) => selected.has(r.lead.id))

  function toggle(id) {
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  function toggleAll() {
    setSelected(allOnPage ? new Set() : new Set(page.map((r) => r.lead.id)))
  }

  async function applyBulk(op, reason) {
    try {
      const res = await bulk.mutateAsync({ ids: [...selected], op, reason })
      toast.success(res.skipped ? `اتعمل لـ ${res.done} · اتساب ${res.skipped} (عملاء مسجّلين أو عليهم عمولة)` : `اتعمل لـ ${res.done}`)
      setSelected(new Set())
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {report.total > 0 && (
          <Btn tone={panel === 'cleanup' ? 'primary' : 'default'} onClick={() => setPanel(panel === 'cleanup' ? null : 'cleanup')}>
            <HiOutlineSparkles className="w-4 h-4" aria-hidden="true" /> نضّف القايمة <span className="bg-amber-100 text-amber-800 rounded-full px-1.5 text-xs tabular-nums">{report.total}</span>
          </Btn>
        )}
        {archivedCount > 0 && (
          <Btn tone="ghost" onClick={() => setPanel(panel === 'archive' ? null : 'archive')}><HiOutlineArchiveBox className="w-4 h-4" aria-hidden="true" /> المخفيين ({archivedCount})</Btn>
        )}
        <div className="flex-1" />
        <Btn tone="ghost" onClick={() => downloadCsv(`beshola-leads-${new Date().toISOString().slice(0, 10)}.csv`, leadsToCsv(rows.map((r) => r.lead)))}>
          <HiOutlineArrowDownTray className="w-4 h-4" aria-hidden="true" /> تصدير اللي ظاهر
        </Btn>
      </div>

      {panel === 'cleanup' && <CleanupPanel report={report} onOpen={onOpen} />}
      {panel === 'archive' && <ArchivePanel />}

      <Card>
        <div role="tablist" aria-label="عرض العملاء" className="flex gap-1.5 overflow-x-auto pb-3 -mx-1 px-1">
          {VIEWS.map((v) => (
            <button key={v.key} type="button" role="tab" aria-selected={view === v.key} onClick={() => { setView(v.key); setShown(PAGE); setSelected(new Set()) }}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${view === v.key ? 'bg-ink text-white' : 'bg-paper text-ink-soft hover:text-ink'}`}>
              {v.label} <span className={`tabular-nums text-xs ${view === v.key ? 'text-white/70' : 'text-ink-soft'}`}>{counts[v.key].toLocaleString('en-EG')}</span>
            </button>
          ))}
          {tests.length > 0 && (
            <button type="button" role="tab" aria-selected={view === 'tests'} onClick={() => { setView('tests'); setShown(PAGE); setSelected(new Set()) }}
              className={`flex-shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-semibold ${view === 'tests' ? 'bg-ink text-white' : 'bg-paper text-ink-soft'}`}>
              <HiOutlineBeaker className="w-4 h-4" aria-hidden="true" /> تيست {tests.length}
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <HiOutlineMagnifyingGlass className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-soft" aria-hidden="true" />
            <input className={`${inputClass} pr-9`} aria-label="بحث" placeholder="اسم، منطقة، رقم، إيميل…" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE) }} />
          </div>
          <Btn onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
            <HiOutlineFunnel className="w-4 h-4" aria-hidden="true" /> فلتر{activeFilters > 0 && <span className="bg-accent-500 text-white rounded-full w-5 h-5 text-xs inline-flex items-center justify-center">{activeFilters}</span>}
          </Btn>
        </div>

        {showFilters && (
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 mt-2">
            <select className={inputClass} aria-label="المرحلة" value={stage} onChange={(e) => setStage(e.target.value)}>
              <option value="">كل المراحل</option>
              {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <select className={inputClass} aria-label="المصدر" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">كل المصادر</option>
              {SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <select className={inputClass} aria-label="النوع" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">كل الأنواع</option>
              {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <select className={inputClass} aria-label="الترتيب" value={sort} onChange={(e) => setSort(e.target.value)}>
              {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </select>
          </div>
        )}

        {selected.size > 0 && (
          <div className="sticky top-2 z-10 mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-ink text-white px-3 py-2 text-sm">
            <b className="tabular-nums">{selected.size} مختارين</b>
            <div className="flex-1" />
            <button type="button" disabled={bulk.isPending} onClick={() => applyBulk('archive', 'تنضيف يدوي')} className="font-semibold hover:underline disabled:opacity-50">إخفاء</button>
            <button type="button" disabled={bulk.isPending} onClick={() => applyBulk('mark_lost', 'تنضيف يدوي')} className="font-semibold hover:underline disabled:opacity-50">اقفلهم كـ«ضاع»</button>
            <button type="button" disabled={bulk.isPending} onClick={() => applyBulk('mark_test')} className="font-semibold hover:underline disabled:opacity-50">حسابات تيست</button>
            <button type="button" aria-label="إلغاء الاختيار" onClick={() => setSelected(new Set())}><HiOutlineXMark className="w-5 h-5" aria-hidden="true" /></button>
          </div>
        )}

        {rows.length === 0 ? (
          <EmptyState title="مفيش حد هنا">{q || activeFilters ? 'جرّب بحث أو فلتر تاني.' : null}</EmptyState>
        ) : (
          <div className="overflow-x-auto -mx-4 mt-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-ink-soft border-b border-rule">
                  <th className="px-4 py-2 w-8"><input type="checkbox" aria-label="اختار الكل" className="w-4 h-4 accent-accent-600" checked={allOnPage} onChange={toggleAll} /></th>
                  <th className="text-right font-medium px-2 py-2">العيادة</th>
                  <th className="text-right font-medium px-2 py-2">المرحلة</th>
                  <th className="text-right font-medium px-2 py-2 hidden md:table-cell">جاية منين</th>
                  <th className="text-right font-medium px-2 py-2">التواصل</th>
                  <th className="text-right font-medium px-2 py-2 hidden lg:table-cell">اتضافت</th>
                </tr>
              </thead>
              <tbody>
                {page.map(({ lead, score }) => (
                  <tr key={lead.id} className="border-b border-rule/60 hover:bg-paper">
                    <td className="px-4 py-2.5"><input type="checkbox" aria-label={`اختار ${lead.name}`} className="w-4 h-4 accent-accent-600" checked={selected.has(lead.id)} onChange={() => toggle(lead.id)} /></td>
                    <td className="px-2 py-2.5 cursor-pointer" onClick={() => onOpen(lead.id)}>
                      <div className="flex items-center gap-2">
                        <ScoreBadge score={score} />
                        <div className="min-w-0">
                          <button type="button" className="font-semibold text-ink text-right hover:underline">{lead.name}</button>
                          <div className="text-xs text-ink-soft">{categoryLabel(lead.category)} · {lead.area || lead.city || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2.5"><StageBadge stage={lead.stage} /></td>
                    <td className="px-2 py-2.5 text-xs text-ink-soft hidden md:table-cell">{sourceLabel(lead.source)}</td>
                    <td className="px-2 py-2.5 text-xs text-ink-soft whitespace-nowrap" dir="ltr">
                      {displayPhone(lead.phone) || (lead.email
                        ? <span dir="rtl" className="text-amber-700 inline-flex items-center gap-1"><HiOutlineEnvelope className="w-4 h-4" aria-hidden="true" /> إيميل بس</span>
                        : '—')}
                    </td>
                    <td className="px-2 py-2.5 text-xs text-ink-soft whitespace-nowrap hidden lg:table-cell">{formatDate(lead.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between px-4 mt-3">
              <p className="text-xs text-ink-soft tabular-nums">{page.length.toLocaleString('en-EG')} من {rows.length.toLocaleString('en-EG')}</p>
              {shown < rows.length && (
                <Btn onClick={() => setShown((n) => n + PAGE)}><HiOutlineChevronDown className="w-4 h-4" aria-hidden="true" /> اعرض أكتر</Btn>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

/** Everything that looks wrong, grouped, one action per group. */
function CleanupPanel({ report, onOpen }) {
  const bulk = useBulkLeads()
  const groups = Object.entries(CLEANUP_GROUPS).filter(([key]) => report.groups[key]?.length)

  async function fix(key) {
    const def = CLEANUP_GROUPS[key]
    const ids = report.groups[key].map((r) => r.lead.id)
    try {
      const res = await bulk.mutateAsync({ ids, op: def.action, reason: def.label })
      toast.success(`اتعمل لـ ${res.done}${res.skipped ? ` · اتساب ${res.skipped}` : ''}`)
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <Card icon={HiOutlineSparkles} title="نضّف القايمة">
      <p className="text-sm text-ink-soft mb-3">مفيش حاجة بتتمسح نهائي: «إخفاء» بيشيلهم من كل الشاشات، وبيمنع الاستيراد إنه يرجّعهم، وتقدر ترجّعهم من «المخفيين». والعملاء المسجّلين مش بيتلمسوا.</p>
      {groups.length === 0 ? (
        <p className="text-sm text-accent-700 font-semibold">القايمة نضيفة.</p>
      ) : (
        <div className="space-y-2">
          {groups.map(([key, def]) => (
            <details key={key} className="rounded-lg border border-rule">
              <summary className="flex flex-wrap items-center gap-2 px-3 py-2.5 cursor-pointer">
                <b className="text-sm text-ink">{def.label}</b>
                <span className="bg-amber-100 text-amber-800 rounded-full px-2 text-xs tabular-nums">{report.groups[key].length}</span>
                <span className="text-xs text-ink-soft flex-1 min-w-[12rem]">{def.hint}</span>
                <Btn className="!py-1 text-xs" disabled={bulk.isPending} onClick={(e) => { e.preventDefault(); fix(key) }}>{def.actionLabel} الكل</Btn>
              </summary>
              <ul className="divide-y divide-rule/60 border-t border-rule max-h-64 overflow-y-auto">
                {report.groups[key].slice(0, 100).map(({ lead, why }) => (
                  <li key={lead.id} className="px-3 py-2 text-sm flex flex-wrap justify-between gap-2">
                    <button type="button" className="font-semibold text-ink hover:underline text-right" onClick={() => onOpen(lead.id)}>{lead.name}</button>
                    <span className="text-xs text-ink-soft">{why}</span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </Card>
  )
}

function ArchivePanel() {
  const { data: rows = [], isLoading } = useArchivedLeads(true)
  const bulk = useBulkLeads()

  async function restore(ids) {
    try {
      const res = await bulk.mutateAsync({ ids, op: 'restore' })
      toast.success(`رجع ${res.done}`)
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <Card icon={HiOutlineArchiveBox} title="المخفيين">
      {isLoading ? (
        <p className="text-sm text-ink-soft">بيحمّل…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-soft">مفيش مخفيين.</p>
      ) : (
        <ul className="divide-y divide-rule/60 max-h-72 overflow-y-auto">
          {rows.map((l) => (
            <li key={l.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
              <div>
                <p className="font-semibold text-ink">{l.name}</p>
                <p className="text-xs text-ink-soft">{l.archived_reason || 'اتخفى'} · {formatDate(l.archived_at)}</p>
              </div>
              <Btn tone="ghost" className="!py-1 text-xs" disabled={bulk.isPending} onClick={() => restore([l.id])}><HiOutlineArrowUturnLeft className="w-4 h-4" aria-hidden="true" /> رجّعه</Btn>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
