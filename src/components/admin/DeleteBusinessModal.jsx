import { useState } from 'react'
import toast from 'react-hot-toast'
import { HiOutlineExclamationTriangle } from 'react-icons/hi2'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import { useDeleteBusiness } from '../../hooks/useAdmin'

// Permanent deletion from /admin. The account name has to be typed back,
// here and again on the server, so the wrong row can't be deleted by a slip.
export default function DeleteBusinessModal({ business, onClose }) {
  const del = useDeleteBusiness()
  const [typed, setTyped] = useState('')
  const matches = !!business && typed.trim() === business.name.trim()

  async function confirm() {
    try {
      const res = await del.mutateAsync({ id: business.id, confirmName: typed })
      if (res.leftovers?.length) {
        toast.error(`اتحذف ${business.name}، بس فضل: ${res.leftovers.join('، ')}. امسحهم من Supabase.`, { duration: 10000 })
      } else {
        toast.success(`اتحذف ${business.name} نهائياً`)
      }
      onClose()
    } catch (e) {
      toast.error(e.message || 'حدث خطأ')
    }
  }

  return (
    <Modal open={!!business} onClose={del.isPending ? () => {} : onClose} size="sm">
      {business && (
        <div dir="rtl" className="space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center bg-red-50 text-red-500">
            <HiOutlineExclamationTriangle className="w-6 h-6" />
          </div>
          <div className="text-center">
            <h2 className="text-base font-bold text-gray-900">حذف {business.name} نهائياً</h2>
            <p className="text-sm text-gray-500 mt-1.5">
              هيتمسح الحساب وكل مواعيده وعملائه وملفاته، وحساب الدخول بتاعه. الحذف مايترجعش.
            </p>
          </div>
          <label className="block text-sm text-gray-700">
            اكتب اسم الحساب للتأكيد
            <input
              value={typed}
              onChange={e => setTyped(e.target.value)}
              placeholder={business.name}
              className="mt-1.5 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-300"
            />
          </label>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={onClose} disabled={del.isPending}>إلغاء</Button>
            <Button variant="danger" className="flex-1" onClick={confirm} disabled={!matches} loading={del.isPending}>احذف نهائياً</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
