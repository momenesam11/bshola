import { useState } from 'react'
import toast from 'react-hot-toast'
import { FaWhatsapp } from 'react-icons/fa'
import { PARTNER_KINDS } from '../../../lib/growth/constants'
import { partnerLink, partnerDashboardLink } from '../../../lib/growth/links'
import { partnerShareMessage } from '../../../lib/growth/messages'
import { normalizePhone, whatsappLink } from '../../../lib/growth/phone'
import { partnerCommissions, referralRewards } from '../../../lib/growth/analytics'
import { useSavePartner, useSetCommissionStatus } from '../../../hooks/useGrowth'
import { Btn, Card, EmptyState, Field, StageBadge } from './ui'
import { copyText, formatDate, inputClass } from './format'
import { HiOutlineBanknotes, HiOutlineChartBar, HiOutlineCheck, HiOutlineEye, HiOutlineGift, HiOutlineLink, HiOutlinePlus, HiOutlineUserGroup } from 'react-icons/hi2'

const EMPTY = { name: '', phone: '', kind: 'medical_rep', signup_bonus_egp: '', commission_pct: '', notes: '' }

const COMMISSION_STATUS = {
  pending: { label: 'مستنية مراجعتك', tone: 'bg-amber-50 text-amber-700' },
  approved: { label: 'موافق — لسه مادفعتش', tone: 'bg-ink/5 text-ink' },
  paid: { label: 'اتدفعت', tone: 'bg-accent-100 text-accent-800' },
  rejected: { label: 'مرفوضة', tone: 'bg-gray-100 text-ink-soft' },
}
const KIND_LABEL = { signup_bonus: 'مكافأة تسجيل عيادة حقيقية', subscription: 'نسبة من الاشتراك' }

const egp = (n) => `${Number(n || 0).toLocaleString('en-EG')} ج`

