import { z } from 'zod'

// Egyptian/Arabic phone format — allows a leading "+" and spaces/dashes,
// normalizes to 10-15 digits before validating.
export const phoneSchema = (message = 'رقم الهاتف غير صحيح') =>
  z.preprocess(
    v => String(v ?? '').replace(/[\s\-().]/g, '').replace(/^\+/, ''),
    z.string().min(1, 'هذا الحقل مطلوب').regex(/^[0-9]{10,15}$/, message)
  )

export function getPasswordStrength(password = '') {
  if (!password) return { label: '', color: '' }
  let score = 0
  if (password.length >= 8) score++
  if (/[0-9]/.test(password)) score++
  if (/[a-zA-Z]/.test(password)) score++
  if (/[^a-zA-Z0-9]/.test(password)) score++
  if (score <= 1) return { label: 'ضعيفة', color: 'text-red-500' }
  if (score <= 2) return { label: 'متوسطة', color: 'text-amber-500' }
  return { label: 'قوية', color: 'text-accent-600' }
}

export const loginSchema = z.object({
  email: z.string().min(1, 'هذا الحقل مطلوب').email('بريد إلكتروني غير صحيح'),
  password: z.string().min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
})

export const registerSchema = z.object({
  email: z.string().min(1, 'هذا الحقل مطلوب').email('بريد إلكتروني غير صحيح'),
  password: z.string()
    .min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل')
    .regex(/[0-9]/, 'يجب أن تحتوي كلمة المرور على رقم واحد على الأقل'),
  confirmPassword: z.string().min(1, 'هذا الحقل مطلوب'),
  ownerPhone: phoneSchema('رقم الواتساب غير صحيح'),
}).refine(d => d.password === d.confirmPassword, {
  message: 'كلمات المرور غير متطابقة',
  path: ['confirmPassword'],
})

export const businessInfoSchema = z.object({
  name: z.string().min(2, 'اسم النشاط يجب أن يكون حرفين على الأقل'),
  type: z.enum(['clinic', 'salon', 'gym', 'education', 'facility', 'trainer', 'other'], {
    required_error: 'اختر نوع النشاط',
  }),
  phone: z.string().min(9, 'رقم الهاتف غير صحيح'),
})

export const serviceSchema = z.object({
  name: z.string().min(2, 'اسم الخدمة مطلوب'),
  duration_minutes: z.coerce.number().min(15, 'المدة يجب أن تكون 15 دقيقة على الأقل'),
  price: z.coerce.number().min(0).optional(),
})

export const appointmentSchema = z.object({
  client_name: z.string().min(2, 'اسم العميل مطلوب'),
  client_phone: z.preprocess(
    v => String(v).replace(/[\s\-().+]/g, ''),
    z.string().regex(/^[0-9]{10,15}$/, 'رقم الواتساب يجب أن يحتوي على أرقام فقط (10-15 رقم)')
  ),
  service_id: z.string().min(1, 'اختر الخدمة').uuid('اختر الخدمة'),
  appointment_date: z.string().min(1, 'التاريخ مطلوب'),
  appointment_time: z.string().min(1, 'الوقت مطلوب'),
  status: z.enum(['confirmed', 'cancelled', 'no_show', 'completed']).default('confirmed'),
  notes: z.string().optional(),
})

export const bookingClientSchema = z.object({
  client_name: z.string().min(2, 'الاسم مطلوب'),
  client_phone: z.preprocess(
    v => String(v).replace(/[\s\-().+]/g, ''),
    z.string().regex(/^[0-9]{10,15}$/, 'رقم الواتساب يجب أن يحتوي على أرقام فقط (10-15 رقم)')
  ),
})
