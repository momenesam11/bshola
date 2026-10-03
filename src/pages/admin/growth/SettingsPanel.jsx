import { useState } from 'react'
import toast from 'react-hot-toast'
import { DEFAULT_WEIGHTS, CATEGORY_BY_KEY } from '../../../lib/growth/constants'
import { DISCOVERY_CATEGORIES, discoveryQueries } from '../../../lib/growth/discover'
import { useSaveSettings } from '../../../hooks/useGrowth'
import { Btn, Card, Field } from './ui'
import { inputClass } from './format'

const WEIGHT_LABELS = {
  fit: ['مناسب لينا', 'نوع النشاط والمنطقة'],
  intent: ['نيّة الشراء', 'جه لوحده؟ طلب يتكلّم؟ تجربته بتخلص؟'],
  pain: ['المشكلة واضحة', 'شكاوى في التقييمات، مفيش حجز أونلاين'],
  activity: ['نشاط المكان', 'عدد التقييمات، جديد، فرع جديد'],
  contactability: ['سهل نوصله', 'موبايل عليه واتساب؟'],
}

export default function SettingsPanel({ settings, placesConfigured }) {
  const [weights, setWeights] = useState(() => ({ ...DEFAULT_WEIGHTS, ...(settings?.weights ?? {}) }))
  const [areas, setAreas] = useState(() => (settings?.target_areas ?? []).join('، '))
  const [cap, setCap] = useState(settings?.places_daily_cap ?? 100)
  const [minAppts, setMinAppts] = useState(settings?.qualify_min_appointments ?? 5)
  const [minClients, setMinClients] = useState(settings?.qualify_min_clients ?? 3)
  const [autoOn, setAutoOn] = useState(!!settings?.auto_discover_enabled)
  const [autoCats, setAutoCats] = useState(() => settings?.auto_discover_categories ?? ['dental', 'derma'])
  const [autoAreas, setAutoAreas] = useState(() => (settings?.auto_discover_areas ?? []).join('، '))
  const [autoPerDay, setAutoPerDay] = useState(settings?.auto_discover_per_day ?? 4)
  const areaList = autoAreas.split(/[،,\n]/).map((a) => a.trim()).filter(Boolean)
  const totalSearches = discoveryQueries(autoCats, areaList).length
  const save = useSaveSettings()

  async function submit() {
    try {
      await save.mutateAsync({
        weights: Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, Math.max(0, Number(v) || 0)])),
        target_areas: areas.split(/[،,\n]/).map((a) => a.trim()).filter(Boolean),
        places_daily_cap: Math.max(0, Math.min(5000, parseInt(cap, 10) || 0)),
        qualify_min_appointments: Math.max(1, Math.min(500, parseInt(minAppts, 10) || 5)),
        qualify_min_clients: Math.max(1, Math.min(500, parseInt(minClients, 10) || 3)),
        auto_discover_enabled: autoOn,
        auto_discover_categories: autoCats,
        auto_discover_areas: areaList,
        auto_discover_per_day: Math.max(1, Math.min(50, parseInt(autoPerDay, 10) || 4)),
      })
      toast.success('اتحفظ — الترتيب اتحدّث')
    } catch (e) {
      toast.error(e.message)
    }
  }

  const total = Object.values(weights).reduce((s, v) => s + (Number(v) || 0), 0)

  return (
    <div className="grid lg:grid-cols-2 gap-4 items-start">
      <Card title="⚖️ أوزان التقييم">
        <p className="text-xs text-gray-500 mb-4">كل جزء بياخد درجة من 100، والوزن بيحدد أهميته في الترتيب. المجموع دلوقتي {total}.</p>
        <div className="space-y-4">
          {Object.entries(WEIGHT_LABELS).map(([key, [label, hint]]) => (
            <div key={key}>
              <div className="flex justify-between text-sm">
                <span className="font-semibold text-gray-800">{label}</span>
                <span className="tabular-nums text-gray-500">{weights[key]}</span>
              </div>
              <input type="range" min="0" max="50" value={weights[key]} onChange={(e) => setWeights((w) => ({ ...w, [key]: Number(e.target.value) }))} className="w-full accent-emerald-600" />
              <p className="text-[11px] text-gray-400">{hint}</p>
            </div>
          ))}
        </div>
        <Btn tone="ghost" className="mt-3" onClick={() => setWeights(DEFAULT_WEIGHTS)}>رجّع الافتراضي</Btn>
      </Card>

      <div className="space-y-4">
        <Card title="📍 المناطق المستهدفة">
          <Field label="افصل بينهم بفاصلة" hint="العملاء برّه المناطق دي بياخدوا تقييم «مناسب لينا» أقل">
            <textarea className={`${inputClass} min-h-[70px]`} value={areas} onChange={(e) => setAreas(e.target.value)} />
          </Field>
        </Card>
        <Card title="🤖 البحث الأوتوماتيك اليومي">
          <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
            <input type="checkbox" checked={autoOn} onChange={(e) => setAutoOn(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
            كل يوم، أول ما أفتح الصفحة، دوّر لوحدك وضيف عيادات جديدة
          </label>
          <p className="text-xs text-gray-500 mt-2 leading-relaxed">
            بيضيف بس العيادات المفتوحة اللي ليها رقم، ومش بيكرر حد موجود، وبيقرا تقييماتها ويعلّم الشكاوى.
            {!placesConfigured && <b className="text-amber-700"> محتاج مفتاح Google Places الأول.</b>}
          </p>
          <div className="mt-3 space-y-3">
            <Field label="أنواع العيادات">
              <div className="flex flex-wrap gap-3 pt-1">
                {DISCOVERY_CATEGORIES.map((c) => (
                  <label key={c} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input type="checkbox" className="accent-emerald-600" checked={autoCats.includes(c)}
                      onChange={(e) => setAutoCats((list) => (e.target.checked ? [...list, c] : list.filter((x) => x !== c)))} />
                    {CATEGORY_BY_KEY[c]?.label}
                  </label>
                ))}
              </div>
            </Field>
            <Field label="المناطق (افصل بفاصلة)">
              <textarea className={`${inputClass} min-h-[80px]`} value={autoAreas} onChange={(e) => setAutoAreas(e.target.value)} />
            </Field>
            <Field label="كام بحث في اليوم" hint={`كل بحث بيجيب لحد 20 عيادة. عندك ${totalSearches} بحث مختلف — بيلف عليهم بالدور، يعني دورة كاملة كل ${Math.max(1, Math.ceil(totalSearches / (parseInt(autoPerDay, 10) || 4)))} يوم.`}>
              <input type="number" min="1" max="50" className={inputClass} value={autoPerDay} onChange={(e) => setAutoPerDay(e.target.value)} />
            </Field>
            {settings?.auto_discover_last_run && <p className="text-[11px] text-gray-400">آخر مرة اشتغل: {settings.auto_discover_last_run}</p>}
          </div>
        </Card>
        <Card title="🗺️ خرائط جوجل">
          <p className={`text-sm mb-3 ${placesConfigured ? 'text-green-700' : 'text-amber-700'}`}>
            {placesConfigured ? '✅ مفتاح Google Places متضاف' : '⚠️ مفتاح Google Places مش متضاف — الخطوات في docs/growth-engine.md'}
          </p>
          <Field label="أقصى عدد بحث في اليوم" hint={`النهارده: ${settings?.places_calls_date ? settings.places_calls_count : 0} بحث. 0 = إيقاف البحث خالص.`}>
            <input type="number" min="0" max="5000" className={inputClass} value={cap} onChange={(e) => setCap(e.target.value)} />
          </Field>
        </Card>
        <Card title="✅ إمتى العيادة تتحسب «حقيقية»؟">
          <p className="text-xs text-gray-500 mb-3 leading-relaxed">
            عشان مكافأة الشريك ماتتصرفش على تسجيل وهمي: العيادة لازم يجيلها العدد ده من الحجوزات من عملاء مختلفين
            (مش رقم صاحبها، ورقم صاحبها مش مستخدم في حساب تاني). أو تأكّدها إنت بإيدك من صفحتها.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="عدد الحجوزات">
              <input type="number" min="1" max="500" className={inputClass} value={minAppts} onChange={(e) => setMinAppts(e.target.value)} />
            </Field>
            <Field label="من كام عميل مختلف">
              <input type="number" min="1" max="500" className={inputClass} value={minClients} onChange={(e) => setMinClients(e.target.value)} />
            </Field>
          </div>
        </Card>
        <Btn tone="primary" className="w-full" onClick={submit} disabled={save.isPending}>{save.isPending ? 'بيتحفظ…' : 'حفظ الإعدادات'}</Btn>
      </div>
    </div>
  )
}
