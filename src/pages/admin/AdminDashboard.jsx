import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  HiOutlineMagnifyingGlass,
  HiOutlineCheck,
  HiOutlineXMark,
  HiOutlineArrowRightOnRectangle,
} from 'react-icons/hi2'
import { FaWhatsapp } from 'react-icons/fa'
import { BUSINESS_TYPES } from '../../utils/constants'
import {
  useAdminBusinesses,
  useDeactivateBusiness,
  getBusinessStatus,
  getAdminStats,
  searchBusinesses,
} from '../../hooks/useAdmin'
import ActivateModal from '../../components/admin/ActivateModal'

const ADMIN_PASSWORD = 'MawidOwner@2025'
const SESSION_KEY = 'mawid_admin_authed'

const STATUS_CONFIG = {
  trial: { label: 'تجربة نشطة 🟢', color: 'text-accent-600 bg-accent-50' },
  expired: { label: 'منتهية 🔴', color: 'text-red-600 bg-red-50' },
  paid: { label: 'مشترك 💎', color: 'text-blue-600 bg-blue-50' },
  suspended: { label: 'موقوف ⛔', color: 'text-gray-500 bg-gray-100' },
}

const TABS = [
  { key: 'all', label: 'الكل' },
  { key: 'trial', label: 'تجارب نشطة' },
  { key: 'expired', label: 'منتهية التجربة' },
  { key: 'paid', label: 'مشتركين' },
  { key: 'suspended', label: 'موقوفة' },
]

function businessTypeLabel(type) {
  return BUSINESS_TYPES.find(t => t.value === type)?.label || type || '—'
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })
}

function daysLeft(trialEndsAt) {
  if (!trialEndsAt) return null
  return Math.ceil((new Date(trialEndsAt) - new Date()) / (1000 * 60 * 60 * 24))
}

function PasswordGate({ onAuthenticated }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    if (password === ADMIN_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, 'true')
      onAuthenticated()
    } else {
      setError(true)
      setTimeout(() => setError(false), 500)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir="rtl">
      <form
        onSubmit={handleSubmit}
        className={`w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center ${error ? 'animate-shake' : ''}`}
      >
        <div className="inline-flex items-center justify-center w-14 h-14 bg-accent-500 rounded-2xl mb-3 shadow-lg">
          <span className="text-white font-bold text-2xl">ب</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-4">لوحة تحكم المالك</h1>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="كلمة السر"
          dir="ltr"
          autoFocus
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-accent-400"
        />
        {error && <p className="text-xs text-red-500 mt-2">كلمة السر غلط</p>}
        <button
          type="submit"
          className="w-full mt-4 bg-accent-500 text-white font-medium rounded-lg py-2.5 text-sm hover:bg-accent-600 transition-colors"
        >
          دخول
        </button>
      </form>
      <style>{`
        @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }
        .animate-shake { animation: shake 0.3s; }
      `}</style>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  )
}

function whatsappLink(business) {
  const phone = (business.owner_phone || business.phone || '').replace(/[^0-9]/g, '')
  const message = `أهلاً يا دكتور/أستاذ! 👋
تجربتك المجانية لـ Mawid انتهت.
لتجديد اشتراكك وإعادة تفعيل حسابك، تواصل معنا.
باقات الاشتراك تبدأ من 99 جنيه/شهر 🗓️`
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}

