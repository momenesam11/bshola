// Growth numbers, computed from the lead list itself so every figure on the
// dashboard can be traced back to rows.

import { CATEGORY_BY_KEY, SOURCE_BY_KEY } from './constants'
import { SALES_ANGLES } from './angles'

// Where a lead has got to, as cumulative funnel steps. A lead that reached
// "paid" also counts as contacted, interested and trial.
const REACHED = {
  contacted: (l) => !!l.last_contacted_at || ['contacted', 'follow_up', 'interested', 'demo', 'trial', 'paid'].includes(l.stage) || SOURCE_BY_KEY[l.source]?.inbound,
  interested: (l) => ['interested', 'demo', 'trial', 'paid'].includes(l.stage),
  trial: (l) => !!l.trial_started_at || ['trial', 'paid'].includes(l.stage),
  paid: (l) => l.stage === 'paid' || !!l.paid_at,
}

export function funnel(leads) {
  const total = leads.length
  const steps = [
    { key: 'leads', label: 'إجمالي العملاء المحتملين', count: total },
    { key: 'contacted', label: 'اتكلّموا / تواصلوا', count: leads.filter(REACHED.contacted).length },
    { key: 'interested', label: 'مهتمين', count: leads.filter(REACHED.interested).length },
    { key: 'trial', label: 'بدأوا تجربة', count: leads.filter(REACHED.trial).length },
    { key: 'paid', label: 'دفعوا', count: leads.filter(REACHED.paid).length },
  ]
  return steps.map((s, i) => ({ ...s, rateFromPrev: i === 0 || !steps[i - 1].count ? null : Math.round((s.count / steps[i - 1].count) * 100) }))
}

/**
 * Conversion grouped by any lead field (source, category, sales_angle, partner_id, …).
 * @returns {{key, label, leads, contacted, trial, paid, paidRate}[]} sorted by leads desc
 */
export function conversionBy(leads, field, labelFor = (k) => k) {
  const groups = new Map()
  for (const l of leads) {
    const key = l[field] ?? '—'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(l)
  }
  return [...groups.entries()]
    .map(([key, rows]) => {
      const paid = rows.filter(REACHED.paid).length
      return {
        key,
        label: key === '—' ? 'غير محدد' : labelFor(key),
        leads: rows.length,
        contacted: rows.filter(REACHED.contacted).length,
        trial: rows.filter(REACHED.trial).length,
        paid,
        paidRate: rows.length ? Math.round((paid / rows.length) * 100) : 0,
      }
    })
    .sort((a, b) => b.leads - a.leads)
}

export const labelers = {
  source: (k) => SOURCE_BY_KEY[k]?.label ?? k,
  category: (k) => CATEGORY_BY_KEY[k]?.label ?? k,
  sales_angle: (k) => SALES_ANGLES[k]?.label ?? k,
}

/** Paid leads per partner and the commission owed. */
export function partnerCommissions(leads, partners) {
  return partners.map((p) => {
    const mine = leads.filter((l) => l.partner_id === p.id)
    const paid = mine.filter(REACHED.paid).length
    return { partner: p, leads: mine.length, trial: mine.filter(REACHED.trial).length, paid, owed: paid * Number(p.commission_egp || 0) }
  })
}

/** Customers who referred someone that went on to pay — each is owed the referral reward. */
export function referralRewards(leads) {
  const byReferrer = new Map()
  for (const l of leads) {
    if (!l.referrer_business_id || !REACHED.paid(l)) continue
    byReferrer.set(l.referrer_business_id, [...(byReferrer.get(l.referrer_business_id) ?? []), l])
  }
  return [...byReferrer.entries()].map(([businessId, referred]) => ({
    businessId,
    referrerName: leads.find((x) => x.business_id === businessId)?.name ?? businessId,
    referred,
  }))
}

/** Headline counts for the top of the dashboard. */
export function headline(leads, now = Date.now()) {
  const weekAgo = now - 7 * 864e5
  return {
    total: leads.length,
    newThisWeek: leads.filter((l) => new Date(l.created_at).getTime() >= weekAgo).length,
    inboundThisWeek: leads.filter((l) => l.inbound_at && new Date(l.inbound_at).getTime() >= weekAgo).length,
    open: leads.filter((l) => !['paid', 'lost', 'do_not_contact'].includes(l.stage)).length,
    trials: leads.filter((l) => l.stage === 'trial').length,
    paid: leads.filter(REACHED.paid).length,
  }
}
