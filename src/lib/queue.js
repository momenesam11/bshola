// "How many are ahead of you" for walk-in style clinics (migration 053). The
// order is the booking time: the patient booked at 10:00 goes in before the one
// at 10:30, whoever arrives first. Messages go out by hand from the clinic's
// own WhatsApp, so the patient gets a plain text with no link to open.

export const DEFAULT_NOTIFY_AHEAD = 3
export const MAX_NOTIFY_AHEAD = 10

/** Today's patients still waiting, in booking-time order. */
export function waitingQueue(appointments, branchId = null) {
  return (appointments || [])
    .filter(a => a.status === 'confirmed')
    .filter(a => !branchId || !a.branch_id || a.branch_id === branchId)
    .sort((a, b) => String(a.appointment_time).localeCompare(String(b.appointment_time)) || String(a.created_at || '').localeCompare(String(b.created_at || '')))
}

/** The clinic's "tell them when N are ahead" setting, kept within 1..10. */
export function notifyAheadOf(business) {
  const n = Number(business?.queue_notify_ahead)
  return Number.isInteger(n) && n >= 1 && n <= MAX_NOTIFY_AHEAD ? n : DEFAULT_NOTIFY_AHEAD
}

/**
 * The patient to message now: the one with exactly N ahead, if they haven't
 * been told yet. With fewer than N+1 waiting, nobody is due.
 */
export function dueForNotice(queue, ahead) {
  const p = queue[ahead]
  return p && !p.queue_notified_at ? p : null
}

function aheadText(ahead) {
  if (ahead === 1) return 'باقي قدامك مريض واحد'
  if (ahead === 2) return 'باقي قدامك اتنين'
  return `باقي قدامك ${ahead} ${ahead <= 10 ? 'مرضى' : 'مريض'}`
}

export function queueMessage(appointment, ahead, business, branch) {
  const where = branch?.name && branch.name !== business.name ? `${business.name} (${branch.name})` : business.name
  const line = ahead === 0
    ? `دورك دلوقتي في ${where}، اتفضل.`
    : `${aheadText(ahead)} في ${where}.\nتقدر تتحرك دلوقتي عشان توصل على دورك.`
  return `أهلاً يا ${appointment.client_name}

${line}
لو محتاج حاجة ردّ على الرسالة دي.

— ${business.name}`
}
