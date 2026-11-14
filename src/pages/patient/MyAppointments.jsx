import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { HiOutlineCalendarDays, HiOutlineClock, HiOutlineMapPin, HiOutlinePhone, HiOutlineQueueList } from 'react-icons/hi2'
import { supabase } from '../../lib/supabase'
import { formatDateArabic, formatTimeArabic } from '../../lib/whatsapp'
import { telHref } from '../../lib/countries'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'

// /m/<code>: a patient's own appointments at one clinic (migrations 054, 056).
// The code reaches them only in a WhatsApp message the clinic sent to their
// number, works until a week after that appointment, and cancelling also asks
// for the last 3 digits of the number.

const STATUS = {
  confirmed: { label: 'مؤكد', cls: 'bg-accent-50 text-accent-700' },
  waitlist: { label: 'في قايمة الانتظار', cls: 'bg-amber-50 text-amber-700' },
  completed: { label: 'حضرت', cls: 'bg-slate-100 text-slate-700' },
  no_show: { label: 'ما حضرتش', cls: 'bg-gray-100 text-gray-600' },
  cancelled: { label: 'اتلغى', cls: 'bg-red-50 text-red-600' },
}

const CANCEL_ERRORS = {
  WRONG_PHONE: 'الأرقام دي مش آخر 3 أرقام من الموبايل اللي حجزت بيه.',
  TOO_MANY_TRIES: 'محاولات كتير غلط. جرّب تاني بعد ساعة، أو كلّم العيادة.',
  CANNOT_CANCEL: 'مينفعش تلغي الميعاد ده من هنا دلوقتي. كلّم العيادة.',
}

function usePatientPage(code) {
  return useQuery({
    queryKey: ['patient-page', code],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('patient_page', { p_code: code })
      if (error) throw error
      return data
    },
    retry: false,
    // While the patient waits for today's turn, keep the count fresh.
    refetchInterval: (query) => (query.state.data?.upcoming?.some(a => a.ahead != null) ? 60_000 : false),
  })
}

function Badge({ status }) {
  const s = STATUS[status] || { label: status, cls: 'bg-gray-100 text-gray-600' }
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>
}

function When({ a }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
      <span className="flex items-center gap-1"><HiOutlineCalendarDays className="w-4 h-4" />{formatDateArabic(a.date)}</span>
      {a.status !== 'waitlist' && <span className="flex items-center gap-1"><HiOutlineClock className="w-4 h-4" />{formatTimeArabic(a.time)}</span>}
    </div>
  )
}

function Ahead({ count }) {
  return (
    <div data-testid="ahead" className="flex items-center gap-3 rounded-xl bg-accent-50 border border-accent-200 px-3 py-2.5">
      <HiOutlineQueueList className="w-6 h-6 text-accent-600 flex-shrink-0" />
      <div>
        <p className="font-bold text-ink">{count === 0 ? 'دورك دلوقتي' : `قدامك ${count === 1 ? 'مريض واحد' : count === 2 ? 'اتنين' : `${count} ${count <= 10 ? 'مرضى' : 'مريض'}`}`}</p>
        <p className="text-xs text-gray-500">بيتحدث لوحده كل دقيقة</p>
      </div>
    </div>
  )
}

function Shell({ children, color }) {
  return (
    <div className="min-h-screen bg-gray-50" dir="rtl" style={{ '--brand': color || '#0F9D82' }}>
      <Helmet>
        <title>مواعيدي</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">{children}</div>
    </div>
  )
}

function Notice({ title, text }) {
  return (
    <Shell>
      <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center space-y-2 mt-10">
        <p className="font-bold text-gray-900">{title}</p>
        <p className="text-sm text-gray-500">{text}</p>
      </div>
    </Shell>
  )
}

