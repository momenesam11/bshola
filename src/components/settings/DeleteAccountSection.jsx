import { useState } from 'react'
import toast from 'react-hot-toast'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import { Textarea } from '../ui/Input'
import { useDeletionRequest, useRequestDeletion, useCancelDeletion } from '../../hooks/useAccountDeletion'

// Settings → منطقة الخطر. Asking records a request that shows up in /admin.
// Nothing is deleted until the Beshola team approves it there, and the clinic
// keeps working normally until then.
export default function DeleteAccountSection({ businessId }) {
  const { data: request, isLoading } = useDeletionRequest(businessId)
  const ask = useRequestDeletion(businessId)
  const cancel = useCancelDeletion(businessId)
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')

  async function submit() {
    try {
      await ask.mutateAsync(reason.trim())
      setOpen(false)
      setReason('')
      toast.success('طلبك وصلنا')
    } catch (e) {
      toast.error(e?.message || 'حصل خطأ، جرّب تاني')
    }
  }

  async function withdraw() {
    try {
      await cancel.mutateAsync()
      toast.success('اتلغى طلب الحذف')
    } catch (e) {
      toast.error(e?.message || 'حصل خطأ، جرّب تاني')
    }
  }

  if (isLoading) return <div className="h-16 bg-slate-100 rounded-xl animate-pulse" />

  if (request) {
    return (
      <div className="space-y-3">
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
          طلبت حذف الحساب يوم {new Date(request.requested_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}.
          {' '}فريق بسهولة هيراجع الطلب ويحذف الحساب. لحد ما ده يحصل، حسابك شغال عادي.
        </div>
        <Button variant="secondary" size="sm" onClick={withdraw} loading={cancel.isPending}>إلغاء طلب الحذف</Button>
      </div>
    )
  }

  return (
    <>
      <p className="text-sm text-slate-500">
        لو عايز تحذف حسابك، ابعتلنا طلب من هنا. بعد ما نراجعه، هنحذف الحساب وكل بياناته: المواعيد والعملاء والملفات. الحذف مايترجعش.
      </p>
      <Button variant="danger" onClick={() => setOpen(true)} size="sm">طلب حذف الحساب</Button>

      <Modal open={open} onClose={() => setOpen(false)} title="طلب حذف الحساب" size="sm">
        <div dir="rtl" className="space-y-4">
          <p className="text-sm text-slate-600">
            الطلب هيوصل لفريق بسهولة. بعد الموافقة، الحساب وكل بياناته هيتمسحوا نهائياً، ومعاهم حساب الدخول بالإيميل ده.
          </p>
          <Textarea
            label="سبب الحذف (اختياري)"
            value={reason}
            onChange={e => setReason(e.target.value)}
            maxLength={500}
            placeholder="يساعدنا نحسّن بسهولة"
          />
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setOpen(false)} disabled={ask.isPending}>رجوع</Button>
            <Button variant="danger" className="flex-1" onClick={submit} loading={ask.isPending}>ابعت الطلب</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
