import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
} from 'date-fns'
import { ar } from 'date-fns/locale'
import { HiOutlineCalendarDays, HiOutlineChevronRight, HiOutlineChevronLeft, HiOutlineXMark } from 'react-icons/hi2'

const WEEK_START = 6 // Saturday — matches BesholaCalendar's week convention
const AR_DAYS_SHORT = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س']
const PANEL_WIDTH = 'min(17.5rem, calc(100vw - 16px))'
const EDGE_GAP = 8

// Lightweight popover date picker — replaces the native <input type="date">,
// whose calendar UI can't be styled at all and renders inconsistently
// across browsers/OSes. Value/onChange use plain 'yyyy-MM-dd' strings so it
// drops in wherever a native date input was used. `trigger` swaps the field
// for a custom opener: it's called with a function that toggles the panel.
export default function DatePicker({ value, onChange, placeholder = 'اختر تاريخ', allowClear = true, className = '', trigger }) {
  const [open, setOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState(() => (value ? parseISO(value) : new Date()))
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const ref = useRef(null)
  const panelRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current?.contains(e.target) || panelRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // The panel lives on document.body, because cards and modals with hidden or
  // scrolling overflow cut it off. It follows the field and opens upward when
  // there's no room below.
  useLayoutEffect(() => {
    if (!open) return
    function place() {
      if (!ref.current || !panelRef.current) return
      const field = ref.current.getBoundingClientRect()
      const { offsetHeight: height, offsetWidth: width } = panelRef.current
      const below = field.bottom + 6
      const above = field.top - 6 - height
      const maxTop = window.innerHeight - EDGE_GAP - height
      const top = below <= maxTop ? below : above >= EDGE_GAP ? above : Math.max(EDGE_GAP, maxTop)
      const maxLeft = window.innerWidth - EDGE_GAP - width
      const left = Math.max(EDGE_GAP, Math.min(field.right - width, maxLeft))
      setPosition({ top, left })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, viewMonth])

  function toggle() {
    if (!open) setViewMonth(value ? parseISO(value) : new Date())
    setOpen(!open)
  }

  const gridStart = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: WEEK_START })
  const gridEnd = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: WEEK_START })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })
  const selectedDate = value ? parseISO(value) : null

  return (
    <div className={`relative ${className}`} ref={ref}>
      {trigger ? trigger(toggle) : (
        <button
          type="button"
          onClick={toggle}
          className="w-full flex items-center justify-between gap-2 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-accent-400 transition-colors min-h-[42px]"
        >
          <span className={`truncate ${!value ? 'text-gray-400' : ''}`} dir="rtl">
            {value ? format(selectedDate, 'd MMM yyyy', { locale: ar }) : placeholder}
          </span>
          <span className="flex items-center gap-1 flex-shrink-0">
            {allowClear && value && (
              <span
                role="button"
                onClick={e => { e.stopPropagation(); onChange(''); }}
                className="text-gray-300 hover:text-gray-500"
              >
                <HiOutlineXMark className="w-3.5 h-3.5" />
              </span>
            )}
            <HiOutlineCalendarDays className="w-4 h-4 text-gray-400" />
          </span>
        </button>
      )}

      {open && createPortal(
        <div ref={panelRef} style={{ top: position.top, left: position.left, width: PANEL_WIDTH }} className="fixed bg-white border border-gray-100 rounded-xl shadow-lg p-3 z-[60] fit-screen overflow-y-auto" dir="rtl">
          {/* Month header */}
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => setViewMonth(m => subMonths(m, 1))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
              <HiOutlineChevronRight className="w-4 h-4" />
            </button>
            <p className="text-sm font-semibold text-slate-800">{format(viewMonth, 'MMMM yyyy', { locale: ar })}</p>
            <button type="button" onClick={() => setViewMonth(m => addMonths(m, 1))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
              <HiOutlineChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-1">
            {AR_DAYS_SHORT.map((d, i) => (
              <div key={i} className="text-center text-[12.5px] text-slate-400 font-medium py-1">{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {days.map(day => {
              const inMonth = isSameMonth(day, viewMonth)
              const selected = selectedDate && isSameDay(day, selectedDate)
              const today = isToday(day)
              return (
                <button
                  key={day.toString()}
                  type="button"
                  onClick={() => { onChange(format(day, 'yyyy-MM-dd')); setOpen(false) }}
                  className={`w-full max-w-9 aspect-square mx-auto flex items-center justify-center text-sm rounded-full transition-colors ${
                    selected
                      ? 'bg-accent-500 text-white font-bold'
                      : today
                        ? 'bg-accent-50 text-accent-700 font-semibold'
                        : inMonth ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {format(day, 'd')}
                </button>
              )
            })}
          </div>

          {/* Quick actions */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => { onChange(format(new Date(), 'yyyy-MM-dd')); setOpen(false) }}
              className="text-xs font-medium text-accent-600 hover:text-accent-700"
            >
              اليوم
            </button>
            {allowClear && value && (
              <button type="button" onClick={() => { onChange(''); setOpen(false) }} className="text-xs font-medium text-slate-400 hover:text-slate-600">
                مسح
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
