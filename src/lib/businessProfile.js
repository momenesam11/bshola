// Choices shared by the clinic's Settings page and the admin setup page.

export const BRAND_COLORS = [
  { hex: '#0D9B6C', label: 'أخضر' },
  { hex: '#3B82F6', label: 'أزرق' },
  { hex: '#8B5CF6', label: 'بنفسجي' },
  { hex: '#F59E0B', label: 'ذهبي' },
  { hex: '#EF4444', label: 'أحمر' },
  { hex: '#EC4899', label: 'وردي' },
  { hex: '#06B6D4', label: 'سماوي' },
  { hex: '#0F172A', label: 'داكن' },
]

export const CANCELLATION_OPTIONS = [
  'الإلغاء مجاني في أي وقت',
  'الإلغاء مجاني قبل 24 ساعة',
  'الإلغاء مجاني قبل 48 ساعة',
  'لا يوجد إلغاء بعد الحجز',
]

/** What a booking slug may contain, applied while typing. */
export const cleanSlug = (val) => val.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 30)
