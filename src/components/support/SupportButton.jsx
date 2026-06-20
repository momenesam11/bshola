import { useState, useRef, useEffect } from 'react'
import { HiOutlineQuestionMarkCircle, HiOutlineEnvelope, HiOutlineXMark } from 'react-icons/hi2'
import { FaWhatsapp } from 'react-icons/fa'

const SUPPORT_WHATSAPP = '201021179969'
const SUPPORT_EMAIL = 'moment.esam15@gmail.com'

export default function SupportButton() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+16px)] md:bottom-6 left-4 z-40" dir="rtl" ref={ref}>
      {open && (
        <div className="absolute bottom-full mb-2 left-0 w-64 bg-white rounded-2xl shadow-xl border border-slate-100 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900">محتاج مساعدة؟</h3>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
              <HiOutlineXMark className="w-4 h-4" />
            </button>
          </div>
          <a
            href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent('محتاج مساعدة في حسابي على بسهولة')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <FaWhatsapp className="w-4 h-4" />
            تواصل عبر واتساب
          </a>
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('طلب مساعدة - بسهولة')}`}
            className="w-full flex items-center justify-center gap-2 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-xl transition-colors"
          >
            <HiOutlineEnvelope className="w-4 h-4" />
            تواصل عبر الإيميل
          </a>
        </div>
      )}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-12 h-12 rounded-full bg-white border-2 border-accent-500 text-accent-600 shadow-lg flex items-center justify-center hover:bg-accent-50 transition-colors"
        aria-label="محتاج مساعدة؟"
      >
        <HiOutlineQuestionMarkCircle className="w-6 h-6" />
      </button>
    </div>
  )
}
