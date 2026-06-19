export const MEDICAL_TYPES = ['clinic'] // عيادة
export const SIMPLE_RECORD_TYPES = ['salon', 'fitness', 'gym', 'education', 'sports', 'facility', 'services', 'trainer', 'other'] // صالون، لياقة، تعليم، ملاعب، خدمات

export const BUSINESS_TYPES = [
  { value: 'clinic', label: 'عيادة طبية' },
  { value: 'salon', label: 'صالون وباربر' },
  { value: 'gym', label: 'مركز لياقة وجيم' },
  { value: 'education', label: 'تعليم وتدريس' },
  { value: 'facility', label: 'ملاعب ومرافق' },
  { value: 'trainer', label: 'مدرب شخصي' },
  { value: 'other', label: 'خدمات أخرى' },
]

export const DAYS_AR = {
  sat: 'السبت',
  sun: 'الأحد',
  mon: 'الاثنين',
  tue: 'الثلاثاء',
  wed: 'الأربعاء',
  thu: 'الخميس',
  fri: 'الجمعة',
}

export const DAYS_ORDER = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri']

export const DEFAULT_WORKING_HOURS = {
  sat: { open: '09:00', close: '18:00', active: true },
  sun: { open: '09:00', close: '18:00', active: true },
  mon: { open: '09:00', close: '18:00', active: true },
  tue: { open: '09:00', close: '18:00', active: true },
  wed: { open: '09:00', close: '18:00', active: true },
  thu: { open: '09:00', close: '18:00', active: true },
  fri: { open: '09:00', close: '18:00', active: false },
}

export const STATUS_CONFIG = {
  confirmed: { label: 'مؤكد', color: 'emerald' },
  cancelled: { label: 'ملغي', color: 'red' },
  no_show: { label: 'لم يحضر', color: 'orange' },
  completed: { label: 'مكتمل', color: 'blue' },
}

export const REMINDER_OPTIONS = [
  { value: 2, label: 'ساعتان قبل الموعد' },
  { value: 6, label: '6 ساعات قبل الموعد' },
  { value: 12, label: '12 ساعة قبل الموعد' },
  { value: 24, label: '24 ساعة قبل الموعد' },
  { value: 48, label: '48 ساعة قبل الموعد' },
]

export const DEFAULT_REMINDER_TEMPLATE =
  'مرحباً {client_name}، نذكرك بموعدك في {business_name} لخدمة {service} الساعة {time}. نتطلع لرؤيتك!'

// Cycled per-branch colors — used when viewing "كل الفروع" (all branches)
// together, so each branch's appointments are visually distinguishable.
export const BRANCH_COLOR_PALETTE = [
  { dot: 'bg-accent-500', border: 'border-accent-500', light: 'bg-accent-50 border-accent-200 text-accent-700', hex: '#16B89A' },
  { dot: 'bg-primary-500', border: 'border-primary-500', light: 'bg-primary-50 border-primary-200 text-primary-700', hex: '#8B5CF6' },
  { dot: 'bg-amber-500', border: 'border-amber-500', light: 'bg-amber-50 border-amber-200 text-amber-700', hex: '#F59E0B' },
  { dot: 'bg-blue-500', border: 'border-blue-500', light: 'bg-blue-50 border-blue-200 text-blue-700', hex: '#3B82F6' },
]

export function getBranchColor(branchId, branches = []) {
  const idx = branches.findIndex(b => b.id === branchId)
  return BRANCH_COLOR_PALETTE[idx >= 0 ? idx % BRANCH_COLOR_PALETTE.length : 0]
}
