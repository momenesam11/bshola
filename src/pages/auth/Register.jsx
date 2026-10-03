import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { supabase } from '../../lib/supabase'
import { trackEvent } from '../../lib/tracking'
import { getStoredRef } from '../../lib/refCapture'
import { registerSchema, getPasswordStrength } from '../../lib/validators'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import AuthLayout from '../../components/auth/AuthLayout'
import GoogleButton from '../../components/auth/GoogleButton'

export default function Register() {
  const navigate = useNavigate()
  const [serverError, setServerError] = useState('')
  const [success, setSuccess] = useState(false)

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(registerSchema),
  })
  const passwordStrength = getPasswordStrength(watch('password'))
  // The partner/referral/lead code they came with. Read from the URL too: on a
  // direct /register?ref=… visit this renders before RouteTracker stores it.
  const [refCode] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('ref')
    return /^[LPRB]-[A-Za-z0-9-]{2,80}$/.test(fromUrl ?? '') ? fromUrl : getStoredRef()
  })

  async function onSubmit({ email, password, ownerPhone }) {
    setServerError('')
    sessionStorage.setItem('beshola_pending_owner_phone', ownerPhone)
    // Phone also goes into auth metadata: sessionStorage is lost if they confirm
    // their email on another device, and someone who never finishes onboarding
    // is a lead we want to call (growth_sync_platform reads owner_phone).
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { owner_phone: ownerPhone, ...(refCode ? { ref: refCode } : {}) } } })
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
    trackEvent('sign_up', { method: 'email' })
    // If session is null, email confirmation is required
    if (!data.session) {
      setSuccess(true)
      return
    }
    navigate('/onboarding')
  }

  if (success) {
    return (
      <AuthLayout
        title="خطوة كده وخلصنا!"
        subtitle="بعد تأكيد بريدك هتقدر تبدأ في تنظيم مواعيدك وعملاءك في دقايق."
      >
        <Helmet>
          <title>تأكيد البريد الإلكتروني — بسهولة</title>
          <meta name="robots" content="noindex" />
        </Helmet>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">تحقق من بريدك</h2>
          <p className="text-gray-500 text-sm">أرسلنا لك رابط تأكيد — افتح بريدك وانقر على الرابط ثم سجّل دخولك</p>
          <Link to="/login" className="mt-6 inline-block text-accent-600 font-medium hover:underline text-sm">
            العودة لتسجيل الدخول
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="ابدأ مع بسهولة"
      subtitle="سيب التنظيم والمتابعة اليدوية وركز في عملك — زود إنتاجيتك وفر وقتك مع بسهولة."
    >
      <Helmet>
        <title>إنشاء حساب — بسهولة</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="mb-8">
        {refCode && (
          <p className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-accent-700 bg-accent-50 border border-accent-100 rounded-lg px-3 py-1.5">
            🎁 جاي بترشيح — هيتسجّل مع حسابك
          </p>
        )}
        <h2 className="text-2xl font-bold text-gray-900">إنشاء حساب جديد</h2>
        <p className="text-gray-500 text-sm mt-1">
          عندك حساب؟{' '}
          <Link to="/login" className="text-accent-600 font-medium hover:underline">
            سجل دخول
          </Link>
        </p>
      </div>

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

      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400">أو</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      <GoogleButton label="التسجيل بحساب Google" />
    </AuthLayout>
  )
}
