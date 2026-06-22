import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import {
  HiOutlineUsers,
  HiOutlineMagnifyingGlass,
  HiOutlineBell,
  HiOutlineFaceSmile,
  HiOutlineClock,
  HiOutlineXCircle,
  HiOutlineXMark,
} from 'react-icons/hi2'
import { FaWhatsapp } from 'react-icons/fa'
import PageWrapper from '../../components/layout/PageWrapper'
import { StatCard } from '../../components/ui/Card'
import { useBusiness } from '../../hooks/useBusiness'
import { useClients, useClientStats } from '../../hooks/useClients'
import { useTomorrowsAppointments } from '../../hooks/useAppointments'
import { formatDateAr, formatTime12 } from '../../utils/dateHelpers'
import ClientProfileDrawer from './ClientProfileDrawer'

const STATUS_TABS = [
  { key: '', label: 'الكل' },
  { key: 'منتظم', label: 'منتظمين', dot: 'bg-accent-500' },
  { key: 'فاتر', label: 'فاترين', dot: 'bg-amber-400' },
  { key: 'ضايع', label: 'ضايعين', dot: 'bg-red-400' },
]

const STATUS_BADGE = {
  منتظم: 'bg-accent-100 text-accent-700',
  فاتر: 'bg-amber-100 text-amber-700',
  ضايع: 'bg-red-100 text-red-700',
}

function buildReminderMessage(client, appt, businessName) {
  const time = appt ? formatTime12(appt.appointment_time?.slice(0, 5)) : ''
  const service = appt?.services?.name ? ` - ${appt.services.name}` : ''
  const branch = appt?.branches?.name ? ` (${appt.branches.name})` : ''
  return `مرحباً ${client.name}،\nنذكرك بموعدك غداً${service}${branch} الساعة ${time}.\nنتطلع لرؤيتك 🙏\n— ${businessName}`
}

