import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { FaWhatsapp } from 'react-icons/fa'
import { PARTNER_DEFAULTS, PARTNER_KINDS, PAYOUT_METHODS, REFERRAL_REWARD } from '../../../lib/growth/constants'
import { partnerDashboardLink, partnerLink, partnerLoginLink } from '../../../lib/growth/links'
import { partnerShareMessage } from '../../../lib/growth/messages'
import { normalizePhone, whatsappLink } from '../../../lib/growth/phone'
import { partnerCommissions, partnerEarnings } from '../../../lib/growth/analytics'
import { useDecideReward, usePartnerPin, usePayPartner, useRotatePartnerToken, useSavePartner, useSetCommissionStatus } from '../../../hooks/useGrowth'
import { Btn, Card, EmptyState, Field, StageBadge } from './ui'
import { copyText, formatDate, inputClass } from './format'
import { HiOutlineArrowPath, HiOutlineBanknotes, HiOutlineBookOpen, HiOutlineChartBar, HiOutlineCheck, HiOutlineChevronDown, HiOutlineEye, HiOutlineGift, HiOutlineKey, HiOutlineLink, HiOutlinePencilSquare, HiOutlinePlus, HiOutlineUserGroup } from 'react-icons/hi2'

const EMPTY = { name: '', phone: '', kind: 'medical_rep', signup_bonus_egp: String(PARTNER_DEFAULTS.signup_bonus_egp), commission_pct: String(PARTNER_DEFAULTS.commission_pct), payout_method: '', payout_account: '', notes: '' }

const COMMISSION_STATUS = {
  pending: { label: 'مستنية مراجعتك', tone: 'bg-amber-50 text-amber-700' },
  approved: { label: 'موافق، لسه مادفعتش', tone: 'bg-ink/5 text-ink' },
  paid: { label: 'اتدفعت', tone: 'bg-accent-100 text-accent-800' },
  rejected: { label: 'مرفوضة', tone: 'bg-gray-100 text-ink-soft' },
}
const KIND_LABEL = { signup_bonus: 'مكافأة عيادة حقيقية', subscription: 'نسبة الاشتراك' }
const egp = (n) => `${Number(n || 0).toLocaleString('en-EG')} ج`

const SECTIONS = [
  { key: 'partners', label: 'الشركاء', icon: HiOutlineUserGroup },
  { key: 'money', label: 'الفلوس', icon: HiOutlineBanknotes },
  { key: 'referrals', label: 'ترشيحات العملاء', icon: HiOutlineGift },
  { key: 'how', label: 'إزاي بيشتغل', icon: HiOutlineBookOpen },
]

