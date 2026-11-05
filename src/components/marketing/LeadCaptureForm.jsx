import { useState } from 'react'
import { HiOutlineCheckCircle } from 'react-icons/hi2'
import { submitLead } from '../../hooks/useGrowth'
import { trackEvent } from '../../lib/tracking'

const CATEGORY_OPTIONS = [
  { value: 'dental', label: 'عيادة أسنان' },
  { value: 'derma', label: 'جلدية وتجميل' },
  { value: 'clinic', label: 'عيادة تانية' },
  { value: 'salon', label: 'صالون' },
  { value: 'gym', label: 'جيم' },
  { value: 'education', label: 'تعليم' },
  { value: 'other', label: 'نشاط تاني' },
]

/**
 * "Leave your number and we'll call you". Saves through growth_submit_lead()
 * (migration 032) — the request lands at the top of the admin's call list.
 *
 * `details` lets a host page attach context (the loss calculator passes its
 * numbers). `tone` matches the dark or light section it sits in.
 */
export default function LeadCaptureForm({
  source = 'contact_form',
  details,
  tone = 'dark',
  submitLabel = 'كلّموني',
  doneText = 'وصلنا رقمك — هنكلّمك في أقرب وقت خلال ساعات العمل.',
}) {
  const [form, setForm] = useState({ name: '', phone: '', businessName: '', category: 'dental', website: '' })
  const [state, setState] = useState({ status: 'idle', error: '' })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const dark = tone === 'dark'

  async function onSubmit(e) {
    e.preventDefault()
    // Honeypot: real people never see or fill this field.
    if (form.website) return setState({ status: 'done', error: '' })
    setState({ status: 'sending', error: '' })
    try {
      await submitLead({ name: form.name, phone: form.phone, businessName: form.businessName, category: form.category, source, details })
      trackEvent('generate_lead', { method: source })
      setState({ status: 'done', error: '' })
    } catch (err) {
      setState({ status: 'idle', error: err.message })
    }
  }

  if (state.status === 'done') {
    return (
      <div className={`flex items-center justify-center gap-2 rounded-xl px-4 py-4 text-[15px] font-semibold ${dark ? 'bg-white/10 text-white' : 'bg-accent-50 text-accent-800'}`}>
        <HiOutlineCheckCircle className="w-6 h-6 flex-shrink-0" aria-hidden="true" />
        {doneText}
      </div>
    )
  }

  const field = `w-full rounded-xl px-3.5 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-accent-400 ${
    dark ? 'bg-white/10 border border-white/20 text-white placeholder:text-white/50' : 'bg-white border border-rule text-ink placeholder:text-ink-soft/60'
  }`

  return (
    <form onSubmit={onSubmit} className="grid sm:grid-cols-2 gap-2.5 text-right" noValidate>
      <input className={field} placeholder="اسمك" value={form.name} onChange={set('name')} required autoComplete="name" aria-label="اسمك" />
      <input className={field} placeholder="رقم الموبايل" value={form.phone} onChange={set('phone')} required inputMode="tel" dir="ltr" autoComplete="tel" aria-label="رقم الموبايل" />
      <input className={field} placeholder="اسم العيادة / النشاط (اختياري)" value={form.businessName} onChange={set('businessName')} aria-label="اسم العيادة" />
      <select className={field} value={form.category} onChange={set('category')} aria-label="نوع النشاط">
        {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value} className="text-ink">{o.label}</option>)}
      </select>
      <input type="text" name="website" value={form.website} onChange={set('website')} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <button type="submit" disabled={state.status === 'sending'}
        className="sm:col-span-2 bg-accent-500 hover:bg-accent-600 disabled:opacity-60 text-white text-[15px] font-bold px-6 py-3.5 rounded-xl transition-colors">
        {state.status === 'sending' ? 'بيتبعت…' : submitLabel}
      </button>
      {state.error && <p className={`sm:col-span-2 text-sm ${dark ? 'text-red-300' : 'text-red-600'}`}>{state.error}</p>}
      <p className={`sm:col-span-2 text-[12px] ${dark ? 'text-white/50' : 'text-ink-soft'}`}>
        بنستخدم رقمك عشان نكلّمك بس. <a href="/privacy" className="underline">الخصوصية</a>
      </p>
    </form>
  )
}
