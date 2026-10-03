import { useMemo } from 'react'
import { HiOutlinePhone } from 'react-icons/hi2'
import { buildQueue } from '../../../lib/growth/scoring'
import { chooseAngle } from '../../../lib/growth/angles'
import { displayPhone, telLink } from '../../../lib/growth/phone'
import { Card, EmptyState, ScoreBadge, StageBadge } from './ui'
import { categoryLabel, formatDateTime, sourceLabel } from './format'

const BUCKETS = [
  { key: 0, title: '🔥 طلبوا يتكلّموا معانا — كلّمهم الأول', tone: 'border-red-200' },
  { key: 1, title: '⏰ متابعات النهارده', tone: 'border-amber-200' },
  { key: 2, title: '📋 الأعلى تقييماً — ابدأ بيهم', tone: 'border-gray-100' },
]

/** Today's call list, in the order to work it. */
export default function QueuePanel({ leads, settings, onOpen }) {
  const queue = useMemo(
    () => buildQueue(leads, { weights: settings?.weights, targetAreas: settings?.target_areas }),
    [leads, settings]
  )

  if (queue.length === 0) {
    return (
      <Card>
        <EmptyState icon="🎉" title="مفيش حد مستني مكالمة النهارده">
          ضيف عيادات من «إضافة» أو «خرائط جوجل»، أو دوس «تحديث من النظام» عشان يجيب اللي سجّلوا وماكمّلوش.
        </EmptyState>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">{queue.length} عميل مستني تواصل النهارده — اشتغل من فوق لتحت.</p>
      {BUCKETS.map((bucket) => {
        const items = queue.filter((q) => q.bucket === bucket.key)
        if (!items.length) return null
        // A cold list can be hundreds long; show the best 30 and let the rest wait.
        const shown = bucket.key === 2 ? items.slice(0, 30) : items
        return (
          <Card key={bucket.key} title={`${bucket.title} (${items.length})`} className={bucket.tone}>
            <ul className="divide-y divide-gray-50 -my-2">
              {shown.map(({ lead, score }) => {
                const angle = chooseAngle(lead)
                return (
                  <li key={lead.id} className="py-2.5 flex items-center gap-3">
                    <ScoreBadge score={score} />
                    <button type="button" onClick={() => onOpen(lead.id)} className="min-w-0 flex-1 text-right">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-900 truncate">{lead.name}</span>
                        <StageBadge stage={lead.stage} />
                      </div>
                      <p className="text-xs text-gray-500 truncate">
                        {categoryLabel(lead.category)} · {lead.area || lead.city || '—'} · {sourceLabel(lead.source)}
                        {lead.next_follow_up_at && bucket.key === 1 ? ` · ${formatDateTime(lead.next_follow_up_at)}` : ''}
                      </p>
                      <p className="text-[11px] text-violet-600 truncate">💡 {angle.label}{angle.basis === 'evidence' ? ` — ${angle.because}` : ''}</p>
                    </button>
                    {lead.phone && (
                      <a href={telLink(lead.phone)} className="hidden sm:inline-flex items-center gap-1 text-xs font-mono text-gray-600 hover:text-accent-700" dir="ltr" title="اتصال">
                        <HiOutlinePhone className="w-3.5 h-3.5" /> {displayPhone(lead.phone)}
                      </a>
                    )}
                    <button type="button" onClick={() => onOpen(lead.id)} className="text-xs font-bold text-white bg-accent-500 hover:bg-accent-600 rounded-lg px-3 py-2 flex-shrink-0">
                      افتح
                    </button>
                  </li>
                )
              })}
            </ul>
            {shown.length < items.length && <p className="text-xs text-gray-400 mt-3">+ {items.length - shown.length} تانيين في «كل العملاء»</p>}
          </Card>
        )
      })}
    </div>
  )
}
