import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useQuery } from '@tanstack/react-query'
import { HiOutlineArrowsPointingOut } from 'react-icons/hi2'
import { supabase } from '../../lib/supabase'
import { formatTimeArabic } from '../../lib/whatsapp'
import { formatWait, screenPlaceText } from '../../lib/queue'
import { periodName } from '../../lib/queueBooking'
import QrCode from '../../components/ui/QrCode'
import AnimatedNumber from '../../components/ui/AnimatedNumber'

// /q/<clinic>: the waiting-room screen (migration 058). On a TV in the clinic:
// the number inside and who is next, big enough to read across the room, with
// a QR code to the same page. On a phone: the same, and "what's my number?"
// gives how many are ahead and about how long. Numbers only, never names.

// Every 3 s while the screen is in view, so a call shows almost at once;
// slower when the tab is hidden (a phone in a pocket).
const REFRESH_MS = 3_000
const HIDDEN_REFRESH_MS = 15_000
const MY_NUMBER_KEY = 'beshola_my_turn'

function useScreen(ref, branchId) {
  return useQuery({
    queryKey: ['queue-screen', ref, branchId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('public_queue_screen', { p_ref: ref, p_branch_id: branchId || null })
      if (error) throw error
      return data
    },
    refetchInterval: () => (typeof document !== 'undefined' && document.hidden ? HIDDEN_REFRESH_MS : REFRESH_MS),
    refetchIntervalInBackground: true,
    retry: 1,
  })
}

// A turn as shown: its number, or for a clinic that books by time, its time.
function turnText(t, mode) {
  if (!t) return null
  return mode === 'queue' && t.number != null ? String(t.number) : formatTimeArabic(t.time)
}

function readMine(ref) {
  try { return JSON.parse(localStorage.getItem(MY_NUMBER_KEY) || '{}')[ref] || '' } catch { return '' }
}
function storeMine(ref, value) {
  try {
    const all = JSON.parse(localStorage.getItem(MY_NUMBER_KEY) || '{}')
    all[ref] = value
    localStorage.setItem(MY_NUMBER_KEY, JSON.stringify(all))
  } catch { /* not remembered */ }
}

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(t)
  }, [])
  return <span className="tabular-nums">{formatTimeArabic(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)}</span>
}

function Message({ title, text }) {
  return (
    <div className="min-h-screen bg-ink text-white flex items-center justify-center p-6 text-center" dir="rtl">
      <div className="space-y-2">
        <p className="text-xl font-bold">{title}</p>
        {text && <p className="text-white/70">{text}</p>}
      </div>
    </div>
  )
}