export default function MyAppointments() {
  const { code } = useParams()
  const qc = useQueryClient()
  const { data, isLoading, isError } = usePatientPage(code)
  const [target, setTarget] = useState(null)
  const [tail, setTail] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [cancelled, setCancelled] = useState(false)

  if (isLoading) return <Shell><p className="text-center text-gray-400 py-20">جاري التحميل...</p></Shell>
  if (data?.error === 'EXPIRED') {
    return <Notice title="اللينك ده انتهى" text="لينك المواعيد بيشتغل لحد أسبوع بعد ميعاده. مع كل حجز جديد بيوصلك لينك جديد على واتساب." />
  }
  if (isError || !data || data.error) {
    return <Notice title="اللينك ده مش شغال" text="اتأكد إنك فتحت اللينك كامل زي ما وصلك من العيادة، أو كلّمهم على واتساب." />
  }

  const { business, upcoming, past } = data
  const phone = business.public_phone

  function openCancel(a) {
    setTarget(a)
    setTail('')
    setFormError('')
  }

  async function confirmCancel(e) {
    e.preventDefault()
    if (!/^[0-9]{3}$/.test(tail)) {
      setFormError('اكتب آخر 3 أرقام من موبايلك.')
      return
    }
    setBusy(true)
    setFormError('')
    try {
      const { data: result, error } = await supabase.rpc('patient_cancel', { p_code: code, p_appointment_id: target.id, p_phone_tail: tail })
      if (error) throw error
      if (result?.error) {
        setFormError(CANCEL_ERRORS[result.error] || 'حصلت مشكلة، جرّب تاني.')
        return
      }
      qc.setQueryData(['patient-page', code], result)
      setTarget(null)
      setCancelled(true)
    } catch {
      setFormError('حصلت مشكلة، جرّب تاني.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell color={business.brand_color}>
      <header className="flex items-center gap-3">
        {business.logo_url
          ? <img src={business.logo_url} alt="" className="w-12 h-12 rounded-xl object-cover border border-gray-100" />
          : <div className="w-12 h-12 rounded-xl text-white font-bold flex items-center justify-center" style={{ background: 'var(--brand)' }}>{business.name.slice(0, 1)}</div>}
        <div className="min-w-0">
          <p className="text-xs text-gray-500">مواعيدك في</p>
          <h1 className="font-bold text-gray-900 text-lg break-words">{business.name}</h1>
        </div>
      </header>

      <p className="text-gray-700">أهلاً يا {data.client_name}</p>

      {cancelled && (
        <div data-testid="cancelled-note" className="bg-accent-50 border border-accent-200 rounded-2xl p-4 text-sm text-accent-800 space-y-2">
          <p>اتلغى الميعاد، والعيادة وصلها إشعار.</p>
          <a href={`/book/${business.slug}`} className="inline-block font-bold underline">عايز ميعاد تاني؟ احجز من هنا</a>
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-gray-500">المواعيد الجاية</h2>
        {upcoming.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 text-sm text-gray-500">
            مفيش مواعيد جاية. <a href={`/book/${business.slug}`} className="font-bold underline" style={{ color: 'var(--brand)' }}>احجز ميعاد</a>
          </div>
        )}
        {upcoming.map(a => (
          <div key={a.id} data-testid="upcoming" className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold text-gray-900">{a.service || 'ميعاد'}</p>
              <Badge status={a.status} />
            </div>
            <When a={a} />
            {(a.branch || a.address) && (
              <p className="flex items-center gap-1 text-sm text-gray-500"><HiOutlineMapPin className="w-4 h-4" />{[a.branch, a.address].filter(Boolean).join(' — ')}</p>
            )}
            {a.ahead != null && <Ahead count={a.ahead} />}
            {a.can_cancel ? (
              <button onClick={() => openCancel(a)}
                className="w-full mt-1 h-11 rounded-xl border-2 border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50">
                {a.status === 'waitlist' ? 'اخرج من قايمة الانتظار' : 'إلغاء الميعاد'}
              </button>
            ) : (
              <p className="text-xs text-gray-500">
                {business.cancellation_policy ? `سياسة الإلغاء: ${business.cancellation_policy}. ` : ''}لو محتاج تلغي أو تغير الميعاد، كلّم العيادة.
              </p>
            )}
          </div>
        ))}
      </section>

      {past.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-gray-500">مواعيد فاتت</h2>
          {past.map(a => (
            <div key={a.id} data-testid="past" className="bg-white rounded-2xl border border-gray-100 px-4 py-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800">{a.service || 'ميعاد'}</p>
                <When a={a} />
              </div>
              <Badge status={a.status} />
            </div>
          ))}
        </section>
      )}

      {phone && (
        <a href={telHref(phone)} className="flex items-center justify-center gap-2 h-12 rounded-2xl bg-white border border-gray-200 text-sm font-semibold text-gray-700">
          <HiOutlinePhone className="w-4 h-4" /> كلّم العيادة
        </a>
      )}

      <p className="text-center text-[12.5px] text-gray-400 pt-4">
        صفحة المواعيد دي معمولة بـ <a href="/" className="font-semibold underline">بسهولة</a>
      </p>

      <Modal open={!!target} onClose={() => setTarget(null)} title={target?.status === 'waitlist' ? 'الخروج من قايمة الانتظار' : 'إلغاء الميعاد'} size="sm">
        {target && (
          <form onSubmit={confirmCancel} className="space-y-3" dir="rtl">
            <p className="text-sm text-gray-700">
              ميعاد {formatDateArabic(target.date)}{target.status === 'waitlist' ? '' : ` الساعة ${formatTimeArabic(target.time)}`}.
            </p>
            <label className="block text-sm font-medium text-gray-700" htmlFor="phone-tail">للتأكيد، اكتب آخر 3 أرقام من موبايلك</label>
            <input id="phone-tail" value={tail} onChange={e => setTail(e.target.value.replace(/\D/g, '').slice(0, 3))}
              inputMode="numeric" autoComplete="off" dir="ltr" placeholder="•••"
              className="w-full h-12 text-center text-2xl tracking-[0.5em] border-2 border-gray-200 rounded-xl focus:outline-none focus:border-accent-400" />
            {formError && <p data-testid="cancel-error" className="text-sm text-red-600">{formError}</p>}
            <Button type="submit" variant="danger" loading={busy} className="w-full">أيوه، الغيه</Button>
          </form>
        )}
      </Modal>
    </Shell>
  )
}
