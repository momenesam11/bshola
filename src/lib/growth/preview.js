// Default content for a lead's personalised demo page (/demo/:code). The
// admin can edit the services before enabling it. Prices are deliberately
// left blank by default — we don't know the clinic's prices, and a made-up
// price on "their" page would be the first thing they object to.

const SERVICES_BY_CATEGORY = {
  dental: [
    { name: 'كشف', duration: 30 },
    { name: 'تنظيف أسنان', duration: 45 },
    { name: 'حشو', duration: 45 },
    { name: 'متابعة تقويم', duration: 20 },
  ],
  derma: [
    { name: 'كشف', duration: 30 },
    { name: 'جلسة ليزر', duration: 45 },
    { name: 'تنظيف بشرة', duration: 60 },
    { name: 'متابعة', duration: 15 },
  ],
  clinic: [
    { name: 'كشف', duration: 30 },
    { name: 'متابعة', duration: 15 },
    { name: 'استشارة', duration: 20 },
  ],
  salon: [
    { name: 'قص شعر', duration: 30 },
    { name: 'صبغة', duration: 90 },
    { name: 'مناكير', duration: 45 },
  ],
  gym: [
    { name: 'حصة تدريب شخصي', duration: 60 },
    { name: 'حصة جماعية', duration: 45 },
  ],
  education: [
    { name: 'حصة فردية', duration: 60 },
    { name: 'حصة مجموعة', duration: 90 },
  ],
  other: [
    { name: 'حجز موعد', duration: 30 },
  ],
}

export const PREVIEW_COLORS = ['#16B89A', '#3B82F6', '#8B5CF6', '#0F2C4E', '#EC4899', '#F59E0B']

const SPECIALTY_BY_CATEGORY = { dental: 'أسنان', derma: 'جلدية وتجميل', clinic: 'عيادة', salon: 'صالون', gym: 'لياقة', education: 'تعليم' }

export function defaultPreview(lead) {
  return {
    enabled: true,
    specialty: lead?.specialty || SPECIALTY_BY_CATEGORY[lead?.category] || '',
    color: PREVIEW_COLORS[0],
    services: SERVICES_BY_CATEGORY[lead?.category] ?? SERVICES_BY_CATEGORY.other,
  }
}

/** "عيادة د. سارة للأسنان" → "سا" — initials for the logo tile. */
export function initialsFor(name) {
  const words = String(name ?? '')
    .replace(/^(عيادة|عياده|مركز|صالون|د\.|دكتور|دكتورة)\s+/g, '')
    .replace(/^(د\.|دكتور|دكتورة)\s*/g, '')
    .split(/\s+/)
    .filter(Boolean)
  if (!words.length) return 'ب'
  return words.length === 1 ? words[0].slice(0, 2) : `${words[0][0]}${words[1][0]}`
}