export default function QueueScreen() {
  const { ref } = useParams()
  const [params] = useSearchParams()
  const branchId = params.get('b')
  const { data, isLoading, isError } = useScreen(ref, branchId)
  const [mine, setMine] = useState(() => readMine(ref))
  const [myPeriod, setMyPeriod] = useState(null)

  if (isLoading) return <Message title="جاري التحميل..." />
  if (isError || !data || data.error) {
    return <Message title="الشاشة دي مش شغالة" text="اتأكد من اللينك، أو اسأل العيادة." />
  }

  const { mode, inside, line = [], minutes, note, periods = [], waiting = [] } = data
  // Whoever is here goes first (065): numbers that haven't come don't show as
  // next. When nobody was marked «وصل», the line in order, as before.
  const here = line.filter(t => t.arrived)
  const upNext = here.length ? here : line
  const next = upNext[0]
  const after = upNext.slice(1, 4)
  const pageUrl = typeof window !== 'undefined' ? window.location.href.split('#')[0] : ''
  const current = periods.find(p => p.start === data.period_start) || null
  const nameOf = (start) => { const p = periods.find(x => x.start === start); return p ? periodName(p) : '' }
  // Each period numbers from 1, so with more than one the patient says which.
  const pickPeriod = periods.length > 1
  const lookPeriod = pickPeriod ? (periods.some(p => p.start === myPeriod) ? myPeriod : data.period_start) : null

  // "What's my number?" (queue clinics): place in line, or inside, or not today.
  const n = Number(mine)
  let myPlace = null
  if (mode === 'queue' && mine && Number.isInteger(n) && n > 0) {
    const samePeriod = (t) => !lookPeriod || !t.period || t.period === lookPeriod
    if (inside?.number === n && samePeriod(inside)) myPlace = { inside: true }
    else {
      const entry = waiting.find(t => t.number === n && samePeriod(t))
      myPlace = entry ? { ...screenPlaceText(entry, inside), ahead: entry.ahead } : { missing: true }
    }
  }

  function fullscreen() {
    document.documentElement.requestFullscreen?.().catch(() => {})
  }

  return (
    <div data-testid="queue-screen" className="min-h-screen bg-ink text-white flex flex-col" dir="rtl">
      <Helmet>
        <title>{`الدور — ${data.name}`}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <header className="flex items-center gap-3 px-4 lg:px-10 py-3 lg:py-6 border-b border-white/10">
        {data.logo_url && <img src={data.logo_url} alt="" className="w-10 h-10 lg:w-16 lg:h-16 rounded-xl object-cover bg-white" />}
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-lg lg:text-4xl break-words">{data.name}</h1>
          {(data.branches?.length > 1 && data.branch || current) && (
            <p data-testid="screen-period" className="text-sm lg:text-xl text-white/60">
              {[data.branches?.length > 1 && data.branch?.name, current && periodName(current)].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <span className="text-lg lg:text-4xl font-bold text-white/80"><Clock /></span>
        <button onClick={fullscreen} aria-label="ملء الشاشة" title="ملء الشاشة"
          className="hidden lg:flex p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10">
          <HiOutlineArrowsPointingOut className="w-6 h-6" />
        </button>
      </header>

      {/* The desk's note (065), e.g. when the next period starts. */}
      {note && (
        <div data-testid="screen-note" className="mx-4 lg:mx-10 mt-4 lg:mt-8 rounded-2xl bg-amber-400 text-ink px-4 lg:px-8 py-3 lg:py-5 text-center font-bold text-lg lg:text-4xl break-words">
          {note}
        </div>
      )}

      <main className="flex-1 grid lg:grid-cols-2 gap-3 lg:gap-8 p-4 lg:p-10">
        {/* Inside now */}
        <section className="relative rounded-3xl bg-white/5 border border-white/10 flex flex-col items-center justify-center py-6 lg:py-0">
          {/* Keyed by who is inside, so each new call replays the flash (the
              card itself stays mounted, so the number still counts up). */}
          {inside && <span key={turnText(inside, mode)} aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-3xl animate-enter-flash" />}
          <p className="text-base lg:text-4xl text-white/70 font-semibold">جوه دلوقتي</p>
          <p className="font-bold leading-none tabular-nums my-2" style={{ fontSize: 'min(34vw, 32vh)' }}>
            <AnimatedNumber testId="screen-inside" value={turnText(inside, mode) || '—'} />
          </p>
          {!inside && <p className="text-sm lg:text-2xl text-white/50">{line.length ? 'الكشف هيبدأ قريب' : 'مفيش حد في الدور دلوقتي'}</p>}
        </section>

        {/* Next */}
        <section className="rounded-3xl bg-accent-500 flex flex-col items-center justify-center py-6 lg:py-0">
          <p className="text-base lg:text-4xl font-semibold text-white/90">اللي عليه الدور</p>
          <p className="font-bold leading-none tabular-nums my-2" style={{ fontSize: 'min(24vw, 22vh)' }}>
            <AnimatedNumber testId="screen-next" value={turnText(next, mode) || '—'} />
          </p>
          {/* Still here from the period before the one on screen. */}
          {next?.period && current && next.period !== current.start && (
            <p className="text-sm lg:text-2xl text-white/80 -mt-1 mb-1">من {nameOf(next.period)}</p>
          )}
          {after.length > 0 && (
            <div className="flex items-center gap-2 lg:gap-4 mt-1" data-testid="screen-after">
              <span className="text-sm lg:text-2xl text-white/80">بعده</span>
              {after.map((t, i) => (
                <span key={i} className="px-3 lg:px-5 py-1 lg:py-2 rounded-xl bg-white/20 text-lg lg:text-4xl font-bold tabular-nums">{turnText(t, mode)}</span>
              ))}
            </div>
          )}
          <p className="text-sm lg:text-2xl text-white/80 mt-3">مستنيين: <b className="tabular-nums">{line.length}</b></p>
        </section>
      </main>

      {/* Phone: what's my number. */}
      {mode === 'queue' && (
        <section className="lg:hidden px-4 pb-4 space-y-2">
          {pickPeriod && (
            <div className="flex gap-2 overflow-x-auto" role="radiogroup" aria-label="فترتك">
              {periods.map(p => (
                <button key={p.start} role="radio" aria-checked={p.start === lookPeriod} onClick={() => setMyPeriod(p.start)}
                  className={`flex-shrink-0 px-3 h-9 rounded-xl text-sm font-semibold border ${p.start === lookPeriod ? 'bg-white text-ink border-white' : 'border-white/30 text-white/80'}`}>
                  {periodName(p)}
                </button>
              ))}
            </div>
          )}
          <label htmlFor="my-number" className="block text-sm text-white/80">رقمك كام؟</label>
          <input id="my-number" value={mine} inputMode="numeric" dir="ltr" placeholder="مثلاً 7"
            onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 4); setMine(v); storeMine(ref, v) }}
            className="w-full h-12 rounded-xl bg-white text-ink text-center text-xl font-bold focus:outline-none focus:ring-2 focus:ring-accent-400" />
          {myPlace && (
            <div data-testid="my-place" className="rounded-xl bg-white text-ink px-4 py-3 text-center">
              {myPlace.inside && <p className="font-bold text-lg">دورك جوه دلوقتي، اتفضل</p>}
              {myPlace.missing && <p className="text-sm">الرقم ده مش في دور النهارده، أو خلص. اسأل العيادة.</p>}
              {myPlace.ahead != null && (
                <>
                  <p className="font-bold text-lg">{myPlace.title}</p>
                  {myPlace.ahead > 0 && minutes > 0 && <p className="text-sm text-slate-600">هتدخل بعد حوالي {formatWait(myPlace.ahead * minutes).replace('≈ ', '')}</p>}
                  {myPlace.note && <p data-testid="my-coming" className="text-sm text-slate-700 mt-1">{myPlace.note}</p>}
                  {myPlace.tell && <p className="text-sm text-accent-700 font-semibold mt-1">{myPlace.tell}</p>}
                </>
              )}
            </div>
          )}
          <p className="text-xs text-white/50 text-center">الصفحة بتتحدث لوحدها أول بأول</p>
        </section>
      )}

      {/* TV: a QR code so patients follow from their phones. */}
      <footer className="hidden lg:flex items-center gap-6 px-10 pb-8">
        <div className="bg-white rounded-2xl p-3"><QrCode value={pageUrl} size={150} /></div>
        <div>
          <p className="text-3xl font-bold">امسح الكود وتابع دورك من موبايلك</p>
          <p className="text-xl text-white/60 mt-1">من غير تطبيق، والصفحة بتتحدث لوحدها.</p>
        </div>
        <p className="mr-auto text-white/40 text-lg">بسهولة</p>
      </footer>
      <p className="lg:hidden text-center text-[12px] text-white/40 pb-4">معمولة بـ <a href="/" className="underline">بسهولة</a></p>
    </div>
  )
}
