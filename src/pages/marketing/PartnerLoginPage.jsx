import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { FaWhatsapp } from 'react-icons/fa'
import Logo from '../../components/marketing/Logo'
import { partnerLogin } from '../../hooks/useGrowth'
import { SUPPORT_WHATSAPP } from '../../lib/support'

// Remembered on this device so a partner opens /partner and lands on their board.
export const PARTNER_TOKEN_KEY = 'beshola_partner_token'

/** /partner: phone + 6-digit code → the partner's own dashboard. */
export default function PartnerLoginPage() {
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PARTNER_TOKEN_KEY)
      if (saved) navigate(`/partner/${saved}`, { replace: true })
    } catch {
      // Storage blocked: they just log in each time.
    }
  }, [navigate])

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const token = await partnerLogin(phone, pin)
      if (!token) {
        setError('الرقم أو الكود مش صح. لو جرّبت كتير استنى ربع ساعة، أو اطلب كود جديد.')
        return
      }
      try {
        localStorage.setItem(PARTNER_TOKEN_KEY, token)
      } catch {
        // Fine: the link in the address bar still works.
      }
      navigate(`/partner/${token}`, { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const field = 'w-full border border-rule rounded-xl px-4 py-3 text-base text-ink bg-white focus:outline-none focus:ring-2 focus:ring-accent-400'

  return (
    <div className="min-h-screen bg-paper flex flex-col items-center justify-center p-5 text-ink" dir="rtl">
      <Helmet>
        <title>دخول الشركاء — بسهولة</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <Logo />
      <form onSubmit={submit} className="mt-6 w-full max-w-sm bg-white rounded-2xl border border-rule p-6 space-y-4">
        <div>
          <h1 className="text-xl font-extrabold">دخول الشركاء</h1>
          <p className="text-sm text-ink-soft mt-1">شوف العيادات اللي جبتها وفلوسك أول بأول.</p>
        </div>
        <label className="block">
          <span className="block text-sm font-semibold mb-1">رقم موبايلك</span>
          <input className={field} dir="ltr" inputMode="tel" autoComplete="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01012345678" />
        </label>
        <label className="block">
          <span className="block text-sm font-semibold mb-1">كود الدخول</span>
          <input className={`${field} tracking-[0.4em] text-center font-mono`} dir="ltr" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} pattern="[0-9]{6}"
            value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="••••••" />
          <span className="block text-xs text-ink-soft mt-1">6 أرقام، بعتناهولك على واتساب.</span>
        </label>
        {error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <button type="submit" disabled={busy} className="w-full bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white font-bold rounded-xl py-3">
          {busy ? 'بيدخل…' : 'ادخل'}
        </button>
        <a href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent('عايز كود دخول لوحة الشركاء')}`} target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 text-sm font-semibold text-accent-700">
          <FaWhatsapp className="w-4 h-4" /> نسيت الكود؟ أو عايز تبقى شريك؟
        </a>
      </form>
    </div>
  )
}
