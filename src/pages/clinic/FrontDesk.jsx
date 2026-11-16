import { useEffect, useMemo, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  HiOutlineMagnifyingGlass, HiOutlineCheck, HiOutlineArrowUturnDown, HiOutlineLink,
  HiOutlinePlus, HiOutlineClipboard, HiOutlineMegaphone, HiOutlineTv,
} from 'react-icons/hi2'
import { FaWhatsapp } from 'react-icons/fa'
import PageWrapper from '../../components/layout/PageWrapper'
import AppointmentModal from '../../components/appointments/AppointmentModal'
import { useBusiness } from '../../hooks/useBusiness'
import { useAppointments, useUpdateAppointment, invalidateAll } from '../../hooks/useAppointments'
import { useBranch } from '../../context/branchState'
import { supabase } from '../../lib/supabase'
import { openWhatsApp, formatTimeArabic, generateManageLinkMessage } from '../../lib/whatsapp'
import { phoneDigits, phoneMatches } from '../../lib/countries'
import { formatWait, notifyAheadOf, periodChoices, periodLine, queueMessage, visitMinutes, waitingQueue } from '../../lib/queue'
import { formatTime12, todayISO } from '../../utils/dateHelpers'
import { periodName, periodsOfDay, walkInPeriodStart } from '../../lib/queueBooking'

// /clinic: the front desk (migration 058). The secretary keeps this open all
// day: who is inside, one button to call the next, who arrived, a WhatsApp
// for anyone's place, and a late patient sent back a few places. The calendar
// on the dashboard stays as it was.

const PUSH_BACK = 3
const TAB_KEY = 'beshola_clinic_tab'

function readTab() {
  try { return localStorage.getItem(TAB_KEY) || 'now' } catch { return 'now' }
}

function minutesSince(iso, now) {
  return iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000)) : null
}

