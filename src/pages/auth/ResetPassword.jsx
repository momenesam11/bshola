import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { supabase } from '../../lib/supabase'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import AuthLayout from '../../components/auth/AuthLayout'

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل').regex(/\d/, 'يجب أن تحتوي على رقم واحد على الأقل'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'كلمتا المرور غير متطابقتين',
    path: ['confirmPassword'],
  })

export default function ResetPassword() {
  const navigate = useNavigate()
  const [serverError, setServerError] = useState('')
  const [ready, setReady] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(resetPasswordSchema),
  })

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function onSubmit({ password }) {
    setServerError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setServerError('حدث خطأ، حاول مرة أخرى أو اطلب رابطاً جديداً')
      return
    }
    navigate('/dashboard')
  }

  return (
    <AuthLayout
      title="كلمة مرور جديدة"
      subtitle="اختار كلمة مرور قوية وآمنة لحسابك."
    >
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">إعادة تعيين كلمة المرور</h2>
        <p className="text-gray-500 text-sm mt-1">اكتب كلمة المرور الجديدة لحسابك</p>
      </div>

      {!ready && (
        <div className="bg-amber-50 text-amber-700 text-sm px-3 py-2 rounded-lg mb-4">
          الرابط غير صالح أو منتهي — افتح الرابط من بريدك الإلكتروني مرة أخرى
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="كلمة المرور الجديدة"
          type="password"
          placeholder="••••••••"
          dir="ltr"
          disabled={!ready}
          error={errors.password?.message}
          {...register('password')}
        />
        <Input
          label="تأكيد كلمة المرور"
          type="password"
          placeholder="••••••••"
          dir="ltr"
          disabled={!ready}
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        {serverError && (
          <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg">{serverError}</div>
        )}

        <Button type="submit" loading={isSubmitting} disabled={!ready} className="w-full">
          حفظ كلمة المرور
        </Button>
      </form>
    </AuthLayout>
  )
}
