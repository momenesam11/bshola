import { useState } from 'react'
import {
  HiOutlineCalendarDays,
  HiOutlineDevicePhoneMobile,
  HiOutlineDocumentText,
  HiOutlineChartBarSquare,
  HiOutlineUsers,
} from 'react-icons/hi2'
import BookingPhoneDemo from './BookingPhoneDemo'
import { IllustrativeNote, Section, SectionHead } from './Section'

/**
 * Interactive product tour.
 *
 * Each panel is the real interface rebuilt in markup — same labels, same
 * status vocabulary, same column order as the app — rather than a screenshot
 * we don't have or a mockup we'd have to invent. Every label below is quoted
 * from the source it names in the comment, so the tour can't drift from the
 * product without someone noticing.
 *
 * Switching is pure state: no reload, no fetch, nothing to wait for.
 */

// Status vocabulary: src/utils/constants.js STATUS_CONFIG
const APPOINTMENTS = [
  { time: '10:00 ص', name: 'منى سعيد', service: 'كشف', status: 'مؤكد', tone: 'emerald' },
  { time: '10:30 ص', name: 'أحمد فؤاد', service: 'متابعة', status: 'مكتمل', tone: 'blue' },
  { time: '11:00 ص', name: 'سلمى حسن', service: 'تنظيف أسنان', status: 'مؤكد', tone: 'emerald' },
  { time: '11:30 ص', name: 'كريم عادل', service: 'كشف', status: 'لم يحضر', tone: 'orange' },
  { time: '12:30 م', name: 'هبة مصطفى', service: 'حشو', status: 'ملغي', tone: 'red' },
]

const STATUS_TONES = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  blue: 'bg-blue-50 text-blue-700 border-blue-100',
  orange: 'bg-orange-50 text-orange-700 border-orange-100',
  red: 'bg-red-50 text-red-700 border-red-100',
}

// Segment vocabulary and thresholds: src/hooks/useClients.js:6-10
const CLIENTS = [
  { name: 'منى سعيد', last: 'آخر زيارة: 12 يوم', visits: 9, segment: 'منتظم' },
  { name: 'أحمد فؤاد', last: 'آخر زيارة: 44 يوم', visits: 4, segment: 'فاتر' },
  { name: 'كريم عادل', last: 'آخر زيارة: 97 يوم', visits: 2, segment: 'ضايع' },
]

const SEGMENT_TONES = {
  منتظم: 'bg-accent-100 text-accent-700',
  فاتر: 'bg-amber-100 text-amber-700',
  ضايع: 'bg-red-100 text-red-700',
}

// Prescription columns and frequency values: src/pages/patients/PatientRecord.jsx:60, 502-527
const PRESCRIPTION = [
  { drug: 'أموكسيسيلين 500', dose: 'قرص', freq: '3 مرات يومياً', duration: '5 أيام' },
  { drug: 'بروفين 400', dose: 'قرص', freq: 'عند الحاجة', duration: '3 أيام' },
  { drug: 'غسول فم', dose: 'مضمضة', freq: 'مرتين يومياً', duration: 'أسبوع' },
]

// Stat labels: src/pages/reports/Reports.jsx:147-150
const REPORT_STATS = [
  { label: 'إجمالي المواعيد', value: '128' },
  { label: 'الحضور', value: '109' },
  { label: 'الغياب', value: '11' },
  { label: 'معدل الحضور', value: '85%' },
]

function Panel({ children, note }) {
  return (
    <div>
      <div className="rounded-2xl border border-rule bg-white overflow-hidden" dir="rtl">
        {children}
      </div>
      {note && <IllustrativeNote className="mt-2.5">{note}</IllustrativeNote>}
    </div>
  )
}

function PanelHeader({ children }) {
  return (
    <div className="px-4 py-3 border-b border-rule bg-paper">
      <p className="text-[12px] font-bold text-ink">{children}</p>
    </div>
  )
}

