import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { HiOutlineCalendarDays, HiOutlineClock, HiOutlineMapPin, HiOutlinePhone } from 'react-icons/hi2'
import { supabase } from '../../lib/supabase'
import { formatDateArabic, formatTimeArabic } from '../../lib/whatsapp'
import { telHref } from '../../lib/countries'
import ConfirmDialog from '../../components/ui/ConfirmDialog'

// /my/<token>: a patient's own appointments at one clinic (migration 054).
// The token reaches them only in a WhatsApp message the clinic sent to their
// number, so the page needs no login.

const STATUS = {
  confirmed: { label: 'مؤكد', cls: 'bg-emerald-50 text-emerald-700' },
  waitlist: { label: 'في قايمة الانتظار', cls: 'bg-amber-50 text-amber-700' },
  completed: { label: 'حضرت', cls: 'bg-blue-50 text-blue-700' },
  no_show: { label: 'ما حضرتش', cls: 'bg-gray-100 text-gray-600' },
  cancelled: { label: 'اتلغى', cls: 'bg-red-50 text-red-600' },
}

function usePortal(token) {
  return useQuery({
    queryKey: ['patient-portal', token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('patient_portal', { p_token: token })
      if (error) throw error
      return data
    },
    retry: false,
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

export default function MyAppointments() {
  const { token } = useParams()
  const qc = useQueryClient()
  const { data, isLoading, isError } = usePortal(token)
  const [target, setTarget] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  if (isLoading) return <Shell><p className="text-center text-gray-400 py-20">جاري التحميل...</p></Shell>
  if (isError || !data) {
    return (
      <Shell>
        <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center space-y-2 mt-10">
          <p className="font-bold text-gray-900">اللينك ده مش شغال</p>
          <p className="text-sm text-gray-500">اتأكد إنك فتحت اللينك كامل زي ما وصلك من العيادة، أو كلمهم على واتساب.</p>
        </div>
      </Shell>
    )
  }

  const { business, upcoming, past } = data
  const phone = business.public_phone

  async function confirmCancel() {
    const a = target
    setTarget(null)
    setBusy(true)
    setMessage('')
    try {
      const { data: fresh, error } = await supabase.rpc('patient_cancel_appointment', { p_token: token, p_appointment_id: a.id })
      if (error) throw error
      qc.setQueryData(['patient-portal', token], fresh)
      setMessage('cancelled')
    } catch (e) {
      setMessage(String(e?.message || '').includes('CANNOT_CANCEL')
        ? 'مينفعش تلغي الميعاد ده من هنا دلوقتي. كلم العيادة.'
        : 'حصلت مشكلة، جرّب تاني.')
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

      <p className="text-gray-700">أهلاً يا {data.client_name} 👋</p>

      {message === 'cancelled' && (
        <div data-testid="cancelled-note" className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-sm text-emerald-800 space-y-2">
          <p>اتلغى الميعاد، والعيادة وصلها إشعار.</p>
          <a href={`/book/${business.slug}`} className="inline-block font-bold underline">عايز ميعاد تاني؟ احجز من هنا</a>
        </div>
      )}
      {message && message !== 'cancelled' && (
        <p className="bg-red-50 border border-red-200 rounded-2xl p-3 text-sm text-red-700">{message}</p>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-gray-500">المواعيد الجاية</h2>
        {upcoming.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 text-sm text-gray-500">
            مفيش مواعيد جاية. <a href={`/book/${business.slug}`} className="font-bold underline" style={{ color: 'var(--brand)' }}>احجز ميعاد</a>
          </div>
        )}
        {upcoming.map(a => (
          <div key={a.id} data-testid="upcoming" className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold text-gray-900">{a.service || 'ميعاد'}</p>
              <Badge status={a.status} />
            </div>
            <When a={a} />
            {(a.branch || a.address) && (
              <p className="flex items-center gap-1 text-sm text-gray-500"><HiOutlineMapPin className="w-4 h-4" />{[a.branch, a.address].filter(Boolean).join(' — ')}</p>
            )}
            {a.can_cancel ? (
              <button onClick={() => setTarget(a)} disabled={busy}
                className="w-full mt-1 py-2.5 rounded-xl border-2 border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 disabled:opacity-60">
                {a.status === 'waitlist' ? 'اخرج من قايمة الانتظار' : 'إلغاء الميعاد'}
              </button>
            ) : (
              <p className="text-xs text-gray-500">
                {business.cancellation_policy ? `سياسة الإلغاء: ${business.cancellation_policy}. ` : ''}لو محتاج تلغي أو تغير الميعاد، كلم العيادة.
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
        <a href={telHref(phone)} className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-white border border-gray-200 text-sm font-semibold text-gray-700">
          <HiOutlinePhone className="w-4 h-4" /> كلم العيادة
        </a>
      )}

      <p className="text-center text-[12.5px] text-gray-400 pt-4">
        صفحة المواعيد دي معمولة بـ <a href="/" className="font-semibold underline">بسهولة</a>
      </p>

      <ConfirmDialog
        open={!!target}
        onClose={() => setTarget(null)}
        onConfirm={confirmCancel}
        variant="danger"
        loading={busy}
        title={target?.status === 'waitlist' ? 'الخروج من قايمة الانتظار' : 'إلغاء الميعاد'}
        message={target ? `متأكد إنك عايز تلغي ميعاد ${formatDateArabic(target.date)}${target.status === 'waitlist' ? '' : ` الساعة ${formatTimeArabic(target.time)}`}؟` : ''}
        confirmLabel="أيوه، الغيه"
      />
    </Shell>
  )
}
