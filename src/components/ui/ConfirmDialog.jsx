import { HiOutlineExclamationTriangle } from 'react-icons/hi2'
import Modal from './Modal'
import Button from './Button'

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'تأكيد',
  message,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  variant = 'default',
  loading = false,
}) {
  const isDanger = variant === 'danger'

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <div dir="rtl" className="text-center space-y-4">
        <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center ${isDanger ? 'bg-red-50 text-red-500' : 'bg-accent-50 text-accent-500'}`}>
          <HiOutlineExclamationTriangle className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          {message && <p className="text-sm text-gray-500 mt-1.5">{message}</p>}
        </div>
        <div className="flex gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} className="flex-1" disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={isDanger ? 'danger' : 'primary'} onClick={onConfirm} className="flex-1" loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