const TABS = [
  {
    id: 'booking',
    label: 'الحجز',
    Icon: HiOutlineDevicePhoneMobile,
    benefit:
      'عميلك يفتح الرابط، يختار الخدمة، يشوف الأوقات المتاحة فعلاً، ويأكد — من غير تطبيق ومن غير ما يستنى حد يرد عليه.',
    render: () => (
      <div>
        <div className="rounded-2xl border border-rule bg-ink p-6">
          <BookingPhoneDemo />
        </div>
        <IllustrativeNote className="mt-2.5">
          دي واجهة صفحة الحجز الحقيقية · الأسماء والمواعيد للعرض فقط.
        </IllustrativeNote>
      </div>
    ),
  },
  {
    id: 'appointments',
    label: 'المواعيد',
    Icon: HiOutlineCalendarDays,
    benefit:
      'يوم / أسبوع / شهر في كاليندر واحد، وقائمة بفلاتر على الحالة والتاريخ والفرع والخدمة. الحجز المزدوج ممنوع من قاعدة البيانات نفسها.',
    render: () => (
      <Panel note="بيانات العرض توضيحية.">
        <PanelHeader>الخميس 18 سبتمبر · 5 مواعيد</PanelHeader>
        <ul className="divide-y divide-rule">
          {APPOINTMENTS.map((appt) => (
            <li key={appt.time} className="px-4 py-3 flex items-center gap-3">
              <span className="text-[12px] font-bold text-ink tabular-nums w-[58px] flex-shrink-0">
                {appt.time}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-ink truncate">{appt.name}</p>
                <p className="text-[11px] text-ink-soft truncate">{appt.service}</p>
              </div>
              <span
                className={`flex-shrink-0 text-[10.5px] font-bold px-2 py-1 rounded-full border ${STATUS_TONES[appt.tone]}`}
              >
                {appt.status}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    ),
  },
  {
    id: 'clients',
    label: 'العملاء',
    Icon: HiOutlineUsers,
    benefit:
      'النظام بيصنّف عملاءك بنفسه على آخر زيارة: منتظم لحد 30 يوم، فاتر من 31 لـ60، ضايع بعد 60. تفلتر الفاترين وتبعتلهم عرض في حملة واحدة.',
    render: () => (
      <Panel note="بيانات العرض توضيحية.">
        <div className="grid grid-cols-3 divide-x divide-x-reverse divide-rule border-b border-rule">
          {[
            ['منتظمين', '41', 'text-accent-600'],
            ['فاترين', '17', 'text-amber-600'],
            ['ضايعين', '23', 'text-red-500'],
          ].map(([label, value, tone]) => (
            <div key={label} className="px-4 py-3 text-center">
              <p className={`text-[19px] font-bold tabular-nums leading-none ${tone}`}>{value}</p>
              <p className="text-[11px] text-ink-soft mt-1">{label}</p>
            </div>
          ))}
        </div>
        <ul className="divide-y divide-rule">
          {CLIENTS.map((client) => (
            <li key={client.name} className="px-4 py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-ink truncate">{client.name}</p>
                <p className="text-[11px] text-ink-soft truncate tabular-nums">{client.last}</p>
              </div>
              <span className="text-[11px] text-ink-soft tabular-nums flex-shrink-0">
                {client.visits} زيارة
              </span>
              <span
                className={`flex-shrink-0 text-[10.5px] font-bold px-2 py-1 rounded-full ${SEGMENT_TONES[client.segment]}`}
              >
                {client.segment}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    ),
  },
  {
    id: 'record',
    label: 'الملف الطبي',
    Icon: HiOutlineDocumentText,
    benefit:
      'للعيادات: تشخيص كل زيارة، حساسية وأمراض مزمنة وفصيلة دم، روشتة بالجرعة والتكرار والمدة تطبعها فوراً، ومرفقات أشعة وتحاليل.',
    render: () => (
      <Panel note="بيانات العرض توضيحية.">
        <PanelHeader>روشتة · منى سعيد</PanelHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-right">
            <thead>
              <tr className="border-b border-rule bg-paper/60">
                {['الدواء', 'الجرعة', 'التكرار', 'المدة'].map((h) => (
                  <th key={h} className="px-4 py-2 text-[11px] font-bold text-ink-soft">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {PRESCRIPTION.map((row) => (
                <tr key={row.drug}>
                  <td className="px-4 py-2.5 text-[12.5px] font-semibold text-ink">{row.drug}</td>
                  <td className="px-4 py-2.5 text-[12px] text-ink-soft">{row.dose}</td>
                  <td className="px-4 py-2.5 text-[12px] text-ink-soft">{row.freq}</td>
                  <td className="px-4 py-2.5 text-[12px] text-ink-soft tabular-nums">
                    {row.duration}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-rule flex flex-wrap gap-1.5">
          {['أشعة', 'تحليل', 'تقرير'].map((type) => (
            <span
              key={type}
              className="text-[10.5px] font-semibold px-2 py-1 rounded-md bg-paper border border-rule text-ink-soft"
            >
              مرفق: {type}
            </span>
          ))}
        </div>
      </Panel>
    ),
  },
  {
    id: 'reports',
    label: 'التقارير',
    Icon: HiOutlineChartBarSquare,
    benefit:
      'معدل الحضور، وقيمة الغياب بالجنيه محسوبة بمتوسط سعر خدماتك، مقابل اللي اتوفّر بالتذكير. تصدّر CSV أو تطبع التقرير بعربي سليم.',
    render: () => (
      <Panel note="بيانات العرض توضيحية · النظام بيحسبها من مواعيدك وأسعار خدماتك.">
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-x-reverse divide-y sm:divide-y-0 divide-rule border-b border-rule">
          {REPORT_STATS.map((stat) => (
            <div key={stat.label} className="px-4 py-3.5">
              <p className="text-[20px] font-bold text-ink tabular-nums leading-none">
                {stat.value}
              </p>
              <p className="text-[11px] text-ink-soft mt-1.5">{stat.label}</p>
            </div>
          ))}
        </div>
        {/* Mirrors src/components/reports/MonthlyLossCard.jsx */}
        <div className="grid sm:grid-cols-2">
          <div className="bg-red-50 px-5 py-4 border-b sm:border-b-0 sm:border-l border-red-100">
            <p className="text-[11px] font-bold text-red-600">خسرت هذا الشهر</p>
            <p className="text-[26px] font-bold text-red-600 tabular-nums leading-tight mt-1">
              3,300 <span className="text-[13px] font-semibold">جنيه</span>
            </p>
            <p className="text-[11px] text-red-500/80 mt-0.5">من 11 غياب</p>
          </div>
          <div className="bg-accent-50 px-5 py-4">
            <p className="text-[11px] font-bold text-accent-700">وفّرت بالتذكير</p>
            <p className="text-[26px] font-bold text-accent-700 tabular-nums leading-tight mt-1">
              32,700 <span className="text-[13px] font-semibold">جنيه</span>
            </p>
            <p className="text-[11px] text-accent-600/80 mt-0.5">من 109 تذكير أُرسل</p>
          </div>
        </div>
      </Panel>
    ),
  },
]

export default function ProductTour({ id }) {
  const [active, setActive] = useState('booking')
  const tab = TABS.find((t) => t.id === active)

  return (
    <Section id={id} tone="paper">
      <SectionHead
        title="خُد جولة في النظام"
        lead="اضغط على أي جزء تشوفه من جوه. دي نفس واجهات النظام — الأسماء والأرقام للعرض بس."
      />

      <div className="mt-8">
        {/* Tablist — horizontally scrollable on small screens, no wrap jitter */}
        <div
          role="tablist"
          aria-label="جولة في النظام"
          className="flex gap-2 overflow-x-auto scrollbar-none -mx-5 px-5 sm:mx-0 sm:px-0 pb-1"
        >
          {TABS.map((t) => {
            const isActive = t.id === active
            return (
              <button
                key={t.id}
                role="tab"
                type="button"
                id={`tour-tab-${t.id}`}
                aria-selected={isActive}
                aria-controls={`tour-panel-${t.id}`}
                onClick={() => setActive(t.id)}
                className={`flex-shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold border transition-colors min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                  isActive
                    ? 'bg-ink text-white border-ink'
                    : 'bg-white text-ink-soft border-rule hover:border-ink/30'
                }`}
              >
                <t.Icon className="w-4 h-4" aria-hidden="true" />
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Keyed by tab id so switching tabs remounts this block and replays
            the existing fadeIn keyframe (tailwind.config.js) — a quick
            crossfade instead of an abrupt swap. motion-reduce drops it to an
            instant switch. */}
        <div
          key={tab.id}
          role="tabpanel"
          id={`tour-panel-${tab.id}`}
          aria-labelledby={`tour-tab-${tab.id}`}
          className="animate-fadeIn motion-reduce:animate-none mt-6 grid lg:grid-cols-5 gap-7 lg:gap-10 items-start"
        >
          <div className="lg:col-span-3">{tab.render()}</div>
          <div className="lg:col-span-2">
            <h3 className="text-[17px] font-bold text-ink">{tab.label}</h3>
            <p className="mt-2.5 text-[14.5px] leading-[1.85] text-ink-soft max-w-[46ch]">
              {tab.benefit}
            </p>
          </div>
        </div>
      </div>
    </Section>
  )
}
