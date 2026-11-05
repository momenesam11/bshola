// Egyptian phone handling — must match growth_normalize_phone() in
// supabase/migrations/032_growth_engine.sql, which is what the unique index
// on growth_leads.phone is built on.

/** "01012345678" / "+20 101 234 5678" / "00201012345678" → "201012345678"; null if not a phone. */
export function normalizePhone(raw) {
  let d = String(raw ?? '').replace(/[^0-9]/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (/^0[0-9]{9,10}$/.test(d)) d = `20${d.slice(1)}`
  else if (/^1[0-9]{9}$/.test(d)) d = `20${d}`
  return d.length >= 11 && d.length <= 15 ? d : null
}

/** Egyptian mobile numbers (010/011/012/015) — the ones that have WhatsApp. */
export function isMobile(phone) {
  return /^201[0125][0-9]{8}$/.test(phone ?? '')
}

/** "201012345678" → "0101 234 5678" for reading out loud on a call. */
export function displayPhone(phone) {
  if (!phone) return ''
  if (phone.startsWith('20')) {
    const local = `0${phone.slice(2)}`
    return local.length === 11 ? `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}` : local
  }
  return `+${phone}`
}

export function whatsappLink(phone, text = '') {
  if (!phone) return null
  return `https://wa.me/${phone}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

export function telLink(phone) {
  return phone ? `tel:+${phone}` : null
}
