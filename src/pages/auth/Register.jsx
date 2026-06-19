import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { registerSchema, getPasswordStrength } from '../../lib/validators'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'

export default function Register() {
  const navigate = useNavigate()
  const [serverError, setServerError] = useState('')
  const [success, setSuccess] = useState(false)

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(registerSchema),
  })
  const passwordStrength = getPasswordStrength(watch('password'))

  async function onSubmit({ email, password, ownerPhone }) {
    setServerError('')
    sessionStorage.setItem('mawid_pending_owner_phone', ownerPhone)
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) {
      const msg = error.message || ''
      if (msg.includes('already registered') || msg.includes('already been registered')) {
        setServerError('هذا البريد الإلكتروني مسجل بالفعل')
      } else if (msg.toLowerCase().includes('password')) {
        setServerError('كلمة المرور ضعيفة — يجب أن تحتوي على 8 أحرف على الأقل وتشمل أرقاماً وحروفاً')
      } else {
        setServerError(`خطأ: ${msg}`)
      }
      return
    }
    // If session is null, email confirmation is required
    if (!data.session) {
      setSuccess(true)
      return
    }
    navigate('/onboarding')
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #E8EEF4, #D7F5EE)' }}>
        <div className="w-full max-w-sm text-center sm:bg-white sm:shadow-sm sm:border sm:border-gray-100 sm:rounded-2xl sm:p-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-700 rounded-2xl mb-4 shadow-lg">
            <span className="text-white font-bold text-3xl">ب</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">تحقق من بريدك</h1>
          <p className="text-gray-500 text-sm">أرسلنا لك رابط تأكيد — افتح بريدك وانقر على الرابط ثم سجّل دخولك</p>
          <Link to="/login" className="mt-6 inline-block text-accent-600 font-medium hover:underline text-sm">
            العودة لتسجيل الدخول
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6" style={{ background: 'linear-gradient(135deg, #E8EEF4, #D7F5EE)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-700 rounded-2xl mb-3 shadow-lg">
            <span className="text-white font-bold text-3xl">ب</span>
          </div>
          <h1 className="text-2xl font-bold text-primary-700">بسهولة</h1>
          <p className="text-gray-500 text-sm mt-1">تنظيم أسهل، عملاء أكثر</p>
        </div>

        <div className="sm:bg-white sm:rounded-2xl sm:shadow-sm sm:border sm:border-gray-100 sm:p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="البريد الإلكتروني"
              type="email"
              placeholder="example@email.com"
              dir="ltr"
              error={errors.email?.message}
              {...register('email')}
            />
            <div>
              <Input
                label="كلمة المرور"
                type="password"
                placeholder="••••••••"
                dir="ltr"
                error={errors.password?.message}
                {...register('password')}
              />
              {!errors.password && passwordStrength.label && (
                <p className={`text-xs mt-1 ${passwordStrength.color}`}>قوة كلمة المرور: {passwordStrength.label}</p>
              )}
            </div>
            <Input
              label="تأكيد كلمة المرور"
              type="password"
              placeholder="••••••••"
              dir="ltr"
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />
            <Input
              label="رقم واتساب بتاعك"
              type="tel"
              placeholder="201XXXXXXXXX"
              dir="ltr"
              helper="هنتواصل معاك عليه للاشتراك"
              error={errors.ownerPhone?.message}
              {...register('ownerPhone')}
            />

            {serverError && (
              <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg">{serverError}</div>
            )}

            <Button type="submit" loading={isSubmitting} className="w-full">
              إنشاء حساب
            </Button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-4">
            عندك حساب؟{' '}
            <Link to="/login" className="text-accent-600 font-medium hover:underline">
              سجل دخول
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
