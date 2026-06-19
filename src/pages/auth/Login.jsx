import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { loginSchema } from '../../lib/validators'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'

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
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6" style={{ background: 'linear-gradient(135deg, #E8EEF4, #D7F5EE)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
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
            <Input
              label="كلمة المرور"
              type="password"
              placeholder="••••••••"
              dir="ltr"
              error={errors.password?.message}
              {...register('password')}
            />

            {serverError && (
              <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg">{serverError}</div>
            )}

            <Button type="submit" loading={isSubmitting} className="w-full">
              تسجيل الدخول
            </Button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-4">
            لسه معاك حساب؟{' '}
            <Link to="/register" className="text-accent-600 font-medium hover:underline">
              سجل دلوقتي
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
