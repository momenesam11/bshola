import { useState } from 'react'
import toast from 'react-hot-toast'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import { Select } from '../ui/Input'
import { useActivateBusiness, useExtendTrial } from '../../hooks/useAdmin'

const PAID_DURATIONS = [
  { value: 30, label: 'شهر واحد (30 يوم)' },
  { value: 90, label: '3 شهور (90 يوم)' },
  { value: 180, label: '6 شهور (180 يوم)' },
  { value: 365, label: 'سنة كاملة (365 يوم)' },
]

const TRIAL_EXTENSIONS = [
  { value: 7, label: '7 أيام' },
  { value: 14, label: '14 يوم' },
]

export default function ActivateModal({ open, onClose, business }) {
  const [duration, setDuration] = useState(30)
  const [extendDays, setExtendDays] = useState(7)
  const activate = useActivateBusiness()
  const extend = useExtendTrial()

  if (!business) return null

  async function handleActivate() {
    try {
      await activate.mutateAsync({ id: business.id, days: Number(duration) })
      toast.success(`تم تفعيل ${business.name} ✓`)
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
          <Select label="مدة الاشتراك" value={duration} onChange={e => setDuration(e.target.value)}>
            {PAID_DURATIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </Select>
          <Button onClick={handleActivate} loading={activate.isPending} className="w-full">تفعيل</Button>
        </div>

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