function Dashboard() {
  const { data: businesses = [], isLoading } = useAdminBusinesses()
  const deactivate = useDeactivateBusiness()
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('all')
  const [activateTarget, setActivateTarget] = useState(null)

  const stats = useMemo(() => getAdminStats(businesses), [businesses])

  const filtered = useMemo(() => {
    let list = searchBusinesses(businesses, query)
    if (tab !== 'all') list = list.filter(b => getBusinessStatus(b) === tab)
    return list
  }, [businesses, query, tab])

  const tabCounts = useMemo(() => ({
    all: businesses.length,
    trial: stats.activeTrials,
    expired: stats.expiredTrials,
    paid: stats.paid,
    suspended: stats.suspended,
  }), [businesses, stats])

  async function handleDeactivate(business) {
    if (!window.confirm(`هل أنت متأكد من إيقاف ${business.name}؟`)) return
    try {
      await deactivate.mutateAsync(business.id)
      toast.success(`تم إيقاف ${business.name}`)
    } catch (e) {
      toast.error(e.message || 'حدث خطأ')
    }
  }

  function handleLogout() {
    sessionStorage.removeItem(SESSION_KEY)
    window.location.reload()
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">لوحة تحكم Mawid</h1>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors"
          >
            <HiOutlineArrowRightOnRectangle className="w-4 h-4" />
            تسجيل خروج
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="إجمالي الحسابات" value={stats.total} />
          <StatCard label="تجارب نشطة" value={stats.activeTrials} />
          <StatCard label="منتهية التجربة" value={stats.expiredTrials} />
          <StatCard label="مشتركين" value={stats.paid} />
        </div>

        <div className="relative">
          <HiOutlineMagnifyingGlass className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="بحث بالاسم أو رقم التليفون..."
            className="w-full border border-gray-200 rounded-xl pr-10 pl-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-accent-400 bg-white"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key ? 'bg-accent-500 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {t.label}
              <span className={`text-xs px-1.5 rounded-full ${tab === t.key ? 'bg-white/20' : 'bg-gray-100'}`}>
                {tabCounts[t.key]}
              </span>
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400 text-xs">
                <th className="text-right px-4 py-3 font-medium">اسم البيزنس</th>
                <th className="text-right px-4 py-3 font-medium">نوع البيزنس</th>
                <th className="text-right px-4 py-3 font-medium">رقم التليفون</th>
                <th className="text-right px-4 py-3 font-medium">تاريخ التسجيل</th>
                <th className="text-right px-4 py-3 font-medium">انتهاء التجربة</th>
                <th className="text-right px-4 py-3 font-medium">الحالة</th>
                <th className="text-right px-4 py-3 font-medium">أكشن</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">جاري التحميل...</td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">لا توجد نتائج</td></tr>
              )}
              {filtered.map(b => {
                const status = getBusinessStatus(b)
                const left = daysLeft(b.trial_ends_at)
                return (
                  <tr key={b.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-900">{b.name}</td>
                    <td className="px-4 py-3 text-gray-500">{businessTypeLabel(b.type)}</td>
                    <td className="px-4 py-3 text-gray-500 text-right" dir="ltr">{b.owner_phone || b.phone || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(b.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="text-gray-700">{formatDate(b.trial_ends_at)}</div>
                      {status === 'trial' && left !== null && (
                        <div className={`text-xs ${left < 3 ? 'text-amber-500' : 'text-gray-400'}`}>باقي {left} يوم</div>
                      )}
                      {status === 'expired' && <div className="text-xs text-red-500">منتهية</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_CONFIG[status].color}`}>
                        {STATUS_CONFIG[status].label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setActivateTarget(b)}
                          title="تفعيل"
                          className="p-1.5 rounded-lg text-accent-600 hover:bg-accent-50 transition-colors"
                        >
                          <HiOutlineCheck className="w-4 h-4" />
                        </button>
                        <a
                          href={whatsappLink(b)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="واتساب"
                          className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors"
                        >
                          <FaWhatsapp className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => handleDeactivate(b)}
                          title="إيقاف"
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <HiOutlineXMark className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ActivateModal open={!!activateTarget} onClose={() => setActivateTarget(null)} business={activateTarget} />
    </div>
  )
}

export default function AdminDashboard() {
  const [authenticated, setAuthenticated] = useState(() => sessionStorage.getItem(SESSION_KEY) === 'true')

  if (!authenticated) return <PasswordGate onAuthenticated={() => setAuthenticated(true)} />
  return <Dashboard />
}
