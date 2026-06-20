import toast from 'react-hot-toast'
import { HiOutlineClipboard } from 'react-icons/hi2'
import { FaWhatsapp } from 'react-icons/fa'

export default function BookingLinkActions({ url, shareMessage, className = '' }) {
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('تم النسخ ✓')
    } catch {
      toast.error('حدث خطأ أثناء النسخ')
    }
  }

  const waText = shareMessage || `احجز موعدك بسهولة من الرابط ده 👇\n${url}`

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={handleCopy}
        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors min-h-[40px]"
      >
        <HiOutlineClipboard className="w-4 h-4" />
        نسخ الرابط
      </button>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(waText)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium bg-green-500 hover:bg-green-600 text-white transition-colors min-h-[40px]"
      >
        <FaWhatsapp className="w-4 h-4" />
        مشاركة
      </a>
    </div>
  )
}
