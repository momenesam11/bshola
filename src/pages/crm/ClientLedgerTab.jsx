import { useState } from 'react'
import { HiOutlineBanknotes, HiOutlineReceiptPercent } from 'react-icons/hi2'
import { useClientLedger, useAddLedgerPayment, useAddLedgerCharge, PAYMENT_METHOD_LABELS } from '../../hooks/useClientLedger'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Dropdown from '../../components/ui/Dropdown'
import Modal from '../../components/ui/Modal'
import { formatDateAr } from '../../utils/dateHelpers'

const PAYMENT_METHOD_OPTIONS = Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({ value, label }))

function AddPaymentModal({ open, onClose, businessId, clientPhone }) {
  const addPayment = useAddLedgerPayment()
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [note, setNote] = useState('')

  async function handleSubmit() {
    if (!amount || Number(amount) <= 0) return
    await addPayment.mutateAsync({ businessId, clientPhone, amount: Number(amount), method, note: note.trim() || null })
    setAmount(''); setNote('')
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="إضافة دفعة" size="sm">
      <div dir="rtl" className="space-y-3">
        <Input label="المبلغ" type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} dir="ltr" placeholder="0" />
        <Dropdown label="طريقة الدفع" value={method} onChange={setMethod} options={PAYMENT_METHOD_OPTIONS} />
        <Input label="ملاحظة (اختياري)" value={note} onChange={e => setNote(e.target.value)} placeholder="مثال: دفعة أولى" />
        <Button onClick={handleSubmit} loading={addPayment.isPending} className="w-full">إضافة الدفعة</Button>
      </div>
    </Modal>
  )
}

function AddChargeModal({ open, onClose, businessId, clientPhone }) {
  const addCharge = useAddLedgerCharge()
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')

  async function handleSubmit() {
    if (!amount || Number(amount) <= 0 || !description.trim()) return
    await addCharge.mutateAsync({ businessId, clientPhone, amount: Number(amount), description: description.trim() })
    setAmount(''); setDescription('')
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="إضافة مصروف / خدمة إضافية" size="sm">
      <div dir="rtl" className="space-y-3">
        <Input label="الوصف" value={description} onChange={e => setDescription(e.target.value)} placeholder="مثال: خدمة إضافية" />
        <Input label="المبلغ" type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} dir="ltr" placeholder="0" />
        <Button onClick={handleSubmit} loading={addCharge.isPending} className="w-full">إضافة</Button>
      </div>
    </Modal>
  )
}

export default function ClientLedgerTab({ businessId, clientPhone }) {
  const { data, isLoading } = useClientLedger(businessId, clientPhone)
  const [showPayment, setShowPayment] = useState(false)
  const [showCharge, setShowCharge] = useState(false)

  if (isLoading) {
    return <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />)}</div>
  }

  const entries = data?.entries || []
  const balance = data?.balance || 0

  return (
    <div className="space-y-4" dir="rtl">
      {/* Running balance */}
      <div className={`rounded-2xl p-4 text-center ${balance > 0 ? 'bg-red-50 border border-red-100' : 'bg-accent-50 border border-accent-100'}`}>
        <p className={`text-2xl font-bold ${balance > 0 ? 'text-red-600' : 'text-accent-700'}`}>{Math.abs(balance)} ج.م</p>
        <p className={`text-xs mt-1 font-medium ${balance > 0 ? 'text-red-500' : 'text-accent-600'}`}>
          {balance > 0 ? 'إجمالي عليه' : balance < 0 ? 'له (دفع أكتر من المطلوب)' : 'الحساب متزن'}
        </p>
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => setShowPayment(true)} className="flex-1">
          <HiOutlineBanknotes className="w-4 h-4" /> إضافة دفعة
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setShowCharge(true)} className="flex-1">
          <HiOutlineReceiptPercent className="w-4 h-4" /> مصروف إضافي
        </Button>
      </div>

      {/* Entries */}
      {entries.length === 0 ? (
        <p className="text-slate-400 text-sm text-center py-8">لا توجد عمليات بعد</p>
      ) : (
        <div className="space-y-2">
          {[...entries].reverse().map(entry => (
            <div key={entry.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{entry.description}</p>
                <p className="text-xs text-slate-400 mt-0.5">{formatDateAr(entry.created_at, 'd MMM yyyy')}</p>
              </div>
              <div className="text-left flex-shrink-0">
                <p className={`text-sm font-bold ${entry.entry_type === 'charge' ? 'text-red-600' : 'text-accent-600'}`} dir="ltr">
                  {entry.entry_type === 'charge' ? '+' : '-'}{entry.amount} ج.م
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5" dir="ltr">الرصيد: {entry.balanceAfter} ج.م</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddPaymentModal open={showPayment} onClose={() => setShowPayment(false)} businessId={businessId} clientPhone={clientPhone} />
      <AddChargeModal open={showCharge} onClose={() => setShowCharge(false)} businessId={businessId} clientPhone={clientPhone} />
    </div>
  )
}
