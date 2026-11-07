import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { supabase } from '../../lib/supabase'
import { trackEvent } from '../../lib/tracking'
import { getStoredRef } from '../../lib/refCapture'
import { phoneSchema } from '../../lib/validators'
import AuthLayout from '../../components/auth/AuthLayout'
import Button from '../../components/ui/Button'
import PhoneInput from '../../components/ui/PhoneInput'
import TermsCheckbox from '../../components/auth/TermsCheckbox'
import { PENDING_TERMS_KEY, termsAcceptance } from '../../lib/terms'
import { useVisitorCountry } from '../../hooks/useVisitorPricing'

const PENDING_PHONE_KEY = 'beshola_pending_owner_phone'
const ownerPhoneSchema = phoneSchema('رقم الواتساب غير صحيح')

export default function AuthCallback() {
  const navigate = useNavigate()
  // A Google sign-up can arrive without the WhatsApp number or the accepted terms
  // that the email form requires. Both are asked for before anything else.
  const [missing, setMissing] = useState(null)

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
      // They ticked the box on /register before leaving for Google.
      let acceptedTerms = Boolean(user.user_metadata?.terms_accepted_at)
      if (!acceptedTerms && sessionStorage.getItem(PENDING_TERMS_KEY)) {
        const { error } = await supabase.auth.updateUser({ data: termsAcceptance() })
        if (cancelled) return
        acceptedTerms = !error
        if (!error) sessionStorage.removeItem(PENDING_TERMS_KEY)
      }
      const needsPhone = !user.user_metadata?.owner_phone && !sessionStorage.getItem(PENDING_PHONE_KEY)
      if (needsPhone || !acceptedTerms) {
        setMissing({ phone: needsPhone, terms: !acceptedTerms })
        return
      }
      navigate('/onboarding', { replace: true })
    }

    decide()
    return () => { cancelled = true }
  }, [navigate])

  if (missing) return <AccountStep missing={missing} onDone={() => navigate('/onboarding', { replace: true })} />

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Helmet><meta name="robots" content="noindex" /></Helmet>
      <div className="w-8 h-8 border-4 border-accent-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function AccountStep({ missing, onDone }) {
  const visitorCountry = useVisitorCountry()
  const [phone, setPhone] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState('')
  const [termsError, setTermsError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e) {
    e.preventDefault()
    const parsed = missing.phone ? ownerPhoneSchema.safeParse(phone) : null
    const phoneOk = !parsed || parsed.success
    const termsOk = !missing.terms || accepted
    setError(phoneOk ? '' : parsed.error.issues[0]?.message ?? 'رقم الواتساب غير صحيح')
    setTermsError(termsOk ? '' : 'لازم توافق على الشروط والأحكام عشان تنشئ حساب')
    if (!phoneOk || !termsOk) return
    setSaving(true)
    const ref = getStoredRef()
    // Saved on the account (like the email form does) so the number — and any
    // partner/referral code — survives even if onboarding is left half-way.
    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        ...(parsed ? { owner_phone: parsed.data } : {}),
        ...(missing.terms ? termsAcceptance() : {}),
        ...(ref ? { ref } : {}),
      },
    })
    setSaving(false)
    if (updateError) {
      setError('حصلت مشكلة — جرّب تاني')
      return
    }
    // Onboarding reads this and won't ask for the number a second time.
    if (parsed) sessionStorage.setItem(PENDING_PHONE_KEY, parsed.data)
    onDone()
  }

  return (
    <AuthLayout
      title="خطوة واحدة كمان"
      subtitle={missing.phone ? 'رقم الواتساب بتاعك عشان نقدر نساعدك في الإعداد ونبعتلك أي تحديث مهم.' : 'وافق على الشروط والأحكام عشان نكمّل إنشاء حسابك.'}
    >
      <Helmet>
        <title>إكمال الحساب — بسهولة</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <form onSubmit={submit} className="space-y-5">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{missing.phone ? 'رقم الواتساب بتاعك' : 'الشروط والأحكام'}</h2>
          <p className="text-gray-500 text-sm mt-1">لازم عشان نكمّل إنشاء حسابك.</p>
        </div>
        {missing.phone && (
          <PhoneInput
            label="رقم الواتساب"
            autoFocus
            defaultCountry={visitorCountry}
            value={phone}
            onChange={setPhone}
            error={error}
          />
        )}
        {missing.terms && (
          <TermsCheckbox checked={accepted} onChange={(e) => setAccepted(e.target.checked)} error={termsError} />
        )}
        <Button type="submit" loading={saving} className="w-full">كمّل</Button>
      </form>
    </AuthLayout>
  )
}
