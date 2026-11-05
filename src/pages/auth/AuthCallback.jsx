import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { supabase } from '../../lib/supabase'
import { trackEvent } from '../../lib/tracking'
import { getStoredRef } from '../../lib/refCapture'
import { phoneSchema } from '../../lib/validators'
import AuthLayout from '../../components/auth/AuthLayout'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'

const PENDING_PHONE_KEY = 'beshola_pending_owner_phone'
const ownerPhoneSchema = phoneSchema('رقم الواتساب غير صحيح')

export default function AuthCallback() {
  const navigate = useNavigate()
  // A Google sign-up arrives here without the WhatsApp number the email form
  // requires; it's asked for right away, before anything else.
  const [needsPhone, setNeedsPhone] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function decide() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        navigate('/login', { replace: true })
        return
      }
      const { data: business } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', user.id)
        .maybeSingle()
      if (cancelled) return
      if (business) {
        navigate('/dashboard', { replace: true })
        return
      }
      // Email sign-ups are counted in Register.jsx; a Google sign-up never
      // passes through there, so its first landing without a business is it.
      if (user.app_metadata?.provider === 'google') {
        trackEvent('sign_up', { method: 'google' })
      }
      if (!user.user_metadata?.owner_phone && !sessionStorage.getItem(PENDING_PHONE_KEY)) {
        setNeedsPhone(true)
        return
      }
      navigate('/onboarding', { replace: true })
    }

    decide()
    return () => { cancelled = true }
  }, [navigate])

  if (needsPhone) return <PhoneStep onDone={() => navigate('/onboarding', { replace: true })} />

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Helmet><meta name="robots" content="noindex" /></Helmet>
      <div className="w-8 h-8 border-4 border-accent-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function PhoneStep({ onDone }) {
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e) {
    e.preventDefault()
    const parsed = ownerPhoneSchema.safeParse(phone)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'رقم الواتساب غير صحيح')
      return
    }
    setSaving(true)
    setError('')
    const ref = getStoredRef()
    // Saved on the account (like the email form does) so the number — and any
    // partner/referral code — survives even if onboarding is left half-way.
    const { error: updateError } = await supabase.auth.updateUser({
      data: { owner_phone: parsed.data, ...(ref ? { ref } : {}) },
    })
    setSaving(false)
    if (updateError) {
      setError('حصلت مشكلة — جرّب تاني')
      return
    }
    // Onboarding reads this and won't ask for the number a second time.
    sessionStorage.setItem(PENDING_PHONE_KEY, parsed.data)
    onDone()
  }

  return (
    <AuthLayout title="خطوة واحدة كمان" subtitle="رقم الواتساب بتاعك عشان نقدر نساعدك في الإعداد ونبعتلك أي تحديث مهم.">
      <Helmet>
        <title>رقم الواتساب — بسهولة</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <form onSubmit={submit} className="space-y-5">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">رقم الواتساب بتاعك</h2>
          <p className="text-gray-500 text-sm mt-1">لازم عشان نكمّل إنشاء حسابك.</p>
        </div>
        <Input
          label="رقم الواتساب"
          placeholder="01XXXXXXXXX"
          dir="ltr"
          inputMode="tel"
          autoComplete="tel"
          autoFocus
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={error}
        />
        <Button type="submit" loading={saving} className="w-full">كمّل</Button>
      </form>
    </AuthLayout>
  )
}
