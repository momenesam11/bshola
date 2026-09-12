import { HiOutlineCheck, HiOutlineMinus } from 'react-icons/hi2'
import { Section, SectionHead } from './Section'

/**
 * Honest comparison against a *category*, never a named competitor — we have
 * no audited data on any specific product's terms, and naming one invites a
 * claim we can't evidence.
 *
 * The table deliberately includes two rows where the answer for بسهولة is
 * "no". A comparison where one column is all ticks reads as marketing; one
 * that admits what it doesn't do reads as information — and both rows are
 * verified absences (see MARKETING_CLAIMS.md §8).
 */

const ROWS = [
  {
    aspect: 'عمولة على كل حجز',
    us: { value: 'مفيش', good: true },
    them: { value: 'نسبة من كل حجز أو رسوم لكل موعد', good: false },
  },
  {
    aspect: 'الاشتراك',
    us: { value: 'مبلغ ثابت بالجنيه المصري', good: true },
    them: { value: 'بالدولار، بيتغير مع سعر الصرف', good: false },
  },
  {
    aspect: 'العربية واتجاه RTL',
    us: { value: 'النظام مبني عربي من الأساس', good: true },
    them: { value: 'ترجمة فوق واجهة إنجليزية', good: false },
  },
  {
    aspect: 'قناة التذكير',
    us: { value: 'واتساب من رقمك', good: true },
    them: { value: 'إيميل أو SMS مدفوع', good: false },
  },
  {
    aspect: 'ملف طبي وروشتة',
    us: { value: 'موجود للعيادات', good: true },
    them: { value: 'غالباً منتج منفصل بسعر تاني', good: false },
  },
  {
    aspect: 'الدعم',
    us: { value: 'واتساب بالعامية المصرية', good: true },
    them: { value: 'تذاكر بالإنجليزية بفرق توقيت', good: false },
  },
  {
    aspect: 'الدفع الإلكتروني داخل صفحة الحجز',
    us: { value: 'مش متوفر', good: false },
    them: { value: 'متوفر في بعضها', good: true },
  },
  {
    aspect: 'تطبيق موبايل من الستور',
    us: { value: 'مش متوفر — ويب بيشتغل على الموبايل', good: false },
    them: { value: 'متوفر في بعضها', good: true },
  },
]

function Cell({ cell }) {
  const Icon = cell.good ? HiOutlineCheck : HiOutlineMinus
  return (
    <div className="flex items-start gap-2">
      <Icon
        className={`w-4 h-4 flex-shrink-0 mt-[3px] ${cell.good ? 'text-accent-600' : 'text-ink-soft/45'}`}
        aria-hidden="true"
      />
      <span className={`text-[13px] leading-[1.7] ${cell.good ? 'text-ink font-semibold' : 'text-ink-soft'}`}>
        {cell.value}
      </span>
    </div>
  )
}

export default function ComparisonTable({ id }) {
  return (
    <Section id={id} tone="surface">
      <SectionHead
        title="ليه بسهولة مش منصة حجز عالمية"
        lead="المنصات العالمية شغالة وكبيرة — بس موديل الفلوس واللغة بتاعتها مش مبنية للسوق المصري. الجدول ده بيقول الفرق، وبيقول كمان اللي مش عندنا."
      />

      <div className="mt-8 overflow-x-auto -mx-5 px-5 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[600px] border-collapse">
          <caption className="sr-only">
            مقارنة بين بسهولة وفئة منصات الحجز العالمية
          </caption>
          <thead>
            <tr className="border-b-2 border-ink">
              <th scope="col" className="text-right py-3 pl-4 text-[12px] font-bold text-ink-soft w-[28%]">
                الجانب
              </th>
              <th scope="col" className="text-right py-3 px-4 text-[13px] font-bold text-ink w-[36%]">
                بسهولة
              </th>
              <th scope="col" className="text-right py-3 px-4 text-[13px] font-bold text-ink-soft w-[36%]">
                منصات الحجز العالمية
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.aspect} className="border-b border-rule last:border-b-0">
                <th scope="row" className="text-right align-top py-4 pl-4 text-[13px] font-bold text-ink">
                  {row.aspect}
                </th>
                <td className="align-top py-4 px-4 bg-accent-50/40">
                  <Cell cell={row.us} />
                </td>
                <td className="align-top py-4 px-4">
                  <Cell cell={row.them} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-5 text-[12px] text-ink-soft/75 leading-relaxed max-w-[64ch]">
        المقارنة بفئة المنصات العالمية عموماً ومش بمنتج بالاسم؛ شروط كل منصة وأسعارها بتتغير،
        فراجعها من موقعها قبل أي قرار.
      </p>
    </Section>
  )
}
