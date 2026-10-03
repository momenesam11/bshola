import { useEffect, useMemo, useRef, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { HiOutlineArrowPath, HiOutlineArrowRight, HiOutlineChartBar, HiOutlineCog6Tooth, HiOutlineMap, HiOutlinePhone, HiOutlinePlus, HiOutlineQueueList, HiOutlineRocketLaunch, HiOutlineUserGroup } from 'react-icons/hi2'
import { hasAdminToken } from '../../../hooks/useAdmin'
import { useQueryClient } from '@tanstack/react-query'
import { useGrowthData, useSyncPlatform, runAutoDiscover } from '../../../hooks/useGrowth'
import { buildQueue } from '../../../lib/growth/scoring'
import PasswordGate from '../../../components/admin/AdminPasswordGate'
import QueuePanel from './QueuePanel'
import LeadsPanel from './LeadsPanel'
import AddPanel from './AddPanel'
import PlacesPanel from './PlacesPanel'
import PartnersPanel from './PartnersPanel'
import NumbersPanel from './NumbersPanel'
import SettingsPanel from './SettingsPanel'
import LeadPage from './LeadPage'
import { Btn } from './ui'

const TABS = [
  { key: 'today', label: 'النهارده', icon: HiOutlinePhone },
  { key: 'leads', label: 'كل العملاء', icon: HiOutlineQueueList },
  { key: 'add', label: 'إضافة', icon: HiOutlinePlus },
  { key: 'maps', label: 'خرائط جوجل', icon: HiOutlineMap },
  { key: 'partners', label: 'الشركاء والترشيحات', icon: HiOutlineUserGroup },
  { key: 'numbers', label: 'الأرقام', icon: HiOutlineChartBar },
  { key: 'settings', label: 'الإعدادات', icon: HiOutlineCog6Tooth },
]

function Growth() {
  const { data, isLoading, error } = useGrowthData()
  const sync = useSyncPlatform()
  // Tab and open lead live in the URL, so a refresh or the back button keeps your place.
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'today'
  const openId = params.get('lead')

  const allLeads = useMemo(() => data?.leads ?? [], [data])
  // The owner's own test accounts stay listed (to un-flag them) but out of the
  // queue, the numbers and every reward.
  const leads = useMemo(() => allLeads.filter((l) => !l.is_test), [allLeads])
  const commissions = data?.commissions ?? []
  const partners = data?.partners ?? []
  const settings = data?.settings
  const openLead = openId ? allLeads.find((l) => l.id === openId) : null
  const queueCount = useMemo(
    // Same default as the Today screen: only leads you can call.
    () => buildQueue(leads.filter((l) => l.phone), { weights: settings?.weights, targetAreas: settings?.target_areas }).length,
    [leads, settings]
  )

  // Daily automatic discovery, once per Cairo day on first open (see runAutoDiscover).
  const qc = useQueryClient()
  const discoverStarted = useRef(false)
  useEffect(() => {
    if (!data?.placesConfigured || !settings?.auto_discover_enabled || discoverStarted.current) return
    discoverStarted.current = true
    runAutoDiscover(settings)
      .then((r) => {
        if (!r.ran) return
        toast.success(r.added ? `البحث الأوتوماتيك لقى ${r.added} عيادة جديدة` : 'البحث الأوتوماتيك خلص — مفيش عيادات جديدة النهارده', { duration: 6000 })
        qc.invalidateQueries({ queryKey: ['growth'], exact: true })
      })
      .catch((e) => toast.error(`البحث الأوتوماتيك: ${e.message}`))
  }, [data?.placesConfigured, settings, qc])

  const update = (patch) =>
    setParams((p) => {
      const next = new URLSearchParams(p)
      for (const [k, v] of Object.entries(patch)) {
        if (v == null) next.delete(k)
        else next.set(k, v)
      }
      return next
    })
  // Opening a lead is a page of its own; scroll to the top like a real navigation.
  const open = (id) => {
    update({ lead: id, ltab: null })
    window.scrollTo(0, 0)
  }

  async function runSync() {
    try {
      const r = await sync.mutateAsync()
      toast.success(`اتحدّث: ${r.created} جديد · ${r.updated} اتحدّث · ${r.signup_incomplete} سجّلوا وماكمّلوش${r.qualified ? ` · ${r.qualified} اتأكد إنها حقيقية` : ''}`)
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <div className="min-h-screen bg-paper p-4 sm:p-6" dir="rtl">
      <Helmet>
        <title>العملاء المحتملين — بسهولة</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/admin" className="text-gray-400 hover:text-ink-soft" title="لوحة التحكم"><HiOutlineArrowRight className="w-5 h-5" /></Link>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-ink"><HiOutlineRocketLaunch className="w-7 h-7 text-accent-600" aria-hidden="true" /> العملاء المحتملين</h1>
          </div>
          <Btn onClick={runSync} disabled={sync.isPending} title="يجيب التسجيلات الجديدة ويحدّث التجارب والدفع">
            <HiOutlineArrowPath className={`w-4 h-4 ${sync.isPending ? 'animate-spin' : ''}`} /> تحديث من النظام
          </Btn>
        </div>

        <nav className="flex gap-2 overflow-x-auto pb-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => update({ tab: t.key, lead: null, ltab: null })}
              className={`flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === t.key && !openLead ? 'bg-ink text-white' : 'bg-white text-ink-soft border border-rule hover:bg-paper'
              }`}
            >
              <t.icon className="w-4 h-4" aria-hidden="true" />
              {t.label}
              {t.key === 'today' && queueCount > 0 && (
                <span className={`mr-1.5 text-xs px-1.5 rounded-full ${tab === t.key ? 'bg-white/20' : 'bg-red-100 text-red-700'}`}>{queueCount}</span>
              )}
            </button>
          ))}
        </nav>

        {openLead ? (
          <LeadPage
            key={openLead.id}
            lead={openLead}
            leads={allLeads}
            partners={partners}
            settings={settings}
            tab={params.get('ltab') ?? 'contact'}
            onTab={(t) => update({ ltab: t })}
            onBack={() => update({ lead: null, ltab: null })}
          />
        ) : isLoading ? (
          <p className="text-center text-gray-400 py-16">بيحمّل…</p>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
            مقدرتش أحمّل البيانات: {error.message}
            <p className="text-xs mt-1 text-red-500">لو أول مرة: اتأكد إن migration 032 اتشغّلت وإن الـ Edge Function «growth» اترفعت (docs/growth-engine.md).</p>
          </div>
        ) : (
          <>
            {tab === 'today' && <QueuePanel leads={leads} settings={settings} onOpen={open} />}
            {tab === 'leads' && <LeadsPanel leads={allLeads} settings={settings} onOpen={open} />}
            {tab === 'add' && <AddPanel leads={allLeads} partners={partners} onOpen={open} />}
            {tab === 'maps' && <PlacesPanel leads={allLeads} configured={data?.placesConfigured} />}
            {tab === 'partners' && <PartnersPanel leads={allLeads} partners={partners} commissions={commissions} onOpen={open} />}
            {tab === 'numbers' && <NumbersPanel leads={leads} />}
            {tab === 'settings' && <SettingsPanel key={settings?.places_calls_count} settings={settings} placesConfigured={data?.placesConfigured} />}
          </>
        )}
      </div>

    </div>
  )
}

export default function GrowthPage() {
  const [authenticated, setAuthenticated] = useState(() => hasAdminToken())
  if (!authenticated) return <PasswordGate onAuthenticated={() => setAuthenticated(true)} />
  return <Growth />
}
