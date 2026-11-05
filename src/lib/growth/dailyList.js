// Today's call list.
//
// Two kinds of people on it:
//   · urgent (asked to talk, trial ending, just signed up, promised follow-ups):
//     computed live, so a form filled at 3pm shows up at 3pm, and nothing urgent
//     is ever lost when the day changes.
//   · new clinics: a fixed batch picked once a day and saved in
//     growth_daily_list. Tomorrow there's a new batch; whoever wasn't called goes
//     back to the pool and can't be picked again for a while (the cooldown),
//     so the list doesn't show you the same names every morning.
//
// The batch fills whatever room the urgent ones leave in the daily target.

import { buildQueue, scoreLead } from './scoring'
import { dataQuality } from './quality'
import { cairoToday } from './discover'

const DAY = 864e5
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY)

/** Worth calling and never touched: the raw material of the daily batch. */
export function isPoolLead(lead, allLeads = []) {
  return (
    lead.stage === 'new' &&
    !!lead.phone &&
    !lead.is_test &&
    !lead.archived_at &&
    !lead.last_contacted_at &&
    !lead.next_follow_up_at &&
    !lead.inbound_at &&
    dataQuality(lead, allLeads).level !== 'suspect'
  )
}

function isResting(lead, day, cooldownDays) {
  return !!lead.last_listed_on && daysBetween(lead.last_listed_on, day) < cooldownDays
}

/** How much is left to call, and how long it lasts. */
export function poolStats(leads, settings = {}, day = cairoToday()) {
  const cooldown = settings.daily_cooldown_days ?? 14
  const size = settings.daily_new_calls ?? 30
  const pool = leads.filter((l) => isPoolLead(l, leads))
  const ready = pool.filter((l) => !isResting(l, day, cooldown))
  const bySource = {}
  for (const l of pool) bySource[l.source] = (bySource[l.source] ?? 0) + 1
  return {
    total: pool.length,
    ready: ready.length,
    resting: pool.length - ready.length,
    daysLeft: Math.floor(ready.length / Math.max(1, size)),
    bySource: Object.entries(bySource).sort((a, b) => b[1] - a[1]),
  }
}

const isFreshSignup = (l, now) =>
  l.stage === 'trial' && !l.last_contacted_at && !!l.trial_started_at && now - new Date(l.trial_started_at).getTime() < 3 * DAY

/**
 * The list as the screen shows it.
 * @returns {{lead, score, parts, bucket: 0|1|2, why}[]}  0 urgent, 1 follow-up, 2 new today
 */
export function buildTodayList(leads, dailyIds = [], { weights, targetAreas, now = Date.now() } = {}) {
  const inBatch = new Set(dailyIds)
  const visible = leads.filter((l) => l.phone && !l.archived_at)
  const list = []
  for (const item of buildQueue(visible, { weights, targetAreas, now })) {
    const { lead, bucket } = item
    if (bucket === 2) {
      if (isFreshSignup(lead, now)) list.push({ ...item, bucket: 0, why: 'سجّل حالاً ولسه محدش كلّمه — رحّب بيه وساعده يبدأ' })
      else if (inBatch.has(lead.id) && lead.stage === 'new') list.push({ ...item, why: 'من قايمة النهارده' })
      continue
    }
    list.push(item)
  }
  return list.sort((a, b) => a.bucket - b.bucket || b.score - a.score)
}

/**
 * Which pool leads to call today, best first.
 * @param {string[]} exclude  ids already on today's list
 * @param {number} count      how many; defaults to the room urgent leads leave
 */
export function pickDailyLeads(leads, settings = {}, { now = Date.now(), day = cairoToday(new Date(now)), exclude = [], count } = {}) {
  const opts = { weights: settings.weights, targetAreas: settings.target_areas, now }
  const size = settings.daily_new_calls ?? 30
  const room = count ?? Math.max(0, size - buildTodayList(leads, [], opts).length)
  if (!room) return []
  const skip = new Set(exclude)
  const cooldown = settings.daily_cooldown_days ?? 14
  return leads
    .filter((l) => isPoolLead(l, leads) && !skip.has(l.id) && !isResting(l, day, cooldown))
    .map((lead) => ({ id: lead.id, score: scoreLead(lead, opts).total, times: lead.times_listed ?? 0 }))
    .sort((a, b) => a.times - b.times || b.score - a.score)
    .slice(0, room)
    .map((x) => x.id)
}

/** Latest automatic run, judged: is the automation alive? */
export function automationHealth(runs = [], now = Date.now()) {
  const last = runs.find((r) => r.finished_at)
  if (!last) return { state: 'never', last: null }
  const hours = (now - new Date(last.finished_at).getTime()) / 36e5
  if (hours > 36) return { state: 'stale', last, hours: Math.round(hours) }
  return { state: last.ok ? 'ok' : 'failed', last, hours: Math.round(hours) }
}
