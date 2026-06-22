import { useEffect, useRef, useState } from 'react'
import { HiOutlineChevronDown, HiOutlineCheck } from 'react-icons/hi2'

// Styled replacement for a native <select> — native selects render with
// inconsistent, unstyleable browser chrome (especially the dropdown panel
// itself, which can't be themed at all in most browsers). This matches the
// rest of the app's popover pattern (see TopBar's branch switcher).
export default function Dropdown({ value, onChange, options, placeholder = 'اختر...', label, className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selected = options.find(o => o.value === value)

  return (
    <div className={className}>
      {label && <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>}
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between gap-2 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-accent-400 transition-colors min-h-[42px]"
        >
          <span className={`truncate ${!selected ? 'text-gray-400' : ''}`}>{selected ? selected.label : placeholder}</span>
          <HiOutlineChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute top-full mt-1.5 right-0 left-0 bg-white border border-gray-100 rounded-xl shadow-lg py-1.5 z-50 max-h-64 overflow-y-auto" dir="rtl">
            {options.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false) }}
                className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-sm text-right hover:bg-slate-50 transition-colors"
              >
                <span className="truncate">{opt.label}</span>
                {opt.value === value && <HiOutlineCheck className="w-4 h-4 text-accent-500 flex-shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