/** Commission partners (reps, suppliers…), their commissions, and customer referrals. */
export default function PartnersPanel({ leads, partners, commissions = [], onOpen }) {
  const [form, setForm] = useState(EMPTY)
  const save = useSavePartner()
  const rows = partnerCommissions(leads, partners, commissions)
  const rewards = referralRewards(leads)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function add(e) {
    e.preventDefault()
    if (!form.name.trim()) return toast.error('الاسم مطلوب')
    try {
      await save.mutateAsync({
        partner: {
          ...form,
          phone: normalizePhone(form.phone) ?? (form.phone || null),
          signup_bonus_egp: Number(form.signup_bonus_egp) || 0,
          commission_pct: Math.min(100, Number(form.commission_pct) || 0),
        },
      })
      setForm(EMPTY)
      toast.success('اتضاف — ابعتله لينكه ولوحته')
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
      <HowItWorks />

      <div className="grid lg:grid-cols-[2fr_1fr] gap-4 items-start">
        <Card icon={HiOutlineUserGroup} title="الشركاء">
          {rows.length === 0 ? (
            <EmptyState icon={HiOutlineUserGroup} title="مفيش شركاء لسه">
              مندوبين الأدوية وموزّعين خامات الأسنان وشركات تجهيز العيادات بيدخلوا عيادات كل يوم. ضيف واحد من الفورم، وابعتله لينكه ولوحته.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-gray-50 -my-2">
              {rows.map((r) => {
                const p = r.partner
                const link = partnerLink(p.ref_code)
                const dashboard = partnerDashboardLink(p.access_token)
                return (
                  <li key={p.id} className={`py-3 ${p.active ? '' : 'opacity-50'}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-ink">{p.name}</b>
                      <span className="text-xs text-ink-soft">{PARTNER_KINDS.find((k) => k.key === p.kind)?.label}</span>
                      <span className="text-xs text-gray-400 font-mono" dir="ltr">{p.ref_code}</span>
                      <span className="text-[12.5px] text-ink-soft">
                        · {egp(p.signup_bonus_egp)} لكل عيادة حقيقية · {Number(p.commission_pct || 0)}% من الاشتراك
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 mt-2 text-center text-xs">
                      <div className="bg-gray-50 rounded-lg py-1.5"><b className="block text-sm">{r.registered}</b>سجّلوا</div>
                      <div className="bg-gray-50 rounded-lg py-1.5"><b className="block text-sm">{r.qualified}</b>حقيقية</div>
                      <div className="bg-gray-50 rounded-lg py-1.5"><b className="block text-sm">{r.paid}</b>اشتركوا</div>
                      <div className="bg-amber-50 rounded-lg py-1.5"><b className="block text-sm">{egp(r.pending + r.approved)}</b>مستحق ليه</div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Btn tone="ghost" className="!py-1 text-xs" onClick={() => copyText(link, 'لينك التسجيل اتنسخ')}><HiOutlineLink className="w-4 h-4" aria-hidden="true" /> لينك التسجيل</Btn>
                      <Btn tone="ghost" className="!py-1 text-xs" onClick={() => copyText(dashboard, 'لينك لوحته اتنسخ')}><HiOutlineChartBar className="w-4 h-4" aria-hidden="true" /> لينك لوحته</Btn>
                      <a href={`/partner/${p.access_token}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-xs font-semibold text-accent-700 hover:underline px-2 gap-1"><HiOutlineEye className="w-4 h-4" aria-hidden="true" /> شوف لوحته</a>
                      {p.phone && (
                        <a href={whatsappLink(p.phone, partnerShareMessage(p, link, dashboard))} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-accent-700 hover:bg-accent-50 px-2 py-1 rounded-lg">
                          <FaWhatsapp /> ابعتله اللينكين
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

        <Card icon={HiOutlinePlus} title="شريك جديد">
          <form onSubmit={add} className="space-y-3">
            <Field label="الاسم *"><input className={inputClass} value={form.name} onChange={set('name')} /></Field>
            <Field label="الموبايل"><input className={inputClass} dir="ltr" value={form.phone} onChange={set('phone')} /></Field>
            <Field label="النوع">
              <select className={inputClass} value={form.kind} onChange={set('kind')}>
                {PARTNER_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
              </select>
            </Field>
            <Field label="مكافأة كل عيادة حقيقية (جنيه)" hint="بتتحسب بعد ما نتأكد إن العيادة حقيقية مش فيك">
              <input className={inputClass} type="number" min="0" value={form.signup_bonus_egp} onChange={set('signup_bonus_egp')} placeholder="مثلاً 100" />
            </Field>
            <Field label="نسبة من أول اشتراك (%)" hint="من سعر الباقة اللي العيادة اشتركت فيها">
              <input className={inputClass} type="number" min="0" max="100" value={form.commission_pct} onChange={set('commission_pct')} placeholder="مثلاً 20" />
            </Field>
            <Field label="ملاحظات"><input className={inputClass} value={form.notes} onChange={set('notes')} /></Field>
            <Btn tone="primary" type="submit" disabled={save.isPending} className="w-full">إضافة</Btn>
          </form>
        </Card>
      </div>

      <CommissionsCard commissions={commissions} partners={partners} leads={leads} onOpen={onOpen} />

      <Card icon={HiOutlineGift} title="ترشيحات العملاء — مين يستحق شهر ببلاش">
        {rewards.length === 0 ? (
          <p className="text-sm text-ink-soft leading-relaxed">
            لما عيادة يرشّحها عميل حالي (من لينك «رشّح زميل» في إعداداته) <b>تدفع اشتراك</b>، هتظهر هنا عشان تدّي اللي رشّحها الشهر المجاني من لوحة الأدمن.
            التسجيل لوحده مش كفاية، ولا حسابات التجربة.
          </p>
        ) : (
          <ul className="space-y-2">
            {rewards.map((r) => (
              <li key={r.businessId} className="text-sm">
                <b>{r.referrerName}</b> رشّح:{' '}
                {r.referred.map((l) => (
                  <button key={l.id} type="button" onClick={() => onOpen(l.id)} className="inline-flex items-center gap-1 ml-2 text-accent-700 hover:underline">
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

function HowItWorks() {
  return (
    <div className="rounded-xl border border-accent-100 bg-accent-50/50 p-4 text-sm text-ink leading-relaxed">
      <p className="font-bold mb-1.5">إزاي الشريك بياخد فلوسه؟</p>
      <ol className="list-decimal pr-5 space-y-1">
        <li>عيادة بتسجّل من لينكه ← بتتحسب عليه لوحدها، <b>بس لسه من غير فلوس</b>.</li>
        <li>
          العيادة بتثبت إنها <b>حقيقية</b>: يا إما يجيلها حجوزات من عدد معيّن من العملاء المختلفين (مش رقم صاحبها، ومش رقم مستخدم في حساب تاني)،
          يا إما إنت تكلّمهم وتأكّد بإيدك ← <b>المكافأة الثابتة بتتحسب</b>.
        </li>
        <li>العيادة بتشترك ← <b>نسبته من سعر الباقة بتتحسب</b>.</li>
        <li>كل مبلغ بيستنى <b>موافقتك</b> تحت، وبعدين «اتدفعت» لما تدفعله. والمندوب بيشوف كل ده في لوحته الخاصة.</li>
      </ol>
    </div>
  )
}

function CommissionsCard({ commissions, partners, leads, onOpen }) {
  const setStatus = useSetCommissionStatus()
  const [filter, setFilter] = useState('open')
  const shown = commissions.filter((c) => (filter === 'open' ? ['pending', 'approved'].includes(c.status) : true))
  const partnerName = (id) => partners.find((p) => p.id === id)?.name ?? '—'
  const lead = (id) => leads.find((l) => l.id === id)

  async function change(c, status) {
    try {
      await setStatus.mutateAsync({ id: c.id, status })
      toast.success(COMMISSION_STATUS[status].label)
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <Card
      icon={HiOutlineBanknotes}
      title="العمولات"
      actions={
        <div className="flex gap-1">
          {[['open', 'محتاجة قرار'], ['all', 'الكل']].map(([k, label]) => (
            <button key={k} type="button" onClick={() => setFilter(k)}
              className={`text-[12.5px] px-2 py-1 rounded-md font-semibold ${filter === k ? 'bg-ink text-white' : 'bg-gray-100 text-ink-soft'}`}>
              {label}
            </button>
          ))}
        </div>
      }
    >
      {shown.length === 0 ? (
        <p className="text-sm text-ink-soft">{filter === 'open' ? 'مفيش عمولات مستنية قرار.' : 'مفيش عمولات لسه.'}</p>
      ) : (
        <div className="overflow-x-auto -mx-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[12.5px] text-gray-400 border-b border-rule">
                <th className="text-right font-medium px-4 py-2">الشريك</th>
                <th className="text-right font-medium px-2 py-2">العيادة</th>
                <th className="text-right font-medium px-2 py-2">النوع</th>
                <th className="text-right font-medium px-2 py-2">المبلغ</th>
                <th className="text-right font-medium px-2 py-2">الحالة</th>
                <th className="text-right font-medium px-2 py-2"> </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2.5 font-semibold">{partnerName(c.partner_id)}</td>
                  <td className="px-2 py-2.5">
                    <button type="button" className="text-accent-700 hover:underline" onClick={() => onOpen(c.lead_id)}>{lead(c.lead_id)?.name ?? '—'}</button>
                    <div className="text-[12.5px] text-gray-400">{formatDate(c.created_at)}</div>
                  </td>
                  <td className="px-2 py-2.5 text-xs text-ink-soft">{KIND_LABEL[c.kind]}<div className="text-[12.5px] text-gray-400">{c.basis}</div></td>
                  <td className="px-2 py-2.5 font-bold tabular-nums whitespace-nowrap">{egp(c.amount_egp)}</td>
                  <td className="px-2 py-2.5"><span className={`text-[12.5px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${COMMISSION_STATUS[c.status].tone}`}>{COMMISSION_STATUS[c.status].label}</span></td>
                  <td className="px-2 py-2.5 whitespace-nowrap">
                    {c.status === 'pending' && (
                      <>
                        <Btn tone="ghost" className="!py-1 text-xs text-accent-700" onClick={() => change(c, 'approved')}>موافق</Btn>
                        <Btn tone="ghost" className="!py-1 text-xs text-red-600" onClick={() => change(c, 'rejected')}>رفض</Btn>
                      </>
                    )}
                    {c.status === 'approved' && <Btn tone="ghost" className="!py-1 text-xs text-accent-700" onClick={() => change(c, 'paid')}><HiOutlineCheck className="w-4 h-4" aria-hidden="true" /> دفعتله</Btn>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
