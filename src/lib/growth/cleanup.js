// «كل العملاء» clean-up: finds the rows that make the list untrustworthy and
// groups them by what's wrong, so each group can be fixed in one action.
// Pure function of the list. Nothing here changes data.

import { CLOSED_STAGES } from './constants'
import { dataQuality } from './quality'

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const DAY = 864e5

/**
 * A group is a set of leads saying the same place twice. The one to keep is
 * the one with real history; the rest are offered for hiding.
 */
function duplicateExtras(leads) {
  const groups = new Map()
  for (const l of leads) {
    const keys = []
    if (norm(l.name) && norm(l.area)) keys.push(`n:${norm(l.name)}|${norm(l.area)}`)
    if (l.email) keys.push(`e:${norm(l.email)}`)
    if (l.google_maps_url) keys.push(`m:${norm(l.google_maps_url)}`)
    for (const k of keys) groups.set(k, [...(groups.get(k) ?? []), l])
  }
  const history = (l) => (l.business_id ? 100 : 0) + (l.contact_attempts ?? 0) + (l.phone ? 1 : 0)
  const extras = new Map()
  for (const rows of groups.values()) {
    if (rows.length < 2) continue
    const [keep, ...rest] = [...rows].sort((a, b) => history(b) - history(a) || new Date(a.created_at) - new Date(b.created_at))
    for (const r of rest) if (!r.business_id && r.id !== keep.id) extras.set(r.id, { lead: r, keep })
  }
  return [...extras.values()]
}

export const CLEANUP_GROUPS = {
  duplicates: { label: 'متكررين', hint: 'نفس الاسم في نفس المنطقة، أو نفس الإيميل، أو نفس لينك الخريطة. بنسيب اللي عليه تاريخ.', action: 'archive', actionLabel: 'إخفاء' },
  suspect: { label: 'شكلهم مش حقيقي', hint: 'رقمك إنت، اسم فيه «تجربة»، رقم متكرر الأرقام، إيميل مؤقت.', action: 'archive', actionLabel: 'إخفاء' },
  unreachable: { label: 'مفيش طريقة نوصلهم', hint: 'من غير رقم ولا إيميل.', action: 'archive', actionLabel: 'إخفاء' },
  email_only: { label: 'إيميل بس', hint: 'مش هيدخلوا قايمة المكالمات. دوّر على رقمهم، أو اخفيهم.', action: 'archive', actionLabel: 'إخفاء' },
  stale: { label: 'اتكلّمنا معاهم ووقفوا', hint: 'آخر تواصل من 45 يوم أو أكتر ومفيش ميعاد متابعة. اقفلهم عشان الأرقام تبقى صادقة.', action: 'mark_lost', actionLabel: 'اقفلهم كـ«ضاع»' },
}

export function cleanupReport(leads, now = Date.now()) {
  const live = leads.filter((l) => !l.is_test && !l.archived_at)
  const open = live.filter((l) => !CLOSED_STAGES.includes(l.stage))
  const groups = {
    duplicates: duplicateExtras(live).map(({ lead, keep }) => ({ lead, why: `نفس «${keep.name}»` })),
    suspect: open
      .filter((l) => !l.business_id)
      .map((lead) => ({ lead, q: dataQuality(lead, leads) }))
      .filter((x) => x.q.level === 'suspect')
      .map(({ lead, q }) => ({ lead, why: q.reasons.join(' · ') })),
    unreachable: open.filter((l) => !l.phone && !l.email && !l.business_id).map((lead) => ({ lead, why: 'مفيش رقم ولا إيميل' })),
    email_only: open.filter((l) => !l.phone && l.email && !l.business_id).map((lead) => ({ lead, why: lead.email })),
    stale: open
      .filter((l) => ['contacted', 'follow_up', 'interested', 'demo'].includes(l.stage) && !l.next_follow_up_at && l.last_contacted_at && now - new Date(l.last_contacted_at).getTime() >= 45 * DAY)
      .map((lead) => ({ lead, why: `آخر تواصل من ${Math.floor((now - new Date(lead.last_contacted_at).getTime()) / DAY)} يوم` })),
  }
  return { groups, total: Object.values(groups).reduce((n, rows) => n + rows.length, 0) }
}
