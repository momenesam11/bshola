import { useMemo, useState } from 'react'
import { HiOutlineMagnifyingGlass } from 'react-icons/hi2'
import { STAGES, SOURCES, CATEGORIES } from '../../../lib/growth/constants'
import { scoreLead } from '../../../lib/growth/scoring'
import { leadsToCsv } from '../../../lib/growth/csv'
import { displayPhone, normalizePhone } from '../../../lib/growth/phone'
import { Btn, Card, EmptyState, ScoreBadge, StageBadge } from './ui'
import { categoryLabel, downloadCsv, formatDate, formatDateTime, inputClass, sourceLabel } from './format'

const SORTS = {
  score: { label: 'الأعلى تقييماً', fn: (a, b) => b.score - a.score },
  newest: { label: 'الأحدث', fn: (a, b) => new Date(b.lead.created_at) - new Date(a.lead.created_at) },
  follow: { label: 'أقرب متابعة', fn: (a, b) => (new Date(a.lead.next_follow_up_at || 8.64e15)) - (new Date(b.lead.next_follow_up_at || 8.64e15)) },
}

/** Every lead, filterable, searchable, exportable. */
export default function LeadsPanel({ leads, settings, onOpen }) {
  const [q, setQ] = useState('')
  const [stage, setStage] = useState('')
  const [source, setSource] = useState('')
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState('score')
  const [showTests, setShowTests] = useState(false)
  const testCount = leads.filter((l) => l.is_test).length

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const phoneNeedle = normalizePhone(q) ?? q.replace(/[^0-9]/g, '')
    return leads
      .filter((l) => showTests || !l.is_test)
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
  }, [leads, q, stage, source, category, sort, settings, showTests])

  return (
    <Card>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto] mb-4">
        <div className="relative">
          <HiOutlineMagnifyingGlass className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className={`${inputClass} pr-9`} placeholder="اسم، منطقة، رقم، إيميل…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className={inputClass} value={stage} onChange={(e) => setStage(e.target.value)}>
          <option value="">كل المراحل</option>
          {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select className={inputClass} value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">كل المصادر</option>
          {SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">كل الأنواع</option>
          {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <select className={inputClass} value={sort} onChange={(e) => setSort(e.target.value)}>
          {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
        </select>
      </div>

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <p className="text-xs text-ink-soft">{rows.length} من {leads.length}</p>
          {testCount > 0 && (
            <label className="text-xs text-ink-soft flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={showTests} onChange={(e) => setShowTests(e.target.checked)} className="accent-gray-700" />
              اعرض حسابات التجربة ({testCount})
            </label>
          )}
        </div>
        <Btn tone="ghost" onClick={() => downloadCsv(`beshola-leads-${new Date().toISOString().slice(0, 10)}.csv`, leadsToCsv(rows.map((r) => r.lead)))}>
          ⬇️ تصدير Excel
        </Btn>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="مفيش نتايج" />
      ) : (
        <div className="overflow-x-auto -mx-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-rule">
                <th className="text-right font-medium px-4 py-2">التقييم</th>
                <th className="text-right font-medium px-2 py-2">الاسم</th>
                <th className="text-right font-medium px-2 py-2">المرحلة</th>
                <th className="text-right font-medium px-2 py-2">المصدر</th>
                <th className="text-right font-medium px-2 py-2">التليفون</th>
                <th className="text-right font-medium px-2 py-2">المتابعة</th>
                <th className="text-right font-medium px-2 py-2">اتضاف</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 500).map(({ lead, score }) => (
                <tr key={lead.id} onClick={() => onOpen(lead.id)} className="border-b border-gray-50 hover:bg-paper cursor-pointer">
                  <td className="px-4 py-2.5"><ScoreBadge score={score} /></td>
                  <td className="px-2 py-2.5">
                    <div className="font-semibold text-ink">{lead.is_test && '🧪 '}{lead.name}</div>
                    <div className="text-[12.5px] text-gray-400">{categoryLabel(lead.category)} · {lead.area || lead.city || '—'}</div>
                  </td>
                  <td className="px-2 py-2.5"><StageBadge stage={lead.stage} /></td>
                  <td className="px-2 py-2.5 text-xs text-ink-soft">{sourceLabel(lead.source)}</td>
                  <td className="px-2 py-2.5 text-xs font-mono text-ink-soft whitespace-nowrap" dir="ltr">{displayPhone(lead.phone) || (lead.email ? <span className="text-amber-700 font-sans">✉️ إيميل بس</span> : '—')}</td>
                  <td className="px-2 py-2.5 text-xs text-ink-soft whitespace-nowrap">{formatDateTime(lead.next_follow_up_at)}</td>
                  <td className="px-2 py-2.5 text-xs text-gray-400 whitespace-nowrap">{formatDate(lead.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 500 && <p className="text-xs text-gray-400 px-4 mt-2">بيعرض أول 500 — استخدم الفلاتر.</p>}
        </div>
      )}
    </Card>
  )
}
