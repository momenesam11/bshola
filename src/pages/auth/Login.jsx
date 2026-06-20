import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { loginSchema } from '../../lib/validators'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import AuthLayout from '../../components/auth/AuthLayout'
import GoogleButton from '../../components/auth/GoogleButton'

export default function Login() {
  const navigate = useNavigate()
  const [serverError, setServerError] = useState('')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit({ email, password }) {
    setServerError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      if (error.message?.toLowerCase().includes('email not confirmed')) {
        setServerError('يرجى تأكيد بريدك الإلكتروني أولاً — تحقق من صندوق الوارد')
      } else {
        setServerError('البريد الإلكتروني أو كلمة المرور غير صحيحة')
      }
      return
    }
    navigate('/dashboard')
  }

  return (
    <AuthLayout
      title="أهلاً بيك في بسهولة!"
      subtitle="سيب التنظيم والمتابعة اليدوية وركز في عملك — زود إنتاجيتك وفر وقتك مع بسهولة."
    >
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">أهلاً بيك تاني!</h2>
        <p className="text-gray-500 text-sm mt-1">
          لسه معاك حساب؟{' '}
          <Link to="/register" className="text-accent-600 font-medium hover:underline">
            سجل حساب جديد دلوقتي
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
          <div className="text-left mt-1.5">
            <Link to="/forgot-password" className="text-xs text-gray-500 hover:text-accent-600 hover:underline">
              نسيت كلمة المرور؟
            </Link>
          </div>
        </div>

        {serverError && (
          <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg">{serverError}</div>
        )}

        <Button type="submit" loading={isSubmitting} className="w-full">
          تسجيل الدخول
        </Button>
      </form>

      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400">أو</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      <GoogleButton label="الدخول بحساب Google" />
    </AuthLayout>
  )
}
