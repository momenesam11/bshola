import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Seo from '../../components/seo/Seo'
import Nav from '../../components/marketing/Nav'
import Footer from '../../components/marketing/Footer'
import { Section, SectionHead } from '../../components/marketing/Section'
import LeadCaptureForm from '../../components/marketing/LeadCaptureForm'
import { CALCULATOR_META } from '../../content/pageMeta'
import { breadcrumbSchema, organizationSchema } from '../../lib/seo'

/**
 * "How much do no-shows cost your clinic?" — a free tool that ranks for the
 * question clinic owners actually search, and turns the answer into a lead.
 *
 * Every number on the result comes from what the visitor typed; the page
 * makes no claim about how much Beshola reduces no-shows (MARKETING_CLAIMS.md
 * §8 forbids result percentages we can't evidence).
 */

const FIELDS = [
  { key: 'perDay', label: 'كام ميعاد عندك في اليوم؟', min: 1, max: 300, step: 1, suffix: 'ميعاد' },
  { key: 'days', label: 'كام يوم شغل في الشهر؟', min: 1, max: 31, step: 1, suffix: 'يوم' },
  { key: 'noShowRate', label: 'من كل 100 ميعاد، كام واحد مابيجيش ومابيعتذرش؟', min: 0, max: 60, step: 1, suffix: 'من 100' },
  { key: 'price', label: 'متوسط سعر الكشف / الجلسة', min: 0, max: 20000, step: 50, suffix: 'جنيه' },
]

// Western digits, like the inputs next to them and the pricing cards.
const fmt = (n) => Math.round(n).toLocaleString('en-EG')

export default function LossCalculatorPage() {
  const [v, setV] = useState({ perDay: 20, days: 24, noShowRate: 10, price: 300 })
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value === '' ? '' : Number(e.target.value) }))

  const r = useMemo(() => {
    const n = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0)
    const missedPerMonth = n(v.perDay) * n(v.days) * (n(v.noShowRate) / 100)
    const monthly = missedPerMonth * n(v.price)
    return { missedPerMonth, monthly, yearly: monthly * 12 }
  }, [v])

  return (
    <div className="min-h-screen bg-paper text-ink font-sans antialiased" dir="rtl">
      <Seo
        title={CALCULATOR_META.title}
        description={CALCULATOR_META.description}
        path={CALCULATOR_META.path}
        schemas={[
          organizationSchema(),
          breadcrumbSchema([{ name: 'الرئيسية', path: '/' }, { name: 'حاسبة خسارة الغياب' }]),
        ]}
      />
      <Nav />

      <Section tone="paper">
        <SectionHead
          title="عيادتك بتخسر كام في الشهر من المواعيد اللي أصحابها مابيجوش؟"
          lead="الميعاد اللي صاحبه مجاش كان محجوز، ومحدش تاني قدر ياخده. حط أرقام عيادتك واعرف الرقم الحقيقي — الحساب كله على جهازك."
        />

        <div className="mt-8 grid lg:grid-cols-2 gap-6 items-start">
          <div className="rounded-2xl bg-white border border-rule p-6 space-y-5">
            {FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="block text-[14px] font-bold text-ink mb-2">{f.label}</span>
                <div className="flex items-center gap-3">
                  <input type="range" min={f.min} max={f.max} step={f.step} value={v[f.key] || 0} onChange={set(f.key)} className="flex-1 accent-emerald-600" />
                  <input type="number" min={f.min} max={f.max} step={f.step} value={v[f.key]} onChange={set(f.key)}
                    className="w-24 rounded-lg border border-rule px-2.5 py-2 text-center tabular-nums" aria-label={f.label} />
                  <span className="text-[12px] text-ink-soft w-14">{f.suffix}</span>
                </div>
              </label>
            ))}
          </div>

          <div className="rounded-2xl bg-ink text-white p-6">
            <p className="text-[13px] text-white/70">حسب أرقامك</p>
            <p className="mt-3 text-[15px]">مواعيد ضايعة في الشهر: <b className="tabular-nums">{fmt(r.missedPerMonth)}</b></p>
            <p className="mt-4 text-[13px] text-white/70">خسارة الشهر</p>
            <p className="text-[40px] font-extrabold text-accent-400 leading-tight tabular-nums">{fmt(r.monthly)} <span className="text-[18px]">جنيه</span></p>
            <p className="mt-1 text-[14px] text-white/80">يعني حوالي <b className="tabular-nums">{fmt(r.yearly)}</b> جنيه في السنة</p>
            <div className="mt-6 pt-5 border-t border-white/10">
              <p className="text-[14px] text-white/85 mb-3 leading-relaxed">
                عايز نكلّمك نشوف إزاي تقلل الرقم ده في عيادتك؟ سيب رقمك:
              </p>
              <LeadCaptureForm
                source="loss_calculator"
                details={{ appointments_per_day: v.perDay, working_days: v.days, no_show_rate: v.noShowRate, avg_price: v.price, monthly_loss: Math.round(r.monthly) }}
                submitLabel="كلّموني"
              />
            </div>
          </div>
        </div>
      </Section>

      <Section tone="surface">
        <SectionHead title="إزاي العيادات بتقلل الغياب؟" />
        <div className="mt-6 grid sm:grid-cols-3 gap-4 text-[14.5px] leading-[1.85] text-ink-soft">
          <div className="rounded-2xl border border-rule p-5">
            <h3 className="font-bold text-ink mb-1.5">تذكير قبل الميعاد</h3>
            المريض بينسى. رسالة واتساب قبلها بيوم بتفكّره، واللي مش هييجي بيعتذر بدري فتقدر تدّي الميعاد لحد تاني.
          </div>
          <div className="rounded-2xl border border-rule p-5">
            <h3 className="font-bold text-ink mb-1.5">حجز أسهل = حجز أجدّ</h3>
            لما المريض يختار الميعاد بنفسه من المواعيد الفاضية، بيختار وقت يناسبه فعلاً بدل ميعاد اتفرض عليه على التليفون.
          </div>
          <div className="rounded-2xl border border-rule p-5">
            <h3 className="font-bold text-ink mb-1.5">قائمة انتظار</h3>
            لو حد اعتذر، أول واحد في قائمة الانتظار ياخد مكانه — بدل ما الكرسي يفضل فاضي.
          </div>
        </div>
        <p className="mt-6 text-[14.5px] text-ink-soft leading-[1.85]">
          <b className="text-ink">بسهولة</b> بيعمل التلاتة: يجهّز رسايل تذكير كل مواعيد بكرا تبعتها من رقم العيادة بضغطة زر،
          وصفحة حجز أونلاين باسم عيادتك، وقائمة انتظار. <Link to="/register" className="text-accent-700 font-bold underline">جرّبه 14 يوم ببلاش</Link>.
        </p>
      </Section>

      <Footer />
    </div>
  )
}
