import { useState } from 'react'
import toast from 'react-hot-toast'
import { CATEGORIES, MANUAL_SOURCES, SOURCE_BY_KEY } from '../../../lib/growth/constants'
import { normalizePhone } from '../../../lib/growth/phone'
import { findDuplicate } from '../../../lib/growth/dedupe'
import { useSaveLead } from '../../../hooks/useGrowth'
import { Btn, Field } from './ui'
import { inputClass } from './format'

const EMPTY = {
  name: '', category: 'dental', specialty: '', contact_person: '', phone: '', email: '',
  city: 'القاهرة', area: '', address: '', website: '', instagram: '', facebook: '',
  google_maps_url: '', google_rating: '', google_reviews_count: '', has_online_booking: '',
  source: 'google_maps_manual', partner_id: '', notes: '',
}

/** Add a lead by hand, or edit one. */
export default function LeadForm({ lead, leads, partners, onSaved, onCancel }) {
  const [form, setForm] = useState(() => {
    if (!lead) return EMPTY
    const f = { ...EMPTY }
    for (const k of Object.keys(EMPTY)) f[k] = lead[k] ?? ''
    f.has_online_booking = lead.has_online_booking === null || lead.has_online_booking === undefined ? '' : String(lead.has_online_booking)
    return f
  })
  const save = useSaveLead()
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const duplicate = form.name || form.phone
    ? findDuplicate(form, leads.filter((l) => l.id !== lead?.id))
    : null

  async function submit(e) {
    e.preventDefault()
    if (!form.name.trim()) return toast.error('الاسم مطلوب')
    const phone = form.phone ? normalizePhone(form.phone) : null
    if (form.phone && !phone) return toast.error('رقم التليفون مش صحيح')
    const payload = {
      ...form,
      name: form.name.trim(),
      phone,
      phone_raw: form.phone || null,
      google_rating: form.google_rating === '' ? null : Number(form.google_rating),
      google_reviews_count: form.google_reviews_count === '' ? null : parseInt(form.google_reviews_count, 10),
      has_online_booking: form.has_online_booking === '' ? null : form.has_online_booking === 'true',
      partner_id: form.partner_id || null,
    }
    // Source is only chosen when adding; an existing lead keeps where it came from.
    if (lead) delete payload.source
    try {
      const saved = await save.mutateAsync({ id: lead?.id, lead: payload })
      toast.success(lead ? 'اتحفظ' : 'اتضاف للقايمة')
      onSaved?.(saved)
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {duplicate && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-3 py-2">
          ⚠️ شكله موجود قبل كده: <b>{duplicate.name}</b>
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="اسم العيادة / المكان *">
          <input className={inputClass} value={form.name} onChange={set('name')} placeholder="عيادة د. سارة للأسنان" />
        </Field>
        <Field label="النوع">
          <select className={inputClass} value={form.category} onChange={set('category')}>
            {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="رقم التليفون" hint="موبايل أحسن — عليه واتساب">
          <input className={inputClass} dir="ltr" value={form.phone} onChange={set('phone')} placeholder="01012345678" />
        </Field>
        <Field label="اسم الدكتور / المسؤول">
          <input className={inputClass} value={form.contact_person} onChange={set('contact_person')} placeholder="د. سارة" />
        </Field>
        <Field label="التخصص">
          <input className={inputClass} value={form.specialty} onChange={set('specialty')} placeholder="تقويم وزراعة" />
        </Field>
        <Field label="المدينة">
          <input className={inputClass} value={form.city} onChange={set('city')} />
        </Field>
        <Field label="المنطقة">
          <input className={inputClass} value={form.area} onChange={set('area')} placeholder="مدينة نصر" />
        </Field>
        <Field label="لينك خرائط جوجل">
          <input className={inputClass} dir="ltr" value={form.google_maps_url} onChange={set('google_maps_url')} />
        </Field>
        <Field label="عدد التقييمات على جوجل">
          <input className={inputClass} type="number" min="0" value={form.google_reviews_count} onChange={set('google_reviews_count')} />
        </Field>
        <Field label="التقييم">
          <input className={inputClass} type="number" min="0" max="5" step="0.1" value={form.google_rating} onChange={set('google_rating')} />
        </Field>
        <Field label="عندهم حجز أونلاين؟">
          <select className={inputClass} value={form.has_online_booking} onChange={set('has_online_booking')}>
            <option value="">مش عارف</option>
            <option value="false">لأ — تليفون / واتساب</option>
            <option value="true">أيوه</option>
          </select>
        </Field>
        <Field label="إنستجرام">
          <input className={inputClass} dir="ltr" value={form.instagram} onChange={set('instagram')} />
        </Field>
        <Field label="فيسبوك">
          <input className={inputClass} dir="ltr" value={form.facebook} onChange={set('facebook')} />
        </Field>
        <Field label="الموقع الإلكتروني">
          <input className={inputClass} dir="ltr" value={form.website} onChange={set('website')} />
        </Field>
        <Field label="الإيميل">
          <input className={inputClass} dir="ltr" type="email" value={form.email} onChange={set('email')} />
        </Field>
        {!lead && (
          <Field label="جبته منين؟">
            <select className={inputClass} value={form.source} onChange={set('source')}>
              {MANUAL_SOURCES.map((s) => <option key={s} value={s}>{SOURCE_BY_KEY[s].label}</option>)}
            </select>
          </Field>
        )}
        {partners.length > 0 && (
          <Field label="عن طريق شريك؟">
            <select className={inputClass} value={form.partner_id} onChange={set('partner_id')}>
              <option value="">لأ</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        )}
      </div>
      <Field label="ملاحظات">
        <textarea className={`${inputClass} min-h-[70px]`} value={form.notes} onChange={set('notes')} />
      </Field>
      <div className="flex gap-2 justify-end">
        {onCancel && <Btn onClick={onCancel}>إلغاء</Btn>}
        <Btn tone="primary" type="submit" disabled={save.isPending}>{save.isPending ? 'بيتحفظ…' : 'حفظ'}</Btn>
      </div>
    </form>
  )
}
