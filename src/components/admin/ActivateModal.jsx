import { useState } from 'react'
import toast from 'react-hot-toast'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Input, { Select } from '../ui/Input'
import { useActivateBusiness, useExtendTrial, useSubscriptionPayments } from '../../hooks/useAdmin'
import { LIFETIME_DAYS } from '../../lib/lifetime'
import { formatMoney } from '../../lib/countries'

const CUSTOM = 'custom'
// Ten years at most, so a typed number can't count as a "for life" subscription.
const MAX_CUSTOM_DAYS = 3650

const PAID_DURATIONS = [
  { value: 30, label: 'شهر واحد (30 يوم)' },
  { value: 90, label: '3 شهور (90 يوم)' },
  { value: 180, label: '6 شهور (180 يوم)' },
  { value: 365, label: 'سنة كاملة (365 يوم)' },
  { value: LIFETIME_DAYS, label: 'مدى الحياة' },
  { value: CUSTOM, label: 'عدد أيام مخصوص' },
]

const TRIAL_EXTENSIONS = [
  { value: 7, label: '7 أيام' },
  { value: 14, label: '14 يوم' },
]

const arDate = (date) => new Date(date).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })

export default function ActivateModal({ open, onClose, business }) {
  const [duration, setDuration] = useState(30)
  const [customDays, setCustomDays] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('')
  const [extendDays, setExtendDays] = useState(7)
  const [now] = useState(() => Date.now())
  const activate = useActivateBusiness()
  const extend = useExtendTrial()
  const { data: payments = [] } = useSubscriptionPayments(open ? business?.id : null)

  if (!business) return null

  const isCustom = duration === CUSTOM
  const days = isCustom ? Number(customDays) : Number(duration)
  const validDays = !isCustom || (Number.isInteger(days) && days >= 1 && days <= MAX_CUSTOM_DAYS)
  const validAmount = amount === '' || Number(amount) >= 0

  async function handleActivate() {
    if (!validDays) return toast.error(`اكتب عدد أيام من 1 لـ ${MAX_CUSTOM_DAYS}`)
    if (!validAmount) return toast.error('المبلغ مش صحيح')
    try {
      const result = await activate.mutateAsync({ id: business.id, days, amount: amount === '' ? null : Number(amount), method })
      toast.success(`تم تفعيل ${business.name} ✓`)
      if (result.paymentSaved === false) toast.error('الاشتراك اتفعل، بس بيانات الدفع ما اتسجلتش')
      onClose()
    } catch (e) {
      toast.error(e.message || 'حدث خطأ')
    }
  }

  async function handleExtend() {
    try {
      await extend.mutateAsync({ id: business.id, currentTrialEndsAt: business.trial_ends_at, days: Number(extendDays) })
      toast.success(`تم تمديد تجربة ${business.name} ✓`)
      onClose()
    } catch (e) {
      toast.error(e.message || 'حدث خطأ')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={business.name} size="sm">
      <div className="space-y-6" dir="rtl">
        <p className="text-sm text-gray-500">
          الحالة الحالية: <span className="font-medium text-gray-700">{business.subscription_type === 'paid' ? 'مشترك' : 'تجربة'}</span>
        </p>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">تفعيل اشتراك مدفوع</h3>
          <Select label="مدة الاشتراك" value={duration} onChange={e => setDuration(e.target.value === CUSTOM ? CUSTOM : Number(e.target.value))}>
            {PAID_DURATIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </Select>
          {isCustom && (
            <Input label="عدد الأيام" type="number" inputMode="numeric" min="1" max={MAX_CUSTOM_DAYS} step="1" placeholder="مثلاً: 35" value={customDays} onChange={e => setCustomDays(e.target.value)} />
          )}
          {days !== LIFETIME_DAYS && days > 0 && validDays && (
            <p className="text-xs text-gray-500">هيبدأ النهارده وينتهي يوم {arDate(now + days * 864e5)}</p>
          )}
          <Input label="المبلغ المدفوع (اختياري)" type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={e => setAmount(e.target.value)} />
          <Input label="طريقة الدفع (اختياري)" maxLength={100} placeholder="مثلاً: فودافون كاش، إنستاباي، كاش" value={method} onChange={e => setMethod(e.target.value)} />
          <Button onClick={handleActivate} loading={activate.isPending} className="w-full">تفعيل</Button>
        </div>

        {payments.length > 0 && (
          <div className="space-y-2 pt-4 border-t border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">المدفوعات السابقة</h3>
            <ul className="space-y-1.5">
              {payments.map(p => (
                <li key={p.id} className="text-xs text-gray-600">
                  {[arDate(p.created_at), `${p.days} يوم`, p.amount !== null && formatMoney(p.amount, p.currency), p.method].filter(Boolean).join(' · ')}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-3 pt-4 border-t border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">تمديد تجربة</h3>
          <Select label="عدد الأيام" value={extendDays} onChange={e => setExtendDays(e.target.value)}>
            {TRIAL_EXTENSIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </Select>
          <Button variant="secondary" onClick={handleExtend} loading={extend.isPending} className="w-full">تمديد التجربة</Button>
        </div>
      </div>
    </Modal>
  )
}
