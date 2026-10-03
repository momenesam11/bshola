import { useParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import toast from 'react-hot-toast'
import { FaWhatsapp } from 'react-icons/fa'
import Logo from '../../components/marketing/Logo'
import { usePartnerDashboard } from '../../hooks/useGrowth'
import { partnerLink } from '../../lib/growth/links'
import { SUPPORT_WHATSAPP } from '../../lib/support'

/**
 * A partner's own page (/partner/<secret token>): the clinics that came
 * through their link, how far each got, and their money. Reads only
 * growth_partner_dashboard() (migration 033), which returns clinic names and
 * statuses — no phones, no emails, nothing about other partners.
 */

const STATUS = {
  lead: { label: 'لسه ماسجّلتش', tone: 'bg-slate-100 text-slate-600' },
  registered: { label: 'سجّلت — مستنيين نتأكد إنها حقيقية', tone: 'bg-amber-50 text-amber-700' },
  qualified: { label: 'عيادة حقيقية', tone: 'bg-accent-50 text-accent-700' },
  paid: { label: 'اشتركت', tone: 'bg-accent-100 text-accent-800' },
}
const MONEY_STATUS = {
  pending: 'بتتراجع',
  approved: 'متوافق عليها — هتتدفع',
  paid: 'اتدفعت',
}
const KIND = { signup_bonus: 'مكافأة عيادة حقيقية', subscription: 'نسبة الاشتراك' }

const egp = (n) => `${Number(n || 0).toLocaleString('en-EG')} جنيه`
const date = (iso) => (iso ? new Date(iso).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

export default function PartnerDashboardPage() {
  const { token } = useParams()
  const { data, isLoading } = usePartnerDashboard(token)

  if (isLoading) {
    return <div className="min-h-screen bg-paper flex items-center justify-center"><div className="w-8 h-8 border-4 border-accent-500 border-t-transparent rounded-full animate-spin" /></div>
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center p-6 text-center" dir="rtl">
        <Helmet><title>لوحة الشريك — بسهولة</title><meta name="robots" content="noindex, nofollow" /></Helmet>
        <Logo />
        <p className="mt-6 font-bold text-ink">اللينك ده مش شغال</p>
        <p className="mt-2 text-sm text-ink-soft">اتأكد إنك نسخته كامل، أو كلّمنا على واتساب.</p>
      </div>
    )
  }

  const { partner, clinics, commissions } = data
  const link = partnerLink(partner.ref_code)
  const total = (statuses) => commissions.filter((c) => statuses.includes(c.status)).reduce((s, c) => s + Number(c.amount || 0), 0)
  const counts = {
    registered: clinics.filter((c) => c.status !== 'lead').length,
    qualified: clinics.filter((c) => ['qualified', 'paid'].includes(c.status)).length,
    paid: clinics.filter((c) => c.status === 'paid').length,
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      toast.success('اللينك اتنسخ')
    } catch {
      toast.error('انسخ اللينك بإيدك')
    }
  }

  const shareText = `أهلاً دكتور 👋 ده «بسهولة» — نظام حجز مواعيد مصري: المرضى بيحجزوا من لينك، والتذكير بالمواعيد بيتبعت على الواتساب بضغطة زر. جرّبه 14 يوم ببلاش من هنا: ${link}`

  return (
    <div className="min-h-screen bg-paper text-ink font-sans" dir="rtl">
      <Helmet>
        <title>{`لوحة ${partner.name} — بسهولة`}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <header className="bg-ink text-white">
        <div className="max-w-3xl mx-auto px-5 py-6">
          <p className="text-white/60 text-sm">لوحة الشريك</p>
          <h1 className="text-2xl font-extrabold mt-1">أهلاً {partner.name}</h1>
          <p className="text-white/80 text-sm mt-2 leading-relaxed">
            {Number(partner.signup_bonus_egp) > 0 && <>ليك <b>{egp(partner.signup_bonus_egp)}</b> لكل عيادة حقيقية تسجّل من لينكك. </>}
            {Number(partner.commission_pct) > 0 && <>و<b>{Number(partner.commission_pct)}%</b> من أول اشتراك ليها.</>}
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-6 space-y-5">
        {!partner.active && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3">اللينك ده موقوف حالياً — كلّمنا.</div>
        )}

        <section className="rounded-2xl bg-white border border-rule p-5">
          <p className="text-sm font-bold">لينكك — ابعته لأي عيادة</p>
          <div className="mt-2 flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
            <span className="flex-1 min-w-0 truncate text-sm font-mono" dir="ltr">{link}</span>
            <button type="button" onClick={copy} className="text-sm font-bold text-accent-700">نسخ</button>
          </div>
          <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl">
            <FaWhatsapp className="w-4 h-4" /> ابعته لدكتور على واتساب
          </a>
        </section>

        <section className="grid grid-cols-3 gap-3 text-center">
          {[['سجّلوا', counts.registered], ['حقيقية', counts.qualified], ['اشتركوا', counts.paid]].map(([label, n]) => (
            <div key={label} className="rounded-2xl bg-white border border-rule py-4">
              <p className="text-2xl font-extrabold tabular-nums">{n}</p>
              <p className="text-xs text-ink-soft mt-1">{label}</p>
            </div>
          ))}
        </section>

        <section className="rounded-2xl bg-white border border-rule p-5">
          <p className="text-sm font-bold mb-3">فلوسك</p>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-xl bg-amber-50 py-3"><b className="block text-base tabular-nums">{egp(total(['pending']))}</b>بتتراجع</div>
            <div className="rounded-xl bg-ink/5 py-3"><b className="block text-base tabular-nums">{egp(total(['approved']))}</b>هتتدفع</div>
            <div className="rounded-xl bg-accent-50 py-3"><b className="block text-base tabular-nums">{egp(total(['paid']))}</b>اتدفعت</div>
          </div>
          {commissions.length > 0 && (
            <ul className="mt-4 divide-y divide-slate-100 text-sm">
              {commissions.map((c, i) => (
                <li key={i} className="py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{c.clinic}</p>
                    <p className="text-xs text-ink-soft">{KIND[c.kind]} · {date(c.created_at)}</p>
                  </div>
                  <div className="text-left">
                    <p className="font-bold tabular-nums">{egp(c.amount)}</p>
                    <p className="text-[12.5px] text-ink-soft">{MONEY_STATUS[c.status]}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl bg-white border border-rule p-5">
          <p className="text-sm font-bold mb-3">العيادات اللي جت من لينكك</p>
          {clinics.length === 0 ? (
            <p className="text-sm text-ink-soft">لسه مفيش — ابعت لينكك لأول دكتور.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {clinics.map((c, i) => (
                <li key={i} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                  <div>
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-xs text-ink-soft">{date(c.joined_at)}</p>
                  </div>
                  <span className={`text-[12.5px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${STATUS[c.status].tone}`}>{STATUS[c.status].label}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl bg-slate-50 border border-slate-100 p-5 text-sm text-ink-soft leading-relaxed">
          <p className="font-bold text-ink mb-1">إمتى العيادة بتتحسب «حقيقية»؟</p>
          لما يبقى عندها حجوزات فعلية من مرضى مختلفين على النظام، أو لما فريقنا يكلّمها ويتأكد. ده بيحميك وبيحمينا من التسجيلات الوهمية،
          وأول ما تتأكد مكافأتك بتظهر هنا.
        </section>

        <p className="text-center text-xs text-ink-soft">
          عندك سؤال؟{' '}
          <a href={`https://wa.me/${SUPPORT_WHATSAPP}`} target="_blank" rel="noopener noreferrer" className="font-bold text-accent-700">كلّمنا على واتساب</a>
          {' '}· اللينك ده خاص بيك، ماتبعتهوش لحد.
        </p>
      </main>
    </div>
  )
}
