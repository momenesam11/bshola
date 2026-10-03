// Client-side duplicate check, so a Google Maps result or a hand-typed clinic
// shows "already in your list" before saving. The database enforces the same
// rules (unique phone / place id; growth_import_leads skips name+area matches).

import { normalizePhone } from './phone'

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

/** @returns the existing lead this candidate duplicates, or null */
export function findDuplicate(candidate, leads) {
  const phone = normalizePhone(candidate.phone)
  const place = candidate.google_place_id
  const name = norm(candidate.name)
  const area = norm(candidate.area)
  return (
    leads.find(
      (l) =>
        (phone && l.phone === phone) ||
        (place && l.google_place_id === place) ||
        (name && area && norm(l.name) === name && norm(l.area) === area)
    ) ?? null
  )
}
