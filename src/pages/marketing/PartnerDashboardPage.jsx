import { Link, useNavigate, useParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import toast from 'react-hot-toast'
import { FaWhatsapp } from 'react-icons/fa'
import { HiOutlineArrowRightOnRectangle, HiOutlineCheckCircle } from 'react-icons/hi2'
import Logo from '../../components/marketing/Logo'
import { usePartnerDashboard } from '../../hooks/useGrowth'
import { partnerLink } from '../../lib/growth/links'
import { partnerEarnings } from '../../lib/growth/analytics'
import { PAYOUT_METHODS } from '../../lib/growth/constants'
import { SUPPORT_WHATSAPP } from '../../lib/support'
import { PARTNER_TOKEN_KEY } from './PartnerLoginPage'

/**
 * A partner's own page (/partner/<secret token>, or /partner to log in): the
 * clinics that came through their link, how far each got, and their money.
 * Reads only growth_partner_dashboard() (migration 038), which returns clinic
 * names, statuses and booking counts — no phones, no emails, no patient data,
 * nothing about other partners.
 */

const STATUS = {
  lead: { label: 'لسه ماسجّلتش', tone: 'bg-slate-100 text-slate-600' },
  registered: { label: 'سجّلت، لسه بنتأكد', tone: 'bg-amber-50 text-amber-700' },
  qualified: { label: 'عيادة حقيقية', tone: 'bg-accent-50 text-accent-700' },
  paid: { label: 'اشتركت', tone: 'bg-accent-100 text-accent-800' },
}
const MONEY_STATUS = { pending: 'بتتراجع', approved: 'هتتدفع', paid: 'اتدفعت' }
const KIND = { signup_bonus: 'مكافأة عيادة حقيقية', subscription: 'نسبة الاشتراك' }

const egp = (n) => `${Number(n || 0).toLocaleString('en-EG')} جنيه`
const date = (iso) => (iso ? new Date(iso).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

export default function PartnerDashboardPage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { data, isLoading } = usePartnerDashboard(token)

  function logout() {
    try {
      localStorage.removeItem(PARTNER_TOKEN_KEY)
    } catch {
      // nothing to forget
    }
    navigate('/partner', { replace: true })
  }

  if (isLoading) {
    return <div className="min-h-screen bg-paper flex items-center justify-center"><div className="w-8 h-8 border-4 border-accent-500 border-t-transparent rounded-full animate-spin" /></div>
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center p-6 text-center" dir="rtl">
        <Helmet><title>لوحة الشريك — بسهولة</title><meta name="robots" content="noindex, nofollow" /></Helmet>
        <Logo />
        <p className="mt-6 font-bold text-ink">اللينك ده مش شغال</p>
        <p className="mt-2 text-sm text-ink-soft">ممكن يكون اتغيّر. ادخل برقمك والكود، أو كلّمنا على واتساب.</p>
        <button type="button" onClick={logout} className="mt-4 bg-accent-500 text-white font-bold rounded-xl px-5 py-2.5">دخول الشركاء</button>
      </div>
    )
  }

  const { partner, clinics, commissions, plan_prices: prices } = data
  const link = partnerLink(partner.ref_code)
  const total = (statuses) => commissions.filter((c) => statuses.includes(c.status)).reduce((s, c) => s + Number(c.amount || 0), 0)
  const counts = {
    registered: clinics.filter((c) => c.status !== 'lead').length,
    qualified: clinics.filter((c) => ['qualified', 'paid'].includes(c.status)).length,
    paid: clinics.filter((c) => c.status === 'paid').length,
  }
  const waiting = total(['pending', 'approved'])
  const paidOut = total(['paid'])
  const earnings = partnerEarnings(partner, prices ?? undefined)
  const method = PAYOUT_METHODS.find((m) => m.key === partner.payout_method)?.label

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      toast.success('اللينك اتنسخ')
    } catch {
      toast.error('انسخ اللينك بإيدك')
    }
  }

  const shareText = `أهلاً دكتور 👋 ده «بسهولة»، نظام حجز مواعيد مصري: المرضى بيحجزوا من لينك، والتذكير بالمواعيد بيتبعت على الواتساب بضغطة زر. جرّبه 14 يوم ببلاش من هنا: ${link}`

  return (
    <div className="min-h-screen bg-paper text-ink font-sans" dir="rtl">
      <Helmet>
        <title>{`لوحة ${partner.name} — بسهولة`}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <header className="bg-ink text-white">
        <div className="max-w-3xl mx-auto px-5 py-6">
          <div className="flex items-center justify-between">
            <p className="text-white/70 text-sm">لوحة الشريك</p>
            <button type="button" onClick={logout} className="text-white/70 hover:text-white text-sm inline-flex items-center gap-1"><HiOutlineArrowRightOnRectangle className="w-4 h-4" aria-hidden="true" /> خروج</button>
          </div>
          <h1 className="text-2xl font-extrabold mt-1">أهلاً {partner.name}</h1>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="rounded-xl bg-white/10 px-4 py-3">
              <p className="text-white/70 text-xs">مستني ليك</p>
              <p className="text-xl font-extrabold tabular-nums mt-0.5">{egp(waiting)}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-4 py-3">
              <p className="text-white/70 text-xs">اتدفع ليك</p>
              <p className="text-xl font-extrabold tabular-nums mt-0.5">{egp(paidOut)}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-6 space-y-5">
        {!partner.active && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3">لينكك موقوف حالياً، فالعيادات الجديدة مش هتتحسب عليك. اللي كسبته محفوظ. كلّمنا.</div>
        )}

        <section className="rounded-2xl bg-white border border-rule p-5">
          <p className="text-sm font-bold">لينكك: ابعته لأي عيادة</p>
          <div className="mt-2 flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
            <span className="flex-1 min-w-0 truncate text-sm font-mono" dir="ltr">{link}</span>
            <button type="button" onClick={copy} className="text-sm font-bold text-accent-700">نسخ</button>
          </div>
          <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl">
            <FaWhatsapp className="w-4 h-4" /> ابعته لدكتور على واتساب
          </a>
        </section>

        <section className="rounded-2xl bg-white border border-rule p-5">
          <p className="text-sm font-bold mb-3">هتكسب كام من كل عيادة؟</p>
          <ol className="text-sm space-y-1.5 text-ink-soft leading-relaxed">
            {Number(partner.signup_bonus_egp) > 0 && <li><b className="text-ink tabular-nums">{egp(partner.signup_bonus_egp)}</b> لما العيادة تبقى حقيقية وتشتغل على النظام.</li>}
            {Number(partner.commission_pct) > 0 && <li><b className="text-ink tabular-nums">{Number(partner.commission_pct)}%</b> من أول اشتراك ليها.</li>}
          </ol>
          <div className="grid grid-cols-3 gap-2 mt-3 text-center">
            {earnings.map((e) => (
              <div key={e.months} className="rounded-xl bg-accent-50 py-3 px-1">
                <b className="block tabular-nums text-accent-800">{egp(e.total)}</b>
                <span className="text-xs text-ink-soft">لو اشتركت {e.months === 1 ? 'شهر' : `${e.months} شهور`}</span>
              </div>
            ))}
          </div>
          {Number(partner.commission_pct) > 0 && (
            <p className="text-xs text-ink-soft leading-relaxed mt-3">
              الأرقام دي لعيادة في مصر. لو جبت عيادة من الخليج، ليك نفس النسبة من سعر باقتها هناك محسوب بالجنيه.
            </p>
          )}
        </section>

        <section className="rounded-2xl bg-white border border-rule p-5">
          <p className="text-sm font-bold mb-3">عياداتك</p>
          <div className="grid grid-cols-3 gap-3 text-center mb-4">
            {[['سجّلوا', counts.registered], ['حقيقية', counts.qualified], ['اشتركوا', counts.paid]].map(([label, n]) => (
              <div key={label} className="rounded-xl bg-paper py-3">
                <p className="text-2xl font-extrabold tabular-nums">{n}</p>
                <p className="text-xs text-ink-soft mt-0.5">{label}</p>
              </div>
            ))}
          </div>
          {clinics.length === 0 ? (
            <p className="text-sm text-ink-soft">لسه مفيش. ابعت لينكك لأول دكتور، وهتظهر هنا أول ما يسجّل.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {clinics.map((c, i) => (
                <li key={i} className="py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{c.name}</p>
                      <p className="text-xs text-ink-soft">{date(c.joined_at)}</p>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap ${STATUS[c.status].tone}`}>{STATUS[c.status].label}</span>
                  </div>
                  {c.progress && <Progress progress={c.progress} />}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl bg-white border border-rule p-5">
          <p className="text-sm font-bold mb-3">فلوسك</p>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-xl bg-amber-50 py-3"><b className="block text-base tabular-nums">{egp(total(['pending']))}</b>بتتراجع</div>
            <div className="rounded-xl bg-ink/5 py-3"><b className="block text-base tabular-nums">{egp(total(['approved']))}</b>هتتدفع</div>
            <div className="rounded-xl bg-accent-50 py-3"><b className="block text-base tabular-nums">{egp(paidOut)}</b>اتدفعت</div>
          </div>
          {commissions.length > 0 && (
            <ul className="mt-4 divide-y divide-slate-100 text-sm">
              {commissions.map((c, i) => (
                <li key={i} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{c.clinic}</p>
                    <p className="text-xs text-ink-soft">{KIND[c.kind]} · {date(c.created_at)}</p>
                  </div>
                  <div className="text-left flex-shrink-0">
                    <p className="font-bold tabular-nums">{egp(c.amount)}</p>
                    <p className="text-xs text-ink-soft">{MONEY_STATUS[c.status]}{c.status === 'paid' && c.paid_at ? ` ${date(c.paid_at)}` : ''}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-ink-soft">
            {method ? <>بنحوّلك على {method} <span dir="ltr">{partner.payout_account}</span>. لو عايز تغيّرها كلّمنا.</> : 'لسه ماقلتلناش تحب تستلم فلوسك إزاي. كلّمنا على واتساب.'}
          </p>
        </section>

        <section className="rounded-2xl bg-slate-50 border border-slate-100 p-5 text-sm text-ink-soft leading-relaxed">
          <p className="font-bold text-ink mb-1">إمتى العيادة بتتحسب «حقيقية»؟</p>
          لما يبقى عندها حجوزات فعلية من مرضى مختلفين على النظام، أو لما تشترك، أو لما فريقنا يكلّمها ويتأكد. ده بيحميك وبيحمينا من التسجيلات الوهمية، وأول ما تتأكد مكافأتك بتظهر هنا.
          عيادتك إنت أو حساب برقمك مابيتحسبوش.
        </section>

        <p className="text-center text-xs text-ink-soft">
          عندك سؤال؟{' '}
          <a href={`https://wa.me/${SUPPORT_WHATSAPP}`} target="_blank" rel="noopener noreferrer" className="font-bold text-accent-700">كلّمنا على واتساب</a>
          {' '}· اللينك ده خاص بيك، ماتبعتهوش لحد. <Link to="/" className="underline">بسهولة</Link>
        </p>
      </main>
    </div>
  )
}

/** How far a signed-up clinic is from counting as real. */
function Progress({ progress }) {
  const { appointments, clients, need_appointments: needA, need_clients: needC } = progress
  const pct = Math.min(100, Math.round((Math.min(appointments / needA, clients / needC)) * 100))
  const done = appointments >= needA && clients >= needC
  return (
    <div className="mt-2">
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full bg-accent-500 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-ink-soft mt-1">
        {done
          ? <><HiOutlineCheckCircle className="inline-block w-4 h-4 align-[-3px] ml-1 text-accent-600" aria-hidden="true" />وصلت للعدد، بنراجعها</>
          : <>{appointments} من {needA} حجوزات · {clients} من {needC} عملاء مختلفين. شجّعهم يبعتوا لينك الحجز لمرضاهم.</>}
      </p>
    </div>
  )
}
