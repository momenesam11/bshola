// Turns a clinic's open days into one short Arabic line for the booking page,
// e.g. "مفتوح يوميًا ما عدا الجمعة" or "مفتوح من السبت إلى الخميس".

export const DAY_LABELS_AR = { sat: 'السبت', sun: 'الأحد', mon: 'الاثنين', tue: 'الثلاثاء', wed: 'الأربعاء', thu: 'الخميس', fri: 'الجمعة' }
export const WEEK_ORDER = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri']

function joinAnd(items) {
  return items.join(' و')
}

// Consecutive runs of open days. The week wraps, so Friday→Saturday→Sunday is one run.
function openRuns(open) {
  // Start from Saturday, unless a run crosses Friday→Saturday; then start after the last closed day.
  const wraps = open.has('fri') && open.has('sat')
  const lastClosed = WEEK_ORDER.map(d => !open.has(d)).lastIndexOf(true)
  const start = wraps ? (lastClosed + 1) % 7 : 0
  const runs = []
  let run = []
  for (let i = 0; i < 7; i++) {
    const day = WEEK_ORDER[(start + i) % 7]
    if (open.has(day)) run.push(day)
    else if (run.length) { runs.push(run); run = [] }
  }
  if (run.length) runs.push(run)
  return runs
}

export function describeOpenDays(openDays) {
  const open = new Set(openDays.filter(d => WEEK_ORDER.includes(d)))
  if (!open.size) return null
  if (open.size === 7) return 'مفتوح طول أيام الأسبوع'

  const closed = WEEK_ORDER.filter(d => !open.has(d))
  const runs = openRuns(open)

  // One block of 3+ days in a row reads best as a range.
  if (runs.length === 1 && runs[0].length >= 3 && closed.length >= 2) {
    const r = runs[0]
    return `مفتوح من ${DAY_LABELS_AR[r[0]]} إلى ${DAY_LABELS_AR[r[r.length - 1]]}`
  }
  // Closed one or two days only: name the days off.
  if (closed.length <= 2) {
    return `مفتوح يوميًا ما عدا ${joinAnd(closed.map(d => DAY_LABELS_AR[d]))}`
  }
  // Otherwise list the open days, collapsing long runs into ranges.
  const parts = runs.map(r => r.length >= 3
    ? `من ${DAY_LABELS_AR[r[0]]} إلى ${DAY_LABELS_AR[r[r.length - 1]]}`
    : joinAnd(r.map(d => DAY_LABELS_AR[d])))
  return `مفتوح ${joinAnd(parts)}`
}

// "خبرة 26 سنة" with the right Arabic number agreement.
export function describeYears(n) {
  const years = Math.floor(Number(n))
  if (!(years > 0)) return null
  if (years === 1) return 'خبرة سنة'
  if (years === 2) return 'خبرة سنتين'
  if (years <= 10) return `خبرة ${years} سنوات`
  return `خبرة ${years} سنة`
}
