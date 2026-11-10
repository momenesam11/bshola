import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HiOutlineClock } from 'react-icons/hi2'
import { formatTime12 } from '../../utils/dateHelpers'

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]
const PERIODS = [
  { value: 'am', label: 'صباحًا' },
  { value: 'pm', label: 'مساءً' },
]

const pad = (n) => String(n).padStart(2, '0')

function toDraft(value) {
  const [h, m] = (value || '09:00').split(':').map(Number)
  return { hour: h % 12 || 12, minute: m, period: h < 12 ? 'am' : 'pm' }
}

function fromDraft({ hour, minute, period }) {
  return `${pad((hour % 12) + (period === 'pm' ? 12 : 0))}:${pad(minute)}`
}

function Chip({ selected, onClick, children }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`py-2 rounded-xl text-sm font-semibold transition-colors ${selected ? 'bg-accent-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
    >
      {children}
    </button>
  )
}

function Group({ label, children }) {
  return (
    <div role="group" aria-label={label}>
      <p className="text-xs font-medium text-slate-500 mb-1.5">{label}</p>
      {/* The column count follows the text size, so a large phone font wraps instead of clipping. */}
      <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(3rem, 1fr))' }} dir="ltr">
        {children}
      </div>
    </div>
  )
}

// Replaces the native <input type="time">. On Android that opens a clock drawn
// by the system, which grows with the phone's font and display size until its
// confirm button is pushed off the screen, and no CSS can reach it. Value and
// onChange use plain 'HH:mm' strings, like the native field.
export default function TimePicker({ value, onChange, label = 'الوقت', placeholder = 'اختر الوقت', className = '' }) {
  const [draft, setDraft] = useState(null)
  const fieldRef = useRef(null)
  const panelRef = useRef(null)
  const open = draft !== null

  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    function onKey(e) {
      if (e.key !== 'Escape') return
      setDraft(null)
      fieldRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  function close() {
    setDraft(null)
    fieldRef.current?.focus()
  }

  function update(change) {
    setDraft((d) => ({ ...d, ...change }))
  }

  function nudgeMinute(by) {
    setDraft((d) => ({ ...d, minute: (d.minute + by + 60) % 60 }))
  }

  function confirm() {
    onChange(fromDraft(draft))
    close()
  }

  return (
    <>
      <button
        ref={fieldRef}
        type="button"
        aria-haspopup="dialog"
        aria-label={`${label}: ${value ? formatTime12(value) : placeholder}`}
        onClick={() => setDraft(toDraft(value))}
        className={`flex items-center justify-between gap-2 min-h-[42px] text-sm text-right bg-white text-gray-700 ${className}`}
      >
        <span className={`whitespace-nowrap ${value ? '' : 'text-gray-400'}`}>{value ? formatTime12(value) : placeholder}</span>
        <HiOutlineClock className="w-4 h-4 text-gray-400 flex-shrink-0" />
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" dir="rtl" onClick={(e) => e.stopPropagation()}>
          <div className="absolute inset-0 bg-black/40 touch-none" onClick={close} />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            tabIndex={-1}
            className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col fit-screen focus:outline-none"
          >
            <div className="px-4 pt-4 pb-3 border-b border-slate-100 flex-shrink-0 text-center">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-2xl font-bold text-slate-900" data-testid="time-preview">{formatTime12(fromDraft(draft))}</p>
            </div>

            {/* Only this part scrolls, so the buttons below stay on screen at any font size. */}
            <div className="px-4 py-3 space-y-3 overflow-y-auto overscroll-contain flex-1 min-h-0">
              <Group label="الساعة">
                {HOURS.map((h) => <Chip key={h} selected={draft.hour === h} onClick={() => update({ hour: h })}>{h}</Chip>)}
              </Group>
              <Group label="الدقيقة">
                {MINUTES.map((m) => <Chip key={m} selected={draft.minute === m} onClick={() => update({ minute: m })}>{pad(m)}</Chip>)}
              </Group>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => nudgeMinute(-1)} className="flex-1 py-2 rounded-xl text-sm font-medium whitespace-nowrap border border-slate-200 text-slate-600 hover:bg-slate-50">دقيقة أقل</button>
                <button type="button" onClick={() => nudgeMinute(1)} className="flex-1 py-2 rounded-xl text-sm font-medium whitespace-nowrap border border-slate-200 text-slate-600 hover:bg-slate-50">دقيقة زيادة</button>
              </div>
              <div role="group" aria-label="الفترة" className="grid grid-cols-2 gap-1.5">
                {PERIODS.map((p) => <Chip key={p.value} selected={draft.period === p.value} onClick={() => update({ period: p.value })}>{p.label}</Chip>)}
              </div>
            </div>

            <div className="flex gap-2 px-4 py-3 border-t border-slate-100 flex-shrink-0">
              <button type="button" onClick={close} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50">إلغاء</button>
              <button type="button" onClick={confirm} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-accent-500 hover:bg-accent-600 text-white">تم</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
