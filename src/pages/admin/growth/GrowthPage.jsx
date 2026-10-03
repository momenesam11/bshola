import { useMemo, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { HiOutlineArrowPath, HiOutlineArrowRight } from 'react-icons/hi2'
import { hasAdminToken } from '../../../hooks/useAdmin'
import { useGrowthData, useSyncPlatform } from '../../../hooks/useGrowth'
import { buildQueue } from '../../../lib/growth/scoring'
import PasswordGate from '../../../components/admin/AdminPasswordGate'
import QueuePanel from './QueuePanel'
import LeadsPanel from './LeadsPanel'
import AddPanel from './AddPanel'
import PlacesPanel from './PlacesPanel'
import PartnersPanel from './PartnersPanel'
import NumbersPanel from './NumbersPanel'
import SettingsPanel from './SettingsPanel'
import LeadDrawer from './LeadDrawer'
import { Btn } from './ui'

const TABS = [
  { key: 'today', label: '📞 النهارده' },
  { key: 'leads', label: '🗂️ كل العملاء' },
  { key: 'add', label: '➕ إضافة' },
  { key: 'maps', label: '🗺️ خرائط جوجل' },
  { key: 'partners', label: '🤝 الشركاء والترشيحات' },
  { key: 'numbers', label: '📊 الأرقام' },
  { key: 'settings', label: '⚙️ الإعدادات' },
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
    () => buildQueue(leads, { weights: settings?.weights, targetAreas: settings?.target_areas }).length,
    [leads, settings]
  )

  const update = (patch) =>
    setParams((p) => {
      const next = new URLSearchParams(p)
      for (const [k, v] of Object.entries(patch)) {
        if (v == null) next.delete(k)
        else next.set(k, v)
      }
      return next
    })
  const open = (id) => update({ lead: id })

  async function runSync() {
    try {
      const r = await sync.mutateAsync()
      toast.success(`اتحدّث: ${r.created} جديد · ${r.updated} اتحدّث · ${r.signup_incomplete} سجّلوا وماكمّلوش${r.qualified ? ` · ${r.qualified} اتأكد إنها حقيقية` : ''}`)
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6" dir="rtl">
      <Helmet>
        <title>العملاء المحتملين — بسهولة</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/admin" className="text-gray-400 hover:text-gray-700" title="لوحة التحكم"><HiOutlineArrowRight className="w-5 h-5" /></Link>
            <h1 className="text-2xl font-bold text-gray-900">🚀 العملاء المحتملين</h1>
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
              onClick={() => update({ tab: t.key })}
              className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === t.key ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {t.label}
              {t.key === 'today' && queueCount > 0 && (
                <span className={`mr-1.5 text-xs px-1.5 rounded-full ${tab === t.key ? 'bg-white/20' : 'bg-red-100 text-red-700'}`}>{queueCount}</span>
              )}
            </button>
          ))}
        </nav>

        {isLoading ? (
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

      {openLead && (
        <LeadDrawer
          key={openLead.id}
          lead={openLead}
          leads={allLeads}
          partners={partners}
          settings={settings}
          onClose={() => update({ lead: null })}
        />
      )}
    </div>
  )
}

export default function GrowthPage() {
  const [authenticated, setAuthenticated] = useState(() => hasAdminToken())
  if (!authenticated) return <PasswordGate onAuthenticated={() => setAuthenticated(true)} />
  return <Growth />
}