function clock(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return formatTimeArabic(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
}

// Now, rounded down to five minutes, for a walk-in added from here.
function nowTime() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(Math.floor(d.getMinutes() / 5) * 5).padStart(2, '0')}`
}

// The measured visit time (consult_minutes in 058), refreshed with the appointments.
function useConsultMinutes(businessId) {
  return useQuery({
    queryKey: ['appointments', businessId, 'consult-minutes'],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('consult_minutes', { p_business_id: businessId })
      if (error) return null
      return data
    },
  })
}

function useServices(businessId) {
  return useQuery({
    queryKey: ['services', businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase.from('services').select('*').eq('business_id', businessId)
      if (error) throw error
      return data
    },
  })
}

export default function FrontDesk() {
  const { data: business } = useBusiness()
  const branchCtx = useBranch()
  const qc = useQueryClient()
  const date = todayISO()
  const { data: all = [], refetch } = useAppointments(business?.id, date)
  const { data: measured } = useConsultMinutes(business?.id)
  const { data: services = [] } = useServices(business?.id)
  const update = useUpdateAppointment()

  const [tab, setTab] = useState(readTab)
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [modal, setModal] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const [pickedBranch, setPickedBranch] = useState(null)
  const [pickedPeriod, setPickedPeriod] = useState(null)

  // Realtime covers most changes; this catches a dropped connection, and keeps
  // the "inside for N minutes" clock moving.
  useEffect(() => {
    const t = setInterval(() => { setNow(Date.now()); refetch() }, 15_000)
    return () => clearInterval(t)
  }, [refetch])

  // One line per branch. "All branches" on a multi-branch account picks one here.
  const branches = branchCtx?.branches || []
  const current = branchCtx?.currentBranch
  const branch = current && !current.isAll
    ? current
    : branches.find(b => b.id === pickedBranch) || branches[0] || null
  const branchId = branch?.id || null

  const minutes = visitMinutes(measured, services, business)
  const dayLine = useMemo(() => waitingQueue(all, branchId), [all, branchId])
  // A clinic that books by turn numbers each period from 1, so the desk shows
  // one period at a time: the one running now, or the next, unless picked.
  const byTurn = business?.booking_mode === 'queue'
  const periods = byTurn ? periodsOfDay(branch, business, date) : []
  const choices = byTurn ? periodChoices(dayLine, periods) : []
  // Opens on the period running now only if someone waits in it; otherwise on
  // the first tab that has patients, so the desk never opens on an empty list
  // while patients wait under another time.
  const scheduled = walkInPeriodStart(periods, nowTime())
  const periodStart = byTurn
    ? (choices.some(c => c.start === pickedPeriod) ? pickedPeriod
      : choices.find(c => c.start === scheduled && c.waiting)?.start
        || choices.find(c => c.waiting)?.start
        || scheduled || null)
    : null
  const otherTabsWaiting = byTurn ? choices.filter(c => c.start !== periodStart && c.waiting) : []
  const line = byTurn ? periodLine(dayLine, periods, periodStart) : dayLine
  const inside = line[0]?.called_at ? line[0] : null
  // The same number booked twice today (e.g. morning and evening).
  const phoneCount = {}
  for (const a of dayLine) { const p = phoneDigits(a.client_phone); phoneCount[p] = (phoneCount[p] || 0) + 1 }
  const bookedTwice = (a) => phoneCount[phoneDigits(a.client_phone)] > 1
  const waiting = inside ? line.slice(1) : line
  const next = waiting[0] || null
  const done = all
    .filter(a => ['completed', 'no_show'].includes(a.status))
    .filter(a => !branchId || !a.branch_id || a.branch_id === branchId)
    .sort((a, b) => String(b.finished_at || b.updated_at || '').localeCompare(String(a.finished_at || a.updated_at || '')))
  const notifyAhead = notifyAheadOf(business)
  // Calling in also tells the next one to come: once this call is done, the
  // patient furthest back with notifyAhead or fewer ahead who wasn't told yet
  // and isn't here. Usually that's the one who just reached notifyAhead, so
  // each call gives one patient the clinic's full heads-up.
  function dueAfterCall(target) {
    if (!target) return null
    const after = [target, ...line.filter(a => a !== target && a !== inside)]
    for (let i = Math.min(notifyAhead, after.length - 1); i >= 1; i--) {
      const p = after[i]
      if (!p.queue_notified_at && !p.arrived_at) return { appt: p, ahead: i }
    }
    return null
  }
  const due = dueAfterCall(next)
  const shown = search.trim()
    ? waiting.filter(a => a.client_name?.includes(search.trim()) || phoneMatches(a.client_phone, search))
    : waiting

  function pickTab(key) {
    setTab(key)
    try { localStorage.setItem(TAB_KEY, key) } catch { /* not remembered */ }
  }

  async function run(appt, fn, success) {
    setBusyId(appt?.id || 'call')
    try {
      await fn()
      invalidateAll(qc)
      if (success) toast.success(success)
    } catch (e) {
      toast.error(e?.message?.includes('NOT_WAITING') ? 'المريض ده مش في الدور دلوقتي' : (e?.message || 'تعذر الحفظ'))
    } finally {
      setBusyId(null)
    }
  }

  const rpc = async (name, args) => {
    const { error } = await supabase.rpc(name, args)
    if (error) throw new Error(error.message)
  }

  // The WhatsApp tab has to open on the click itself (a browser blocks it after
  // an await), so the message goes first and the call is saved after it.
  function call(appt) {
    const tell = dueAfterCall(appt)
    let told = false
    if (tell) {
      told = openWhatsApp(tell.appt.client_phone, queueMessage(tell.appt, tell.ahead, business, branch, { minutes: tell.ahead * minutes }))
      if (!told) toast.error('المتصفح منع فتح واتساب — اسمح بالنوافذ المنبثقة وجرّب تاني')
    }
    return run(appt, async () => {
      await rpc('front_desk_call', { p_appointment_id: appt.id })
      if (told) await update.mutateAsync({ id: tell.appt.id, queue_notified_at: new Date().toISOString() })
    }, callToast(appt))
  }
  const callToast = (appt) => `${appt.queue_number != null ? `رقم ${appt.queue_number}: ` : ''}${appt.client_name} جوه`
  const pushBack = (appt) => run(appt, () => rpc('front_desk_push_back', { p_appointment_id: appt.id, p_steps: PUSH_BACK }), `${appt.client_name} رجع ${PUSH_BACK} أدوار`)
  const setStatus = (appt, status, msg) => run(appt, () => update.mutateAsync({ id: appt.id, status }), msg)
  const arrived = (appt) => run(appt, () => update.mutateAsync({ id: appt.id, arrived_at: new Date().toISOString() }), `${appt.client_name} وصل`)
  // A mistaken "وصل": back to on their way, so the WhatsApp heads-up counts them again.
  const notArrived = (appt) => run(appt, () => update.mutateAsync({ id: appt.id, arrived_at: null }), `${appt.client_name}: اتشال الوصول`)

  // A walk-in joins today's running period (or the next) in a queue clinic, so
  // they get that period's next number; a time clinic books them now.
  const walkInTime = (business?.booking_mode === 'queue' && walkInPeriodStart(periodsOfDay(branch, business, date), nowTime())) || nowTime()

  function label(appt) {
    return appt.queue_number != null ? `رقم ${appt.queue_number}` : appt.client_name
  }

  async function sendPlace(appt) {
    const ahead = line.indexOf(appt)
    if (!openWhatsApp(appt.client_phone, queueMessage(appt, ahead, business, branch, { minutes: ahead * minutes }))) {
      toast.error('المتصفح منع فتح واتساب — اسمح بالنوافذ المنبثقة وجرّب تاني')
      return
    }
    await run(appt, () => update.mutateAsync({ id: appt.id, queue_notified_at: new Date().toISOString() }))
  }

  function sendLink(appt) {
    if (!openWhatsApp(appt.client_phone, generateManageLinkMessage(appt, business))) {
      toast.error('المتصفح منع فتح واتساب — اسمح بالنوافذ المنبثقة وجرّب تاني')
    }
  }

  const screenPath = business
    ? `/q/${business.booking_slug || business.id}${branches.length > 1 && branchId ? `?b=${branchId}` : ''}`
    : '/'

  async function copyBookingLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/book/${business.booking_slug || business.id}`)
      toast.success('اتنسخ لينك الحجز')
    } catch {
      toast.error('تعذر النسخ')
    }
  }

  if (!business) return <PageWrapper title="العيادة"><div /></PageWrapper>

  return (
    <PageWrapper title="العيادة">
      <Helmet>
        <title>العيادة — بسهولة</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="max-w-2xl mx-auto space-y-3" dir="rtl" data-testid="front-desk">
        {current?.isAll && branches.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {branches.map(b => (
              <button key={b.id} onClick={() => setPickedBranch(b.id)}
                className={`px-3 py-1.5 rounded-xl text-sm border ${b.id === branchId ? 'bg-accent-50 border-accent-300 text-accent-700 font-semibold' : 'bg-white border-slate-200 text-slate-600'}`}>
                {b.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-1 bg-white border border-slate-100 rounded-2xl p-1" role="tablist">
          {[
            { key: 'now', label: 'الدور دلوقتي', count: line.length },
            { key: 'done', label: 'خلصوا النهارده', count: done.length },
          ].map(t => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => pickTab(t.key)}
              className={`flex-1 h-10 rounded-xl text-sm font-semibold transition-colors ${tab === t.key ? 'bg-ink text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              {t.label} <span className="tabular-nums opacity-70">({t.count})</span>
            </button>
          ))}
        </div>

        {tab === 'now' && (
          <>
            {/* Queue clinics: one period at a time, each with its own numbers. */}
            {byTurn && choices.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="الفترة" data-testid="period-tabs">
                {choices.map(c => (
                  <button key={c.start} role="tab" aria-selected={c.start === periodStart} onClick={() => setPickedPeriod(c.start)}
                    className={`flex-shrink-0 px-3 h-10 rounded-xl border text-sm font-semibold ${c.start === periodStart ? 'bg-accent-500 border-accent-500 text-white' : 'bg-white border-slate-200 text-slate-600'}`}>
                    {c.period ? periodName(c.period) : `الساعة ${formatTime12(c.start)}`} <span className="tabular-nums opacity-80">({c.waiting})</span>
                  </button>
                ))}
              </div>
            )}

            {/* First thing on the page: someone walks in without a booking, or asks for their turn. */}
            <div className="flex flex-col sm:flex-row gap-2">
              <button onClick={() => setModal({ appointment: null })}
                className="h-11 px-4 rounded-xl bg-white border-2 border-accent-300 text-sm font-bold text-accent-700 flex items-center justify-center gap-1.5 hover:bg-accent-50 flex-shrink-0">
                <HiOutlinePlus className="w-5 h-5" /> مريض جاي من غير حجز
              </button>
              <div className="relative flex-1 min-w-0">
                <HiOutlineMagnifyingGlass className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="دوره كام؟ ابحث باسم أو رقم موبايل" aria-label="ابحث في الدور"
                  className="w-full h-11 bg-white border border-slate-200 rounded-xl pr-9 pl-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" />
              </div>
            </div>

            {/* Inside now */}
            <div data-testid="inside" className="rounded-2xl bg-ink text-white p-4">
              {inside ? (
                <div className="flex items-center gap-3">
                  <span className="text-4xl font-bold tabular-nums min-w-[3rem] text-center">{inside.queue_number ?? '•'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white/60">جوه دلوقتي</p>
                    <button onClick={() => setModal({ appointment: inside })} className="font-bold text-lg break-words text-right hover:underline">{inside.client_name}</button>
                    <p className="text-xs text-white/60">{inside.services?.name}{inside.services?.name ? ' · ' : ''}من {minutesSince(inside.called_at, now)} د</p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <button onClick={() => setStatus(inside, 'completed', `${inside.client_name} خلص`)} disabled={!!busyId}
                      className="px-3 h-9 rounded-xl bg-white/15 hover:bg-white/25 text-sm font-semibold flex items-center gap-1 disabled:opacity-60">
                      <HiOutlineCheck className="w-4 h-4" /> خلص
                    </button>
                    <button onClick={() => pushBack(inside)} disabled={!!busyId} title={`ما دخلش؟ رجّعه ${PUSH_BACK} أدوار`}
                      className="px-3 h-9 rounded-xl text-xs text-white/70 hover:bg-white/10 disabled:opacity-60">
                      ما دخلش
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-white/70 text-sm py-2">مفيش حد جوه دلوقتي.</p>
              )}
            </div>

            {next ? (
              // One big line to read from across the room; the details stay small under it.
              // Whoever is inside is finished by the same tap.
              <button data-testid="call-next" onClick={() => call(next)} disabled={!!busyId}
                title={inside ? `${inside.client_name} هيخلص و${next.client_name} يدخل` : undefined}
                className="w-full min-h-[60px] py-2 rounded-2xl bg-accent-500 hover:bg-accent-600 text-white flex flex-col items-center justify-center disabled:opacity-60 transition-colors">
                <span className="flex items-center gap-2 text-lg font-bold">
                  <HiOutlineMegaphone className="w-6 h-6" />
                  نادي {label(next)}
                </span>
                {(next.queue_number != null || !next.arrived_at || due) && (
                  <span className="text-xs text-white/85">
                    {[next.queue_number != null && next.client_name, !next.arrived_at && 'لسه ما وصلش'].filter(Boolean).join(' · ')}
                    {due && (
                      <span data-testid="call-tells" className="inline-flex items-center gap-1">
                        {next.queue_number != null || !next.arrived_at ? ' · ' : ''}<FaWhatsapp className="w-3 h-3" /> {due.appt.client_name}
                      </span>
                    )}
                  </span>
                )}
              </button>
            ) : (
              otherTabsWaiting.length ? (
                // Never a silent empty list while patients wait under another tab.
                <button data-testid="other-tabs" onClick={() => setPickedPeriod(otherTabsWaiting[0].start)}
                  className="w-full rounded-2xl border-2 border-amber-300 bg-amber-50 text-amber-800 px-4 py-3 text-sm font-semibold">
                  الفترة دي فاضية. فيه {otherTabsWaiting.reduce((n, c) => n + c.waiting, 0)} مستنيين في تاب تاني، دوس هنا تشوفهم
                </button>
              ) : (
                <p className="text-center text-sm text-slate-400 py-2">{line.length ? 'مفيش حد مستني بعده.' : 'مفيش حد في الدور النهارده.'}</p>
              )
            )}

            <div className="space-y-2" data-testid="waiting">
              {shown.map(a => {
                const ahead = line.indexOf(a)
                const busy = busyId === a.id
                return (
                  <div key={a.id} data-testid="waiting-row" className="bg-white border border-slate-100 rounded-2xl px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="w-9 h-9 rounded-full bg-slate-100 text-ink font-bold flex items-center justify-center tabular-nums flex-shrink-0">{a.queue_number ?? ahead}</span>
                      <div className="flex-1 min-w-0">
                        <button onClick={() => setModal({ appointment: a })} className="font-semibold text-slate-900 break-words text-right hover:underline">{a.client_name}</button>
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500">
                          {a.queue_number == null && <span className="tabular-nums">{formatTimeArabic(a.appointment_time)}</span>}
                          {a.services?.name && <span>{a.queue_number == null ? '· ' : ''}{a.services.name}</span>}
                          <span>· قدامه {ahead} · {formatWait(ahead * minutes)}</span>
                          {a.queue_sort != null && <span className="px-1.5 rounded-md bg-amber-50 text-amber-700">اتأخر</span>}
                          {bookedTwice(a) && <span data-testid="booked-twice" className="px-1.5 rounded-md bg-sky-50 text-sky-700">حاجز مرتين النهارده</span>}
                          {a.queue_notified_at && <span className="px-1.5 rounded-md bg-green-50 text-green-700">اتبعتله</span>}
                        </div>
                      </div>
                      {a.arrived_at
                        ? <button onClick={() => notArrived(a)} disabled={busy} title="اتداست غلط؟ دوس تاني تشيل الوصول"
                            className="text-xs font-semibold px-2 py-1 rounded-lg bg-green-50 text-green-700 flex-shrink-0 disabled:opacity-60">وصل {clock(a.arrived_at)}</button>
                        : <button onClick={() => arrived(a)} disabled={busy}
                            className="text-xs font-semibold px-2.5 h-9 rounded-lg border border-accent-200 text-accent-700 hover:bg-accent-50 flex-shrink-0 disabled:opacity-60">وصل</button>}
                    </div>
                    <div className="flex items-center gap-1.5 mt-2 pr-12">
                      <button onClick={() => sendPlace(a)} disabled={busy} title="ابعتله دوره" aria-label="ابعتله دوره"
                        className="h-9 w-9 flex items-center justify-center rounded-lg border border-green-200 text-green-600 hover:bg-green-50 disabled:opacity-60">
                        <FaWhatsapp className="w-4 h-4" />
                      </button>
                      {a.manage_code && (
                        <button onClick={() => sendLink(a)} title="ابعتله لينك مواعيده" aria-label="ابعتله لينك مواعيده"
                          className="h-9 w-9 flex items-center justify-center rounded-lg border border-accent-200 text-accent-700 hover:bg-accent-50">
                          <HiOutlineLink className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => pushBack(a)} disabled={busy}
                        className="h-9 px-2.5 flex items-center gap-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-60">
                        <HiOutlineArrowUturnDown className="w-3.5 h-3.5" /> رجّعه {PUSH_BACK}
                      </button>
                      <button onClick={() => setStatus(a, 'no_show', `${a.client_name} اتسجل إنه ما جاش`)} disabled={busy}
                        className="h-9 px-2.5 rounded-lg border border-amber-200 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-60">
                        ما جاش
                      </button>
                      {a !== next && (
                        <button onClick={() => call(a)} disabled={busy}
                          className="h-9 px-2.5 mr-auto rounded-lg text-xs font-semibold text-accent-700 hover:bg-accent-50 disabled:opacity-60">
                          نادي
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
              {search && !shown.length && (
                <p className="text-center text-sm text-slate-400 py-3">
                  {inside && (inside.client_name?.includes(search.trim()) || phoneMatches(inside.client_phone, search))
                    ? `${inside.client_name} جوه دلوقتي.`
                    : done.find(a => a.client_name?.includes(search.trim()) || phoneMatches(a.client_phone, search))
                      ? 'خلص النهارده، تلاقيه في «خلصوا النهارده».'
                      : 'مفيش حد بالاسم أو الرقم ده في دور النهارده.'}
                </p>
              )}
            </div>

            <p className="text-xs text-slate-400 text-center">
              الوقت المتوقع محسوب على إن الكشف بياخد حوالي {minutes} دقيقة، وبيتظبط لوحده من الكشوفات الفعلية.
            </p>

            <div className="grid grid-cols-2 gap-2">
              {/* The waiting-room screen (058): open it on the clinic's TV, or copy the link. */}
              <a href={screenPath} target="_blank" rel="noopener noreferrer"
                className="h-11 rounded-xl bg-ink text-white text-sm font-semibold flex items-center justify-center gap-1.5 hover:opacity-90">
                <HiOutlineTv className="w-4 h-4" /> شاشة الدور
              </a>
              <button onClick={copyBookingLink}
                className="h-11 rounded-xl bg-accent-50 border border-accent-200 text-sm font-semibold text-accent-700 flex items-center justify-center gap-1.5 hover:bg-accent-100">
                <HiOutlineClipboard className="w-4 h-4" /> انسخ لينك الحجز
              </button>
            </div>
            <p className="text-[11px] text-slate-400 text-center">
              «شاشة الدور» افتحها على تليفزيون العيادة: بتعرض الأرقام بس من غير أسامي، وعليها كود يمسحه المريض ويتابع دوره من موبايله.
            </p>
          </>
        )}

        {tab === 'done' && (
          <div className="space-y-2" data-testid="done">
            {done.length === 0 && <p className="text-center text-sm text-slate-400 py-6">لسه محدش خلص النهارده.</p>}
            {done.map(a => {
              const took = a.called_at && a.finished_at ? Math.round((new Date(a.finished_at) - new Date(a.called_at)) / 60000) : null
              return (
                <div key={a.id} data-testid="done-row" className="bg-white border border-slate-100 rounded-2xl px-3 py-2.5 flex items-center gap-3">
                  <span className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 font-bold flex items-center justify-center tabular-nums">{a.queue_number ?? '•'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 break-words">{a.client_name}</p>
                    <p className="text-xs text-slate-500">
                      {a.status === 'no_show' ? 'ما جاش' : [
                        a.called_at && `دخل ${clock(a.called_at)}`,
                        a.finished_at && `خرج ${clock(a.finished_at)}`,
                        took != null && `${took} د`,
                      ].filter(Boolean).join(' · ') || 'خلص'}
                    </p>
                  </div>
                  <button onClick={() => setStatus(a, 'confirmed', `${a.client_name} رجع للدور`)} disabled={busyId === a.id}
                    className="text-xs px-2.5 h-9 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60">
                    رجّعه للدور
                  </button>
                </div>
              )
            })}
          </div>
        )}

      </div>

      <AppointmentModal
        open={!!modal}
        onClose={() => setModal(null)}
        businessId={business.id}
        initialDate={date}
        initialTime={modal?.appointment ? null : walkInTime}
        appointment={modal?.appointment || null}
        walkIn={!modal?.appointment}
      />
    </PageWrapper>
  )
}