/** Everyone who brings clinics for a reward: partners for money, customers for a free month. */
export default function PartnersPanel({ leads, partners, commissions = [], rewards = [], settings, onOpen }) {
  const [section, setSection] = useState('partners')
  const rows = useMemo(() => partnerCommissions(leads, partners, commissions), [leads, partners, commissions])
  const sum = (key) => rows.reduce((s, r) => s + r[key], 0)
  const pendingRewards = rewards.filter((r) => r.status === 'pending').length
  const pendingMoney = commissions.filter((c) => c.status === 'pending').length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="شركاء شغالين" value={partners.filter((p) => p.active).length} />
        <Kpi label="عيادات سجّلت عن طريقهم" value={sum('registered')} />
        <Kpi label="مستنية مراجعتك" value={egp(sum('pending'))} tone={sum('pending') ? 'text-amber-700' : ''} />
        <Kpi label="لازم تدفعها" value={egp(sum('approved'))} tone={sum('approved') ? 'text-ink' : ''} />
        <Kpi label="دفعتها لحد دلوقتي" value={egp(sum('paidOut'))} tone="text-accent-700" />
      </div>

      <div role="tablist" aria-label="أقسام الشركاء" className="flex gap-1.5 overflow-x-auto pb-1">
        {SECTIONS.map((s) => {
          const badge = s.key === 'money' ? pendingMoney : s.key === 'referrals' ? pendingRewards : 0
          return (
            <button key={s.key} type="button" role="tab" aria-selected={section === s.key} onClick={() => setSection(s.key)}
              className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${section === s.key ? 'bg-ink text-white' : 'bg-white border border-rule text-ink-soft hover:text-ink'}`}>
              <s.icon className="w-4 h-4" aria-hidden="true" /> {s.label}
              {badge > 0 && <span className="bg-amber-100 text-amber-800 rounded-full px-1.5 text-xs tabular-nums">{badge}</span>}
            </button>
          )
        })}
      </div>

      {section === 'partners' && <PartnersSection rows={rows} leads={leads} onOpen={onOpen} />}
      {section === 'money' && <MoneySection rows={rows} commissions={commissions} partners={partners} leads={leads} onOpen={onOpen} />}
      {section === 'referrals' && <ReferralsSection rewards={rewards} leads={leads} onOpen={onOpen} />}
      {section === 'how' && <HowItWorks settings={settings} />}
    </div>
  )
}

const Kpi = ({ label, value, tone = '' }) => (
  <div className="bg-white rounded-xl border border-rule shadow-sm p-3">
    <p className="text-xs text-ink-soft">{label}</p>
    <p className={`text-xl font-bold mt-1 tabular-nums text-ink ${tone}`}>{value}</p>
  </div>
)

// ── Partners ────────────────────────────────────────────────────────────────

function PartnersSection({ rows, leads, onOpen }) {
  const [adding, setAdding] = useState(false)
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Btn tone="primary" onClick={() => setAdding((v) => !v)}><HiOutlinePlus className="w-4 h-4" aria-hidden="true" /> شريك جديد</Btn>
      </div>
      {adding && <PartnerForm onDone={() => setAdding(false)} />}
      {rows.length === 0 ? (
        !adding && (
          <Card>
            <EmptyState icon={HiOutlineUserGroup} title="مفيش شركاء لسه">
              مندوبين الأدوية وموزّعين خامات الأسنان وشركات تجهيز العيادات بيدخلوا عيادات كل يوم. ضيف واحد، وابعتله لينكه وكود الدخول.
            </EmptyState>
          </Card>
        )
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => <PartnerCard key={r.partner.id} row={r} leads={leads} onOpen={onOpen} />)}
        </ul>
      )}
    </div>
  )
}

function PartnerForm({ partner, onDone }) {
  const [form, setForm] = useState(() => (partner
    ? { ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, partner[k] == null ? '' : String(partner[k])])) }
    : EMPTY))
  const save = useSavePartner()
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const bonus = Number(form.signup_bonus_egp) || 0
  const pct = Math.min(100, Number(form.commission_pct) || 0)

  async function submit(e) {
    e.preventDefault()
    if (!form.name.trim()) return toast.error('الاسم مطلوب')
    const phone = form.phone ? normalizePhone(form.phone) : null
    if (form.phone && !phone) return toast.error('رقم الموبايل مش صحيح')
    if (!bonus && !pct) return toast.error('حط مكافأة أو نسبة، وإلا الشريك مش هياخد حاجة')
    try {
      await save.mutateAsync({ id: partner?.id, partner: { ...form, phone, signup_bonus_egp: bonus, commission_pct: pct, payout_method: form.payout_method || null } })
      toast.success(partner ? 'اتحفظ' : 'اتضاف. ابعتله لينكه وكود الدخول')
      onDone?.()
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <Card icon={partner ? HiOutlinePencilSquare : HiOutlinePlus} title={partner ? `تعديل ${partner.name}` : 'شريك جديد'}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="الاسم *"><input className={inputClass} value={form.name} onChange={set('name')} /></Field>
          <Field label="الموبايل" hint="بيدخل بيه على لوحته"><input className={inputClass} dir="ltr" inputMode="tel" value={form.phone} onChange={set('phone')} placeholder="01012345678" /></Field>
          <Field label="النوع">
            <select className={inputClass} value={form.kind} onChange={set('kind')}>
              {PARTNER_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
          </Field>
          <Field label="مكافأة كل عيادة حقيقية (جنيه)" hint={`المقترح ${PARTNER_DEFAULTS.signup_bonus_egp} ج`}>
            <input className={inputClass} type="number" min="0" value={form.signup_bonus_egp} onChange={set('signup_bonus_egp')} />
          </Field>
          <Field label="نسبة من أول اشتراك (%)" hint={`المقترح ${PARTNER_DEFAULTS.commission_pct}%`}>
            <input className={inputClass} type="number" min="0" max="100" value={form.commission_pct} onChange={set('commission_pct')} />
          </Field>
          <Field label="بتدفعله إزاي؟">
            <select className={inputClass} value={form.payout_method} onChange={set('payout_method')}>
              <option value="">مش محدد</option>
              {PAYOUT_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </Field>
          <Field label="رقم المحفظة / الحساب"><input className={inputClass} dir="ltr" value={form.payout_account} onChange={set('payout_account')} /></Field>
          <Field label="ملاحظات"><input className={inputClass} value={form.notes} onChange={set('notes')} /></Field>
        </div>
        <EarningsTable terms={{ signup_bonus_egp: bonus, commission_pct: pct }} />
        <div className="flex gap-2 justify-end">
          {onDone && <Btn onClick={onDone}>إلغاء</Btn>}
          <Btn tone="primary" type="submit" disabled={save.isPending}>{partner ? 'حفظ' : 'إضافة'}</Btn>
        </div>
      </form>
    </Card>
  )
}

function EarningsTable({ terms, prices }) {
  return (
    <div className="rounded-lg bg-paper border border-rule p-3">
      <p className="text-xs font-bold text-ink mb-2">كل عيادة بتشترك هتكلّفك:</p>
      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        {partnerEarnings(terms, prices).map((e) => (
          <div key={e.months}>
            <b className="block tabular-nums text-ink">{egp(e.total)}</b>
            <span className="text-xs text-ink-soft">باقة {e.months === 1 ? 'شهر' : `${e.months} شهور`} ({e.price} ج)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PartnerCard({ row, leads, onOpen }) {
  const p = row.partner
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [pin, setPin] = useState(null)
  const save = useSavePartner()
  const makePin = usePartnerPin()
  const rotate = useRotatePartnerToken()
  const link = partnerLink(p.ref_code)
  const dashboard = partnerDashboardLink(p.access_token)
  const clinics = leads.filter((l) => l.partner_id === p.id && !l.is_test)

  async function newPin() {
    try {
      const res = await makePin.mutateAsync(p.id)
      setPin(res.pin)
    } catch (e) {
      toast.error(e.message)
    }
  }

  async function newLink() {
    try {
      await rotate.mutateAsync(p.id)
      toast.success('اللوحة ليها لينك جديد، والقديم وقف. ابعتله الجديد')
    } catch (e) {
      toast.error(e.message)
    }
  }

  async function toggleActive() {
    try {
      await save.mutateAsync({ id: p.id, partner: { active: !p.active } })
    } catch (e) {
      toast.error(e.message)
    }
  }

  if (editing) return <li><PartnerForm partner={p} onDone={() => setEditing(false)} /></li>

  const message = partnerShareMessage(p, link, dashboard, pin ? { url: partnerLoginLink(), pin } : null)

  return (
    <li className={`bg-white rounded-xl border border-rule shadow-sm p-4 ${p.active ? '' : 'opacity-60'}`}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <b className="text-ink">{p.name}</b>
        <span className="text-xs text-ink-soft">{PARTNER_KINDS.find((k) => k.key === p.kind)?.label}</span>
        {!p.active && <span className="text-xs font-bold text-amber-700">موقوف</span>}
        <span className="text-xs text-ink-soft sm:mr-auto tabular-nums">{egp(p.signup_bonus_egp)} لكل عيادة حقيقية + {Number(p.commission_pct || 0)}% من أول اشتراك</span>
      </div>

      {/* The partner's own funnel, in the same words their dashboard uses. */}
      <div className="grid grid-cols-4 gap-2 mt-3 text-center text-xs">
        <Step n={row.registered} label="سجّلوا" />
        <Step n={row.qualified} label="حقيقية" />
        <Step n={row.paid} label="اشتركوا" />
        <div className="bg-amber-50 rounded-lg py-1.5"><b className="block text-sm tabular-nums">{egp(row.pending + row.approved)}</b>مستحق ليه</div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-3">
        {p.phone ? (
          <a href={whatsappLink(p.phone, message)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-500 text-white text-xs font-bold hover:bg-accent-600">
            <FaWhatsapp className="w-4 h-4" /> ابعتله لينكاته{pin ? ' والكود' : ''}
          </a>
        ) : <span className="text-xs text-amber-700">ضيف موبايله عشان يقدر يدخل على لوحته بالكود</span>}
        <Btn tone="ghost" className="!py-1 text-xs" onClick={() => copyText(link, 'لينك التسجيل اتنسخ')}><HiOutlineLink className="w-4 h-4" aria-hidden="true" /> لينك التسجيل</Btn>
        <a href={`/partner/${p.access_token}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-xs font-semibold text-accent-700 hover:underline px-2 gap-1"><HiOutlineEye className="w-4 h-4" aria-hidden="true" /> شوف لوحته</a>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex items-center gap-1 text-xs font-semibold text-ink-soft hover:text-ink px-2 py-1 mr-auto">
          <HiOutlineChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" /> التفاصيل
        </button>
      </div>

      {pin && (
        <div className="mt-3 rounded-lg border border-accent-300 bg-accent-50 p-3 text-sm">
          <p className="font-bold text-ink">كود دخول {p.name}: <span dir="ltr" className="font-mono text-lg tracking-widest">{pin}</span></p>
          <p className="text-xs text-ink-soft mt-0.5">ابعتهوله دلوقتي من زرار الواتساب فوق. الكود مش هيظهر تاني، ولو نسيه اعمله كود جديد. بيدخل من {partnerLoginLink()}</p>
        </div>
      )}

      {open && (
        <div className="mt-3 pt-3 border-t border-rule/60 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <Btn tone="ghost" className="!py-1 text-xs" onClick={newPin} disabled={makePin.isPending || !p.phone}><HiOutlineKey className="w-4 h-4" aria-hidden="true" /> {p.pin_set_at ? 'كود دخول جديد' : 'اعمل كود دخول'}</Btn>
            <Btn tone="ghost" className="!py-1 text-xs" onClick={() => copyText(dashboard, 'لينك لوحته اتنسخ')}><HiOutlineChartBar className="w-4 h-4" aria-hidden="true" /> انسخ لينك لوحته</Btn>
            <Btn tone="ghost" className="!py-1 text-xs" onClick={newLink} disabled={rotate.isPending}><HiOutlineArrowPath className="w-4 h-4" aria-hidden="true" /> اللينك اتسرّب؟ اعمل جديد</Btn>
            <Btn tone="ghost" className="!py-1 text-xs" onClick={() => setEditing(true)}><HiOutlinePencilSquare className="w-4 h-4" aria-hidden="true" /> تعديل</Btn>
            <Btn tone="ghost" className="!py-1 text-xs" onClick={toggleActive}>{p.active ? 'إيقاف' : 'تفعيل'}</Btn>
          </div>
          <p className="text-xs text-ink-soft">
            الكود: <span dir="ltr" className="font-mono">{p.ref_code}</span>
            {p.payout_method && <> · الدفع: {PAYOUT_METHODS.find((m) => m.key === p.payout_method)?.label} <span dir="ltr">{p.payout_account}</span></>}
            {p.notes && <> · {p.notes}</>}
          </p>
          {clinics.length === 0 ? (
            <p className="text-sm text-ink-soft">لسه مفيش عيادات من لينكه.</p>
          ) : (
            <ul className="divide-y divide-rule/60">
              {clinics.map((l) => (
                <li key={l.id} className="py-1.5 flex items-center justify-between gap-2 text-sm">
                  <button type="button" onClick={() => onOpen(l.id)} className="font-semibold text-ink hover:underline text-right">{l.name}</button>
                  <span className="flex items-center gap-2">
                    {l.qualified_at && l.stage !== 'paid' && <span className="text-xs text-accent-700">حقيقية</span>}
                    <StageBadge stage={l.stage} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}

const Step = ({ n, label }) => (
  <div className="bg-paper rounded-lg py-1.5"><b className="block text-sm tabular-nums">{n}</b>{label}</div>
)

// ── Money ───────────────────────────────────────────────────────────────────

function MoneySection({ rows, commissions, partners, leads, onOpen }) {
  const setStatus = useSetCommissionStatus()
  const payPartner = usePayPartner()
  const [filter, setFilter] = useState('open')
  const shown = commissions.filter((c) => (filter === 'open' ? c.status === 'pending' : true))
  const toPay = rows.filter((r) => r.approved > 0)
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

  async function pay(r) {
    const method = PAYOUT_METHODS.find((m) => m.key === r.partner.payout_method)?.label
    try {
      const res = await payPartner.mutateAsync({ id: r.partner.id, note: method ? `اتدفع ${method}` : null })
      toast.success(`اتسجّل: دفعت ${egp(res.total)} لـ ${r.partner.name}`)
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <div className="space-y-4">
      <Card icon={HiOutlineBanknotes} title="لازم تدفع لمين دلوقتي">
        {toPay.length === 0 ? (
          <p className="text-sm text-ink-soft">مفيش فلوس جاهزة للدفع. المبالغ بتيجي هنا بعد ما توافق عليها تحت.</p>
        ) : (
          <ul className="divide-y divide-rule/60 -my-2">
            {toPay.map((r) => (
              <li key={r.partner.id} className="py-3 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[10rem]">
                  <p className="font-bold text-ink">{r.partner.name}</p>
                  <p className="text-xs text-ink-soft">
                    {PAYOUT_METHODS.find((m) => m.key === r.partner.payout_method)?.label ?? 'طريقة الدفع مش محددة'}
                    {r.partner.payout_account && <> · <span dir="ltr" className="font-mono">{r.partner.payout_account}</span></>}
                  </p>
                </div>
                <b className="text-lg tabular-nums">{egp(r.approved)}</b>
                <Btn tone="primary" disabled={payPartner.isPending} onClick={() => pay(r)}><HiOutlineCheck className="w-4 h-4" aria-hidden="true" /> دفعتله</Btn>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        icon={HiOutlineCheck}
        title="المبالغ"
        actions={
          <div className="flex gap-1">
            {[['open', 'محتاجة قرار'], ['all', 'الكل']].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setFilter(k)} className={`text-xs px-2 py-1 rounded-md font-semibold ${filter === k ? 'bg-ink text-white' : 'bg-gray-100 text-ink-soft'}`}>{label}</button>
            ))}
          </div>
        }
      >
        {shown.length === 0 ? (
          <p className="text-sm text-ink-soft">{filter === 'open' ? 'مفيش مبالغ مستنية قرارك.' : 'مفيش عمولات لسه.'}</p>
        ) : (
          <ul className="divide-y divide-rule/60 -my-2">
                {shown.map((c) => (
                  <li key={c.id} className="py-3 flex flex-wrap items-start gap-x-4 gap-y-2">
                    <div className="flex-1 min-w-[14rem]">
                      <p className="text-sm">
                        <b>{partnerName(c.partner_id)}</b> ·{' '}
                        <button type="button" className="text-accent-700 hover:underline" onClick={() => onOpen(c.lead_id)}>{lead(c.lead_id)?.name ?? '—'}</button>
                      </p>
                      <p className="text-xs text-ink-soft mt-0.5 leading-relaxed">{KIND_LABEL[c.kind]}: {c.basis} · {formatDate(c.created_at)}</p>
                    </div>
                    <div className="text-left">
                      <b className="block tabular-nums whitespace-nowrap">{egp(c.amount_egp)}</b>
                      <span className={`inline-block mt-0.5 text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${COMMISSION_STATUS[c.status].tone}`}>{COMMISSION_STATUS[c.status].label}</span>
                    </div>
                    <div className="whitespace-nowrap">
                      {c.status === 'pending' && (
                        <>
                          <Btn tone="ghost" className="!py-1 text-xs text-accent-700" onClick={() => change(c, 'approved')}>موافق</Btn>
                          <Btn tone="ghost" className="!py-1 text-xs text-red-600" onClick={() => change(c, 'rejected')}>رفض</Btn>
                        </>
                      )}
                      {c.status === 'approved' && <Btn tone="ghost" className="!py-1 text-xs" onClick={() => change(c, 'pending')}>رجّعها</Btn>}
                      {c.status === 'rejected' && <Btn tone="ghost" className="!py-1 text-xs" onClick={() => change(c, 'pending')}>راجعها تاني</Btn>}
                      {c.status === 'paid' && <Btn tone="ghost" className="!py-1 text-xs" onClick={() => change(c, 'approved')}>ماتدفعتش</Btn>}
                    </div>
                  </li>
                ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

// ── Customer referrals ──────────────────────────────────────────────────────

function ReferralsSection({ rewards, leads, onOpen }) {
  const decide = useDecideReward()
  const referred = useMemo(() => leads.filter((l) => l.referrer_business_id && !l.is_test), [leads])
  const nameOf = (bizId) => leads.find((l) => l.business_id === bizId)?.name ?? 'عميل'
  const pending = rewards.filter((r) => r.status === 'pending')
  const done = rewards.filter((r) => r.status !== 'pending')

  async function run(r, status) {
    try {
      await decide.mutateAsync({ id: r.id, status })
      toast.success(status === 'granted' ? `اتضاف ${r.days} يوم لاشتراك ${nameOf(r.referrer_business_id)}` : 'اترفضت')
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-accent-100 bg-accent-50/50 p-4 text-sm text-ink leading-relaxed">
        كل عميل عنده لينك «رشّح زميل» في <b>الإعدادات</b>. لما الزميل يسجّل من اللينك و<b>يدفع</b>، العميل يستحق <b>{REFERRAL_REWARD}</b>، وبيظهر هنا تدوس زرار واحد فيتضاف لاشتراكه. التسجيل لوحده مش كفاية،
        وحساب تاني بنفس رقم العميل مابيتحسبش. والعميل بيشوف عدّاد ترشيحاته في إعداداته.
      </div>

      <Card icon={HiOutlineGift} title={`مستحقين الشهر المجاني (${pending.length})`}>
        {pending.length === 0 ? (
          <p className="text-sm text-ink-soft">مفيش حد مستني. لما زميل مرشَّح يدفع هيظهر هنا.</p>
        ) : (
          <ul className="divide-y divide-rule/60 -my-2">
            {pending.map((r) => {
              const lead = leads.find((l) => l.id === r.lead_id)
              return (
                <li key={r.id} className="py-3 flex flex-wrap items-center gap-2">
                  <p className="flex-1 min-w-[12rem] text-sm">
                    <b>{nameOf(r.referrer_business_id)}</b> رشّح{' '}
                    <button type="button" className="text-accent-700 hover:underline" onClick={() => onOpen(r.lead_id)}>{lead?.name ?? '—'}</button> اللي دفع
                  </p>
                  <Btn tone="primary" className="text-xs !py-1.5" disabled={decide.isPending} onClick={() => run(r, 'granted')}>ادّيله {r.days} يوم</Btn>
                  <Btn tone="ghost" className="text-xs !py-1.5" disabled={decide.isPending} onClick={() => run(r, 'rejected')}>رفض</Btn>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card title={`كل الترشيحات (${referred.length})`}>
        {referred.length === 0 ? (
          <p className="text-sm text-ink-soft">لسه مفيش ترشيحات. فكّر عملاءك باللينك في آخر مكالمة متابعة معاهم.</p>
        ) : (
          <ul className="divide-y divide-rule/60 -my-2">
            {referred.map((l) => (
              <li key={l.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <button type="button" className="font-semibold text-ink hover:underline" onClick={() => onOpen(l.id)}>{l.name}</button>
                  <span className="text-xs text-ink-soft"> من {nameOf(l.referrer_business_id)}</span>
                </span>
                <span className="flex items-center gap-2">
                  {done.find((r) => r.lead_id === l.id)?.status === 'granted' && <span className="text-xs text-accent-700 font-semibold">الشهر اتمنح</span>}
                  <StageBadge stage={l.stage} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

// ── How it works ────────────────────────────────────────────────────────────

function HowItWorks({ settings }) {
  const prices = settings?.plan_prices
  const minAppts = settings?.qualify_min_appointments ?? 5
  const minClients = settings?.qualify_min_clients ?? 3
  const steps = [
    ['العيادة بتسجّل من لينك الشريك', 'بتتحسب عليه أوتوماتيك، حتى لو كمّلت من موبايل تاني. لسه مفيش فلوس.', '0 ج'],
    ['العيادة بتثبت إنها حقيقية', `${minAppts} حجوزات من ${minClients} عملاء مختلفين، أو تدفع، أو إنت تأكدها بعد مكالمة. وبرقم مش رقم الشريك ولا رقم مستخدم في حساب تاني.`, `${PARTNER_DEFAULTS.signup_bonus_egp} ج`],
    ['العيادة بتشترك', 'أول اشتراك بس. التجديد مالوش عمولة، حسب سعر الباقة اللي اشتركت فيها. عيادة من مصر أو الخليج: النسبة واحدة، وعيادة برة مصر بتتحسب على سعرها هناك بالجنيه.', `${PARTNER_DEFAULTS.commission_pct}%`],
    ['إنت بتراجع', 'كل مبلغ بيبدأ «مستنية مراجعتك». توافق أو ترفض من «الفلوس». الشريك شايف «بتتراجع».', '—'],
    ['إنت بتدفع', 'زرار «دفعتله» بيقفل كل اللي وافقت عليه مرة واحدة، والشريك بيشوفه «اتدفعت».', '—'],
  ]
  return (
    <div className="grid lg:grid-cols-2 gap-4 items-start">
      <Card icon={HiOutlineBookOpen} title="رحلة الفلوس خطوة بخطوة">
        <ol className="space-y-3">
          {steps.map(([title, body, money], i) => (
            <li key={title} className="flex gap-3">
              <span className="w-7 h-7 rounded-full bg-accent-50 text-accent-700 font-bold text-sm inline-flex items-center justify-center flex-shrink-0 tabular-nums">{i + 1}</span>
              <div className="flex-1">
                <p className="font-semibold text-sm text-ink">{title}</p>
                <p className="text-xs text-ink-soft leading-relaxed">{body}</p>
              </div>
              <b className="text-sm tabular-nums text-accent-700 whitespace-nowrap">{money}</b>
            </li>
          ))}
        </ol>
      </Card>
      <div className="space-y-4">
        <Card icon={HiOutlineBanknotes} title="الأرقام المقترحة للبداية">
          <EarningsTable terms={PARTNER_DEFAULTS} prices={prices} />
          <ul className="text-sm text-ink-soft mt-3 space-y-1.5 leading-relaxed list-disc pr-5">
            <li><b className="text-ink">{PARTNER_DEFAULTS.signup_bonus_egp} ج + {PARTNER_DEFAULTS.commission_pct}%</b> لكل شريك في الأول. غيّر لشريك معيّن من «تعديل».</li>
            <li><b className="text-ink">الدفع مرة في الشهر</b>، أول 5 أيام، بحد أدنى 200 ج، على فودافون كاش أو إنستاباي.</li>
            <li><b className="text-ink">وافق على نسبة الاشتراك بعد 7 أيام</b> من الدفع، عشان لو العيادة رجعت في كلامها.</li>
            <li><b className="text-ink">العميل اللي يرشّح:</b> {REFERRAL_REWARD} بعد ما زميله يدفع، بدون فلوس.</li>
          </ul>
          <p className="text-xs text-ink-soft mt-3">دي أرقام مقترحة مش مجربة: راجعها بعد أول 10 عيادات تدفع. الحساب في docs/growth-engine.md.</p>
        </Card>
        <Card title="الشريك بيدخل إزاي؟">
          <p className="text-sm text-ink-soft leading-relaxed">
            من <span dir="ltr" className="font-mono text-xs">{partnerLoginLink()}</span> برقم موبايله وكود من 6 أرقام بتعمله من كارت الشريك. 5 محاولات غلط بتقفل الدخول ربع ساعة.
            ولوحته بتوريه عياداته وحالتها وفلوسه بس: مفيش أرقام عيادات ولا إيميلات ولا بيانات مرضى.
          </p>
        </Card>
      </div>
    </div>
  )
}