function ClientCard({ client, onView, tomorrowAppt, businessName }) {
  const waLink = `https://wa.me/${client.phone.replace(/\D/g, '')}`
  const reminderLink = tomorrowAppt
    ? `https://wa.me/${client.phone.replace(/\D/g, '')}?text=${encodeURIComponent(buildReminderMessage(client, tomorrowAppt, businessName))}`
    : null

  return (
    <div
      className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg hover:border-accent-200 transition-all duration-200 p-5 flex flex-col gap-4"
      dir="rtl"
    >
      {/* Top row */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center text-white font-bold text-sm leading-none flex-shrink-0">
            {client.name.slice(0, 2)}
          </div>
          <div>
            <p className="font-bold text-slate-900 text-sm leading-snug">{client.name}</p>
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-accent-600 transition-colors mt-0.5"
              dir="ltr"
            >
              <FaWhatsapp className="w-3.5 h-3.5 text-accent-500" />
              {client.phone}
            </a>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_BADGE[client.status] || 'bg-slate-100 text-slate-600'}`}>
            {client.status}
          </span>
          {tomorrowAppt && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 flex items-center gap-1">
              <HiOutlineBell className="w-3 h-3" />
              غداً {formatTime12(tomorrowAppt.appointment_time?.slice(0, 5))}
            </span>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="flex gap-3 text-center">
        <div className="flex-1 bg-slate-50 rounded-xl py-2.5">
          <p className="text-lg font-bold text-slate-900 leading-none">{client.visits}</p>
          <p className="text-xs text-slate-500 mt-0.5">زيارة</p>
        </div>
        <div className="flex-1 bg-slate-50 rounded-xl py-2.5">
          <p className="text-xs font-bold text-slate-700 leading-none">
            {client.lastVisit ? formatDateAr(client.lastVisit, 'd MMM') : '—'}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">آخر زيارة</p>
        </div>
        <div className="flex-1 bg-slate-50 rounded-xl py-2.5">
          <p className="text-sm font-bold text-slate-900 leading-none">{client.totalSpent}</p>
          <p className="text-xs text-slate-500 mt-0.5">جنيه</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => onView(client)}
          className="flex-1 py-2.5 text-sm font-medium text-slate-600 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors min-h-[44px]"
        >
          عرض الملف
        </button>
        {reminderLink ? (
          <a
            href={reminderLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-500 rounded-xl hover:bg-blue-600 transition-colors flex items-center justify-center gap-1.5 min-h-[44px]"
          >
            <HiOutlineBell className="w-4 h-4" />
            تذكير
          </a>
        ) : (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2.5 text-sm font-semibold text-white bg-accent-500 rounded-xl hover:bg-accent-600 transition-colors flex items-center justify-center gap-1.5 min-h-[44px]"
          >
            <FaWhatsapp className="w-4 h-4" />
            واتساب
          </a>
        )}
      </div>
    </div>
  )
}

function EmptyState({ isFiltered, onClear }) {
  if (isFiltered) {
    return (
      <div className="col-span-full flex flex-col items-center justify-center py-24 text-center" dir="rtl">
        <HiOutlineMagnifyingGlass className="w-16 h-16 text-slate-300 mb-4" />
        <h3 className="text-lg font-bold text-slate-700 mb-1">لا توجد نتائج</h3>
        <p className="text-slate-400 text-sm max-w-xs mb-3">جرّب كلمة بحث مختلفة أو تصنيف آخر</p>
        <button onClick={onClear} className="text-sm text-accent-600 font-medium hover:underline">
          إلغاء الفلتر
        </button>
      </div>
    )
  }
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-24 text-center" dir="rtl">
      <HiOutlineUsers className="w-16 h-16 text-slate-300 mb-4" />
      <h3 className="text-lg font-bold text-slate-700 mb-1">لسه مفيش عملاء</h3>
      <p className="text-slate-400 text-sm max-w-xs">لما حد يحجز موعد، هيظهر هنا أوتوماتيك</p>
    </div>
  )
}

export default function ClientsPage() {
  const [activeTab, setActiveTab] = useState('')
  const [search, setSearch] = useState('')
  const [drawerClient, setDrawerClient] = useState(null)

  const { data: business } = useBusiness()
  const { data: clients = [], isLoading } = useClients(business?.id)
  const { data: stats } = useClientStats(business?.id)
  const { data: tomorrowMap = new Map() } = useTomorrowsAppointments(business?.id)

  const filtered = clients.filter(c => {
    const matchTab = !activeTab || c.status === activeTab
    const matchSearch = !search || c.name.includes(search) || c.phone.includes(search)
    return matchTab && matchSearch
  })

  return (
    <PageWrapper title="العملاء">
      <Helmet>
        <title>العملاء — بسهولة</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="space-y-6" dir="rtl">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">العملاء</h1>
          <p className="text-slate-500 text-sm mt-0.5">كل عملائك في مكان واحد</p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="الكل" value={stats.total} Icon={HiOutlineUsers} color="slate" />
            <StatCard label="منتظمين" value={stats['منتظم'] ?? 0} Icon={HiOutlineFaceSmile} color="accent" />
            <StatCard label="فاترين" value={stats['فاتر'] ?? 0} Icon={HiOutlineClock} color="amber" />
            <StatCard label="ضايعين" value={stats['ضايع'] ?? 0} Icon={HiOutlineXCircle} color="red" />
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <HiOutlineMagnifyingGlass className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ابحث باسم العميل أو رقمه..."
            className="w-full md:w-[400px] border border-slate-200 rounded-xl pr-11 pl-10 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-transparent"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <HiOutlineXMark className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all min-h-[40px] ${
                activeTab === tab.key
                  ? 'bg-accent-500 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {tab.dot && <span className={`w-2 h-2 rounded-full ${tab.dot}`} />}
              {tab.label}
              {stats && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {tab.key ? stats[tab.key] ?? 0 : stats.total}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 h-48 animate-pulse">
                <div className="h-4 bg-slate-100 rounded w-3/4 mb-3" />
                <div className="h-3 bg-slate-100 rounded w-1/2 mb-6" />
                <div className="flex gap-2">
                  <div className="flex-1 h-12 bg-slate-100 rounded-xl" />
                  <div className="flex-1 h-12 bg-slate-100 rounded-xl" />
                  <div className="flex-1 h-12 bg-slate-100 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.length === 0 ? (
              <EmptyState
                isFiltered={clients.length > 0}
                onClear={() => { setSearch(''); setActiveTab('') }}
              />
            ) : (
              filtered.map(client => (
                <ClientCard
                  key={client.phone}
                  client={client}
                  onView={setDrawerClient}
                  tomorrowAppt={tomorrowMap.get(client.phone) || null}
                  businessName={business?.name || ''}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* Profile Drawer */}
      {drawerClient && (
        <ClientProfileDrawer
          client={drawerClient}
          businessId={business?.id}
          business={business}
          onClose={() => setDrawerClient(null)}
        />
      )}
    </PageWrapper>
  )
}
