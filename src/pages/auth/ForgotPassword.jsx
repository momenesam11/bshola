import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { z } from 'zod'
import { supabase } from '../../lib/supabase'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import AuthLayout from '../../components/auth/AuthLayout'

const forgotPasswordSchema = z.object({
  email: z.string().email('بريد إلكتروني غير صحيح'),
})

export default function ForgotPassword() {
  const [serverError, setServerError] = useState('')
  const [sent, setSent] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(forgotPasswordSchema),
  })

  async function onSubmit({ email }) {
    setServerError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) {
      setServerError('حدث خطأ، حاول مرة أخرى')
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <AuthLayout
        title="على وشك ترجع لحسابك"
        subtitle="تابع بريدك الإلكتروني للحصول على رابط إعادة تعيين كلمة المرور."
      >
        <Helmet><meta name="robots" content="noindex" /></Helmet>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">تحقق من بريدك</h2>
          <p className="text-gray-500 text-sm">أرسلنا لك رابط لإعادة تعيين كلمة المرور — افتح بريدك وانقر على الرابط</p>
          <Link to="/login" className="mt-6 inline-block text-accent-600 font-medium hover:underline text-sm">
            العودة لتسجيل الدخول
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="حصل لك حاجة؟"
      subtitle="لا تقلق، هنساعدك ترجع لحسابك في خطوتين بس."
    >
      <Helmet>
        <title>نسيت كلمة المرور — بسهولة</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">نسيت كلمة المرور؟</h2>
        <p className="text-gray-500 text-sm mt-1">اكتب بريدك الإلكتروني وهنبعتلك رابط لإعادة تعيين كلمة المرور</p>
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

        {serverError && (
          <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg">{serverError}</div>
        )}

        <Button type="submit" loading={isSubmitting} className="w-full">
          إرسال رابط إعادة التعيين
        </Button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-5">
        <Link to="/login" className="text-accent-600 font-medium hover:underline">
          العودة لتسجيل الدخول
        </Link>
      </p>
    </AuthLayout>
  )
}
