// "Is this lead real?" — a quick, explainable data-quality verdict shown on
// every lead, so test sign-ups and junk don't pass for prospects.
//
//   test       the owner flagged it as a test account
//   real       evidence it's a real business: verified by bookings / by the
//              admin, or a listing pulled from Google Maps
//   suspect    something looks off (reasons listed) — review it
//   unknown    nothing either way yet
//
// Pure function of the lead (and, for duplicates, the rest of the list).

import { SUPPORT_WHATSAPP, SUPPORT_EMAIL } from '../support'

const TEST_WORDS = /(^|\s|_|-)(test|testing|demo|fake|asdf|qwer|xxx|تجربة|تجربه|تست|اختبار|ديمو)(\s|$|_|-|\d)/i
const DISPOSABLE = /@(mailinator|guerrillamail|10minutemail|tempmail|temp-mail|yopmail|trashmail|sharklasers|getnada|dispostable)\./i

function junkPhone(phone) {
  if (!phone) return false
  const local = phone.startsWith('20') ? phone.slice(2) : phone
  if (/^(\d)\1{6,}/.test(local.slice(2))) return true // 01000000000, 0111111111…
  return /0123456789|1234567890|9876543210/.test(local)
}

/**
 * @returns {{ level: 'test'|'real'|'suspect'|'unknown', label: string, reasons: string[] }}
 */
export function dataQuality(lead, allLeads = []) {
  if (lead.is_test) return { level: 'test', label: 'حساب تجربة', reasons: ['إنت علّمته حساب تجربة'] }
  // Your own call beats any heuristic.
  if (lead.qualified_by === 'admin') return { level: 'real', label: 'حقيقي', reasons: ['إنت أكّدته'] }

  const reasons = []
  if (lead.phone && lead.phone === SUPPORT_WHATSAPP) reasons.push('ده رقمك إنت')
  if (lead.email && lead.email.toLowerCase() === SUPPORT_EMAIL.toLowerCase()) reasons.push('ده إيميلك إنت')
  if (TEST_WORDS.test(` ${lead.name ?? ''} `) || TEST_WORDS.test(` ${lead.email ?? ''} `)) reasons.push('الاسم أو الإيميل شكله تجربة')
  if (lead.email && DISPOSABLE.test(lead.email)) reasons.push('إيميل مؤقت')
  if (junkPhone(lead.phone)) reasons.push('الرقم شكله مش حقيقي')
  if (lead.name && /^[^\s@]+@[^\s@]+$/.test(lead.name.trim())) reasons.push('مفيش اسم عيادة — إيميل بس')
  if ((lead.name ?? '').trim().length < 3) reasons.push('الاسم قصير جداً')
  if (lead.email && allLeads.some((l) => l.id !== lead.id && !l.is_test && l.email && l.email.toLowerCase() === lead.email.toLowerCase())) {
    reasons.push('نفس الإيميل على عميل تاني')
  }

  if (reasons.length) return { level: 'suspect', label: 'محتاج مراجعة', reasons }

  if (lead.qualified_at) {
    return { level: 'real', label: 'حقيقي', reasons: [lead.qualified_by === 'admin' ? 'إنت أكّدته' : 'عنده حجوزات من عملاء حقيقيين'] }
  }
  if (lead.google_place_id || lead.google_maps_url) {
    return { level: 'real', label: 'حقيقي', reasons: ['موجود على خرائط جوجل'] }
  }
  if (lead.stage === 'paid') return { level: 'real', label: 'حقيقي', reasons: ['دفع اشتراك'] }
  return { level: 'unknown', label: 'لسه مش متأكدين', reasons: ['مفيش دليل لسه — اتأكد في أول مكالمة'] }
}

export const QUALITY_STYLE = {
  real: { icon: '✅', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  unknown: { icon: '❔', tone: 'bg-gray-50 text-gray-500 border-gray-200' },
  suspect: { icon: '⚠️', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  test: { icon: '🧪', tone: 'bg-gray-100 text-gray-500 border-gray-200' },
}
