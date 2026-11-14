import { useState } from 'react'
import {
  HiOutlineChevronDown, HiOutlineChevronUp, HiOutlineXMark,
  HiOutlineQueueList, HiOutlineBell, HiOutlineStar,
} from 'react-icons/hi2'
import { useTomorrowsAppointments } from '../../hooks/useAppointments'
import { useReviewCandidates, useTodayAppointments } from '../../hooks/useDashboardTasks'
import { useBranch } from '../../context/branchState'
import { waitingQueue } from '../../lib/queue'
import TodayQueue from './TodayQueue'
import TomorrowReminders from './TomorrowReminders'
import ReviewRequests from './ReviewRequests'

// One card above the calendar instead of three: today's queue, tomorrow's
// reminders and Google review requests as tabs, each with its count. The list
// scrolls inside the card so the calendar stays in view. The open tab and a
// collapsed card are remembered on this device.

// Phone buttons are narrow: a third of the screen each. Each has its own
// colour and icon, and a chevron, so it reads as something to tap.
const SHORT_LABELS = { queue: 'الدور', reminders: 'بكرا', reviews: 'تقييم' }
const CHIP_LOOK = {
  queue: { Icon: HiOutlineQueueList, chip: 'bg-violet-50 border-violet-200 text-violet-800', badge: 'bg-violet-600 text-white' },
  reminders: { Icon: HiOutlineBell, chip: 'bg-blue-50 border-blue-200 text-blue-800', badge: 'bg-blue-600 text-white' },
  reviews: { Icon: HiOutlineStar, chip: 'bg-amber-50 border-amber-200 text-amber-800', badge: 'bg-amber-500 text-white' },
}

const TAB_KEY = 'beshola_today_tab'
const COLLAPSED_KEY = 'beshola_today_collapsed'

function readStored(key) {
  try { return localStorage.getItem(key) } catch { return null }
}
function store(key, value) {
  try { localStorage.setItem(key, value) } catch { /* private mode: not remembered */ }
}

export default function TodayTasks({ business, onOpen }) {
  const branchCtx = useBranch()
  const current = branchCtx?.currentBranch
  const branchId = current && !current.isAll ? current.id : null
  const { data: today = [] } = useTodayAppointments(business.id)
  const { data: tomorrowMap = new Map(), isLoading: tomorrowLoading } = useTomorrowsAppointments(business.id)
  const { data: candidates = [] } = useReviewCandidates(business.id)
  const [chosen, setChosen] = useState(() => readStored(TAB_KEY))
  const [collapsed, setCollapsed] = useState(() => readStored(COLLAPSED_KEY) === '1')
  const [sheet, setSheet] = useState(null)

  const queue = waitingQueue(today, branchId)
  const tomorrow = Array.from(tomorrowMap.values()).filter(a => !branchId || !a.branch_id || a.branch_id === branchId)
  const reviews = branchId ? candidates.filter(v => !v.branch_id || v.branch_id === branchId) : candidates

  // Tomorrow's reminders are always there; the other two only when they have something.
  const tabs = [
    queue.length > 0 && { key: 'queue', label: 'الدور النهارده', count: queue.length },
    { key: 'reminders', label: 'تذكيرات بكرا', count: tomorrow.filter(a => !a.reminder_sent).length },
    reviews.length > 0 && { key: 'reviews', label: 'اطلب تقييم', count: reviews.length },
  ].filter(Boolean)
  // The tab the owner last opened, if it still has a place; otherwise the first with work.
  const active = tabs.find(t => t.key === chosen)?.key
    || tabs.find(t => t.count > 0)?.key
    || 'reminders'

  function pick(key) {
    setChosen(key)
    store(TAB_KEY, key)
    if (collapsed) toggle()
  }
  function toggle() {
    setCollapsed(c => {
      store(COLLAPSED_KEY, c ? '0' : '1')
      return !c
    })
  }

  if (tomorrowLoading) return null

  const content = (key) => (
    <>
      {key === 'queue' && <TodayQueue business={business} queue={queue} onOpen={(a) => { setSheet(null); onOpen?.(a) }} />}
      {key === 'reminders' && <TomorrowReminders business={business} appts={tomorrow} />}
      {key === 'reviews' && <ReviewRequests business={business} list={reviews} />}
    </>
  )
  const sheetTab = tabs.find(t => t.key === sheet)

  return (
    <>
      {/* Phone: one slim row of buttons, so the calendar shows straight away.
          Each opens its list in a sheet from the bottom. */}
      <div data-testid="today-chips" className="md:hidden flex gap-2.5 mb-3 pt-2" dir="rtl">
        {tabs.map(t => {
          const look = CHIP_LOOK[t.key]
          const Icon = look.Icon
          return (
            <button key={t.key} onClick={() => setSheet(t.key)} aria-label={`${t.label} (${t.count})`}
              className={`relative flex-1 min-w-0 flex items-center justify-center gap-1.5 h-12 px-2 rounded-2xl border-2 shadow-sm active:scale-95 active:shadow-none transition ${look.chip}`}>
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-bold truncate">{SHORT_LABELS[t.key]}</span>
              <span className={`absolute -top-2 -left-1.5 min-w-[22px] h-[22px] px-1.5 rounded-full text-xs font-bold leading-[22px] text-center tabular-nums ring-2 ring-white ${t.count > 0 ? look.badge : 'bg-slate-200 text-slate-500'}`}>{t.count}</span>
            </button>
          )
        })}
      </div>

      {sheetTab && (
        <div className="md:hidden fixed inset-0 z-50" dir="rtl" role="dialog" aria-modal="true" aria-label={sheetTab.label}>
          <div className="absolute inset-0 bg-black/40" onClick={() => setSheet(null)} />
          <div data-testid="today-sheet" className="absolute inset-x-0 bottom-0 max-h-[85vh] flex flex-col bg-slate-50 rounded-t-3xl shadow-2xl pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <h2 className="font-bold text-slate-900">{sheetTab.label}{sheetTab.count > 0 ? ` (${sheetTab.count})` : ''}</h2>
              <button onClick={() => setSheet(null)} aria-label="اقفل" className="p-2 -m-1 rounded-full text-slate-500 hover:bg-slate-200">
                <HiOutlineXMark className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-4">{content(sheetTab.key)}</div>
          </div>
        </div>
      )}

    <div data-testid="today-tasks" className="hidden md:block bg-white rounded-2xl border border-slate-100 shadow-sm mb-4" dir="rtl">
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <div role="tablist" className="flex-1 flex gap-1.5 overflow-x-auto scrollbar-none">
          {tabs.map(t => (
            <button
              key={t.key}
              role="tab"
              aria-selected={!collapsed && active === t.key}
              onClick={() => pick(t.key)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
                !collapsed && active === t.key ? 'bg-accent-500 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className={`text-xs leading-none px-1.5 py-1 rounded-full ${!collapsed && active === t.key ? 'bg-white/25' : 'bg-white text-slate-700'}`}>{t.count}</span>
              )}
            </button>
          ))}
        </div>
        <button onClick={toggle} aria-label={collapsed ? 'افتح المربع' : 'اقفل المربع'}
          className="p-2 rounded-lg text-slate-400 hover:bg-slate-50 flex-shrink-0">
          {collapsed ? <HiOutlineChevronDown className="w-4 h-4" /> : <HiOutlineChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {!collapsed && (
        <div className="px-3 pb-3 max-h-[340px] overflow-y-auto">{content(active)}</div>
      )}
    </div>
    </>
  )
}
