import { useState } from 'react'
import toast from 'react-hot-toast'
import { FaWhatsapp } from 'react-icons/fa'
import { PARTNER_KINDS } from '../../../lib/growth/constants'
import { partnerLink } from '../../../lib/growth/links'
import { partnerShareMessage } from '../../../lib/growth/messages'
import { normalizePhone, whatsappLink } from '../../../lib/growth/phone'
import { partnerCommissions, referralRewards } from '../../../lib/growth/analytics'
import { useSavePartner } from '../../../hooks/useGrowth'
import { Btn, Card, EmptyState, Field, StageBadge } from './ui'
import { copyText, inputClass } from './format'

const EMPTY = { name: '', phone: '', kind: 'medical_rep', commission_egp: '', notes: '' }

/** Commission partners (reps, suppliers…) and customer referrals. */
export default function PartnersPanel({ leads, partners, onOpen }) {
  const [form, setForm] = useState(EMPTY)
  const save = useSavePartner()
  const rows = partnerCommissions(leads, partners)
  const rewards = referralRewards(leads)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function add(e) {
    e.preventDefault()
    if (!form.name.trim()) return toast.error('الاسم مطلوب')
    try {
      await save.mutateAsync({
        partner: { ...form, phone: normalizePhone(form.phone) ?? (form.phone || null), commission_egp: Number(form.commission_egp) || 0 },
      })
      setForm(EMPTY)
      toast.success('اتضاف — ابعتله لينكه')
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function toggleActive(p) {
    try {
      await save.mutateAsync({ id: p.id, partner: { active: !p.active } })
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-[2fr_1fr] gap-4 items-start">
        <Card title="🤝 الشركاء">
          {rows.length === 0 ? (
            <EmptyState icon="🤝" title="مفيش شركاء لسه">
              مندوبين الأدوية وموزّعين خامات الأسنان وشركات تجهيز العيادات بيدخلوا عيادات كل يوم. ضيف واحد، ابعتله لينكه، وأي عيادة تسجّل منه بتتحسب ليه لوحدها.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-gray-50 -my-2">
              {rows.map(({ partner: p, leads: count, trial, paid, owed }) => {
                const link = partnerLink(p.ref_code)
                return (
                  <li key={p.id} className={`py-3 ${p.active ? '' : 'opacity-50'}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-gray-900">{p.name}</b>
                      <span className="text-xs text-gray-500">{PARTNER_KINDS.find((k) => k.key === p.kind)?.label}</span>
                      <span className="text-xs text-gray-400 font-mono" dir="ltr">{p.ref_code}</span>
                      <span className="mr-auto text-xs text-gray-600">
                        {count} عميل · {trial} تجربة · <b className="text-green-700">{paid} دفع</b>
                        {owed > 0 && <> · عمولة مستحقة <b className="text-green-700">{owed.toLocaleString('ar-EG')} ج</b></>}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Btn tone="ghost" className="!py-1 text-xs" onClick={() => copyText(link)}>نسخ اللينك</Btn>
                      {p.phone && (
                        <a href={whatsappLink(p.phone, partnerShareMessage(p, link))} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 hover:bg-green-50 px-2 py-1 rounded-lg">
                          <FaWhatsapp /> ابعتله لينكه
                        </a>
                      )}
                      <Btn tone="ghost" className="!py-1 text-xs" onClick={() => toggleActive(p)}>{p.active ? 'إيقاف' : 'تفعيل'}</Btn>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card title="➕ شريك جديد">
          <form onSubmit={add} className="space-y-3">
            <Field label="الاسم *"><input className={inputClass} value={form.name} onChange={set('name')} /></Field>
            <Field label="الموبايل"><input className={inputClass} dir="ltr" value={form.phone} onChange={set('phone')} /></Field>
            <Field label="النوع">
              <select className={inputClass} value={form.kind} onChange={set('kind')}>
                {PARTNER_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
              </select>
            </Field>
            <Field label="العمولة لكل عيادة تدفع (جنيه)"><input className={inputClass} type="number" min="0" value={form.commission_egp} onChange={set('commission_egp')} /></Field>
            <Field label="ملاحظات"><input className={inputClass} value={form.notes} onChange={set('notes')} /></Field>
            <Btn tone="primary" type="submit" disabled={save.isPending} className="w-full">إضافة</Btn>
          </form>
        </Card>
      </div>

      <Card title="🎁 ترشيحات العملاء — مين يستحق شهر ببلاش">
        {rewards.length === 0 ? (
          <p className="text-sm text-gray-500">لما عيادة يرشّحها عميل حالي (من لينك الترشيح في إعداداته) تدفع، هتظهر هنا عشان تدّي اللي رشّحها الشهر المجاني من لوحة الأدمن.</p>
        ) : (
          <ul className="space-y-2">
            {rewards.map((r) => (
              <li key={r.businessId} className="text-sm">
                <b>{r.referrerName}</b> رشّح:{' '}
                {r.referred.map((l) => (
                  <button key={l.id} type="button" onClick={() => onOpen(l.id)} className="inline-flex items-center gap-1 ml-2 text-blue-600 hover:underline">
                    {l.name} <StageBadge stage={l.stage} />
                  </button>
                ))}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
