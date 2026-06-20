import { useEffect } from 'react'
import { HiOutlinePlus, HiOutlineTrash, HiOutlineExclamationTriangle } from 'react-icons/hi2'
import DayToggle from './DayToggle'

const DAYS = [
  { key: 'sat', label: 'السبت' },
  { key: 'sun', label: 'الأحد' },
  { key: 'mon', label: 'الاثنين' },
  { key: 'tue', label: 'الثلاثاء' },
  { key: 'wed', label: 'الأربعاء' },
  { key: 'thu', label: 'الخميس' },
  { key: 'fri', label: 'الجمعة' },
]

// True if any two blocks for the same day share any time — overlapping
// periods aren't allowed, since slot generation can't reconcile them.
function dayHasOverlap(blocks) {
  if (!blocks || blocks.length < 2) return false
  const sorted = [...blocks].sort((a, b) => a.start.localeCompare(b.start))
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < sorted[i - 1].end) return true
  }
  return false
}

export default function ScheduleBlockEditor({ value, onChange, onValidityChange }) {
  const blocks = value || {}

  function dayBlocks(day) { return blocks[day] || [] }
  function setDayBlocks(day, next) { onChange({ ...blocks, [day]: next }) }

  function toggleDay(day, on) {
    setDayBlocks(day, on ? (dayBlocks(day).length ? dayBlocks(day) : [{ start: '09:00', end: '18:00' }]) : [])
  }
  function updateBlock(day, idx, field, val) {
    setDayBlocks(day, dayBlocks(day).map((b, i) => i === idx ? { ...b, [field]: val } : b))
  }
  function addBlock(day) {
    setDayBlocks(day, [...dayBlocks(day), { start: '16:00', end: '22:00' }])
  }
  function removeBlock(day, idx) {
    setDayBlocks(day, dayBlocks(day).filter((_, i) => i !== idx))
  }

  const isValid = DAYS.every(({ key }) => !dayHasOverlap(dayBlocks(key)))

  useEffect(() => {
    onValidityChange?.(isValid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isValid])

  return (
    <div className="space-y-2">
      {DAYS.map(({ key, label }) => {
        const dBlocks = dayBlocks(key)
        const overlap = dayHasOverlap(dBlocks)
        return (
          <DayToggle key={key} label={label} on={dBlocks.length > 0} onChange={on => toggleDay(key, on)}>
            <div className="space-y-2 pt-2">
              {dBlocks.map((b, idx) => (
                <div key={idx} className="flex items-center gap-2 flex-wrap">
                  <input type="time" value={b.start} onChange={e => updateBlock(key, idx, 'start', e.target.value)}
                    className={`border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 ${overlap ? 'border-red-300' : 'border-slate-200'}`} dir="ltr" />
                  <span className="text-slate-400 text-xs">←</span>
                  <input type="time" value={b.end} onChange={e => updateBlock(key, idx, 'end', e.target.value)}
                    className={`border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 ${overlap ? 'border-red-300' : 'border-slate-200'}`} dir="ltr" />
                  <button type="button" onClick={() => removeBlock(key, idx)} className="text-red-400 hover:text-red-600 p-1">
                    <HiOutlineTrash className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {overlap && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <HiOutlineExclamationTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  فيه تعارض بين الفترات — لازم كل فترة تبدأ بعد ما اللي قبلها تخلص
                </p>
              )}
              <button type="button" onClick={() => addBlock(key)} className="flex items-center gap-1 text-xs text-accent-600 hover:text-accent-700 font-medium w-fit">
                <HiOutlinePlus className="w-3.5 h-3.5" />إضافة فترة
              </button>
            </div>
          </DayToggle>
        )
      })}
    </div>
  )
}
