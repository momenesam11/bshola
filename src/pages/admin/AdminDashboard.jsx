import { useMemo, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  HiOutlineMagnifyingGlass,
  HiOutlineCheck,
  HiOutlineXMark,
  HiOutlineArrowRightOnRectangle,
  HiOutlineTrash,
  HiOutlineCog6Tooth,
} from 'react-icons/hi2'
import { FaWhatsapp } from 'react-icons/fa'
import { BUSINESS_TYPES } from '../../utils/constants'
import { formatPrice, getPricing } from '../../lib/pricing'
import { splitPhone } from '../../lib/countries'
import {
  useAdminBusinesses,
  useAdminActivity,
  useDeactivateBusiness,
  useDeletionRequests,
  useRejectDeletion,
  getBusinessStatus,
  getAdminStats,
  getSleepingClinics,
  SLEEPING_AFTER_DAYS,
  searchBusinesses,
  adminLogout,
  hasAdminToken,
} from '../../hooks/useAdmin'
import ActivateModal from '../../components/admin/ActivateModal'
import { LIFETIME_CAP, isLifetime } from '../../lib/lifetime'
import PasswordGate from '../../components/admin/AdminPasswordGate'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import DeleteBusinessModal from '../../components/admin/DeleteBusinessModal'

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
  // Pulled from the price list rather than hardcoded, so this message can't drift
  // from the real price the way it did before. Quoted for the owner's country.
  // The admin list has the owner's number rather than the country, and the code
  // in that number tells us which price list to quote.
  const { plans, label } = getPricing(splitPhone(phone).country)
  const startingPrice = `${formatPrice(plans[0].price)} ${label}`
  const message = `أهلاً يا دكتور/أستاذ!
تجربتك المجانية لـ بسهولة انتهت.
لتجديد اشتراكك وإعادة تفعيل حسابك، تواصل معنا.
باقات الاشتراك تبدأ من ${startingPrice}/شهر`
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}

// A friendly check-in, not a sales message: the point is to learn why the
// clinic stopped and help before the subscription runs out.
function checkInLink(business) {
  const phone = (business.owner_phone || business.phone || '').replace(/[^0-9]/g, '')
  const message = `أهلاً يا دكتور، معاك مؤمن مؤسس بسهولة.
لاحظت إن مفيش حجوزات اتسجلت على حسابك الأيام اللي فاتت، فحبيت أطمن إن كل حاجة ماشية تمام.
لو في أي حاجة واقفة معاك أو محتاج مساعدة في الإعداد، قولّي وأنا أظبطهالك.`
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}

function quietLabel(clinic) {
  if (!clinic.lastBookingAt) return `مفيش ولا حجز من ساعة ما سجّل (${clinic.quietDays} يوم)`
  return `آخر حجز من ${clinic.quietDays} يوم`
}

// Trial or paid clinics with no new appointment in a week (migration 050).
// They're the ones most likely not to renew, so they're called before that.
function SleepingClinics({ clinics }) {
  if (!clinics.length) return null
  return (
    <div data-testid="sleeping-clinics" className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-2.5">
      <h2 className="text-sm font-bold text-indigo-900">😴 عيادات نايمة ({clinics.length})</h2>
      <p className="text-xs text-indigo-800">
        حسابها شغال بس ما سجلتش ولا حجز بقالها {SLEEPING_AFTER_DAYS} أيام أو أكتر. دي أكتر عيادات ممكن ما تجددش، فكلمها قبل ما اشتراكها يخلص.
      </p>
      <div className="space-y-1.5">
        {clinics.map(c => (
          <div key={c.id} data-testid="sleeping-clinic" className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-lg px-3 py-2 border border-indigo-100">
            <div className="min-w-0 text-sm">
              <span className="font-medium text-gray-900">{c.name}</span>
              <span className={`text-xs mr-2 px-2 py-0.5 rounded-full ${STATUS_CONFIG[c.status].color}`}>{STATUS_CONFIG[c.status].label}</span>
              <span className="text-xs text-indigo-700 mr-2">{quietLabel(c)}</span>
            </div>
            <a
              href={checkInLink(c)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg text-xs font-medium transition-colors"
            >
              <FaWhatsapp className="w-3.5 h-3.5" />
              اطمن عليها
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}

// Whole days since an ISO time. Called when the activity arrives, not while
// rendering, so the render stays pure.
const daysSince = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000))

// "12 موعد · 9 تذكير" for the last 30 days, under how long since the last booking.
function UsageCell({ usage }) {
  if (!usage) return <span className="text-xs text-gray-400">مفيش حجوزات</span>
  const days = usage.daysSinceBooking
  return (
    <div>
      <div className="text-gray-700 tabular-nums">{usage.visits_30d} موعد · {usage.reminders_30d} تذكير</div>
      <div className="text-xs text-gray-400">{days < 1 ? 'آخر حجز النهارده' : `آخر حجز من ${days} يوم`}</div>
    </div>
  )
}

// Clinics that asked to delete their account from Settings (migration 049).
function DeletionRequests({ businesses, onDelete }) {
  const { data: requests = [] } = useDeletionRequests()
  const reject = useRejectDeletion()
  const [rejectTarget, setRejectTarget] = useState(null)
  if (!requests.length) return null

  async function confirmReject() {
    const r = rejectTarget
    setRejectTarget(null)
    try {
      await reject.mutateAsync(r.id)
      toast.success(`اترفض طلب حذف ${r.business_name}`)
    } catch (e) {
      toast.error(e.message || 'حدث خطأ')
    }
  }

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2.5">
      <h2 className="text-sm font-bold text-red-800">🗑️ طلبات حذف حساب ({requests.length})</h2>
      <p className="text-xs text-red-700">
        كلّم صاحب الحساب الأول وتأكد إنه هو اللي طالب. الحساب شغال عادي لحد ما تحذفه.
      </p>
      <div className="space-y-1.5">
        {requests.map(r => {
          const current = businesses.find(b => b.id === r.business_id)
          const phone = r.businesses?.owner_phone || r.businesses?.phone || ''
          return (
            <div key={r.id} data-testid="deletion-request" className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-lg px-3 py-2 border border-red-100">
              <div className="min-w-0 text-sm">
                <span className="font-medium text-gray-900">{current?.name || r.business_name}</span>
                <span className="text-xs text-gray-400 mr-2">طلب يوم {formatDate(r.requested_at)}</span>
                {phone && <span className="text-xs text-gray-500 mr-2" dir="ltr">{phone}</span>}
                {r.reason && <p className="text-xs text-gray-500 mt-0.5">السبب: {r.reason}</p>}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {phone && (
                  <a
                    href={`https://wa.me/${phone.replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg text-xs font-medium transition-colors"
                  >
                    <FaWhatsapp className="w-3.5 h-3.5" />
                    تواصل
                  </a>
                )}
                <button
                  onClick={() => setRejectTarget(r)}
                  className="px-2.5 py-1.5 bg-gray-50 text-gray-600 hover:bg-gray-100 rounded-lg text-xs font-medium transition-colors"
                >
                  رفض
                </button>
                <button
                  onClick={() => onDelete({ id: r.business_id, name: current?.name || r.business_name })}
                  className="px-2.5 py-1.5 bg-red-600 text-white hover:bg-red-700 rounded-lg text-xs font-medium transition-colors"
                >
                  حذف نهائي
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <ConfirmDialog
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={confirmReject}
        loading={reject.isPending}
        title="رفض طلب الحذف"
        message={rejectTarget ? `الحساب ${rejectTarget.business_name} هيفضل زي ما هو، والطلب هيختفي من هنا.` : ''}
        confirmLabel="رفض الطلب"
      />
    </div>
  )
}

function Dashboard() {
  const { data: businesses = [], isLoading } = useAdminBusinesses()
  const deactivate = useDeactivateBusiness()
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('all')
  const [activateTarget, setActivateTarget] = useState(null)
  const [deactivateTarget, setDeactivateTarget] = useState(null)

  const stats = useMemo(() => getAdminStats(businesses), [businesses])
  const { data: activity, isError: activityFailed } = useAdminActivity()
  const usageById = useMemo(
    () => new Map((activity || []).map(a => [a.business_id, { ...a, daysSinceBooking: daysSince(a.last_booking_at) }])),
    [activity],
  )
  const sleeping = useMemo(() => (activity ? getSleepingClinics(businesses, activity) : []), [businesses, activity])

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

  function handleDeactivate(business) {
    setDeactivateTarget(business)
  }

  async function confirmDeactivate() {
    const business = deactivateTarget
    setDeactivateTarget(null)
    if (!business) return
    try {
      await deactivate.mutateAsync(business.id)
      toast.success(`تم إيقاف ${business.name}`)
    } catch (e) {
      toast.error(e.message || 'حدث خطأ')
    }
  }

  function handleLogout() {
    adminLogout()
    window.location.reload()
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6" dir="rtl">
      <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">لوحة تحكم بسهولة</h1>
          <div className="flex items-center gap-4">
            <Link
              to="/admin/growth"
              className="flex items-center gap-1.5 text-sm font-bold text-white bg-accent-500 hover:bg-accent-600 px-3.5 py-2 rounded-lg transition-colors"
            >
              🚀 العملاء المحتملين
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors"
            >
              <HiOutlineArrowRightOnRectangle className="w-4 h-4" />
              تسجيل خروج
            </button>
          </div>
        </div>

        <p className="text-sm text-gray-500">
          اشتراكات مدى الحياة: <b className="text-gray-800 tabular-nums">{businesses.filter((b) => isLifetime(b.trial_ends_at)).length} من {LIFETIME_CAP}</b>
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="إجمالي الحسابات" value={stats.total} />
          <StatCard label="تجارب نشطة" value={stats.activeTrials} />
          <StatCard label="منتهية التجربة" value={stats.expiredTrials} />
          <StatCard label="مشتركين" value={stats.paid} />
          <StatCard label="تسجيلات هذا الأسبوع" value={stats.signupsThisWeek} />
          <StatCard label="معدل التحويل لمدفوع" value={`${stats.conversionRate}%`} />
        </div>

        <DeletionRequests businesses={businesses} onDelete={setDeleteTarget} />

        {activityFailed && (
          <p className="text-xs text-gray-500 bg-white border border-gray-200 rounded-lg px-3 py-2">
            نشاط العيادات مش ظاهر: محتاج مايجريشن 050 وتحديث دالة admin.
          </p>
        )}

        {stats.expiringSoon.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2.5">
            <h2 className="text-sm font-bold text-amber-800 flex items-center gap-1.5">
              ⏰ تجارب قاربت على الانتهاء ({stats.expiringSoon.length})
            </h2>
            <div className="space-y-1.5">
              {stats.expiringSoon.map(b => (
                <div key={b.id} className="flex items-center justify-between gap-3 bg-white rounded-lg px-3 py-2 border border-amber-100">
                  <div className="min-w-0">
                    <span className="font-medium text-gray-900 text-sm">{b.name}</span>
                    <span className={`text-xs mr-2 ${b.daysLeft <= 0 ? 'text-red-500' : 'text-amber-600'}`}>
                      {b.daysLeft <= 0 ? 'انتهت اليوم' : `باقي ${b.daysLeft} يوم`}
                    </span>
                  </div>
                  <a
                    href={whatsappLink(b)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg text-xs font-medium transition-colors"
                  >
                    <FaWhatsapp className="w-3.5 h-3.5" />
                    تواصل
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        <SleepingClinics clinics={sleeping} />

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
                <th className="text-right px-4 py-3 font-medium">آخر 30 يوم</th>
                <th className="text-right px-4 py-3 font-medium">أكشن</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8} className="text-center py-8 text-gray-400">جاري التحميل...</td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-gray-400">لا توجد نتائج</td></tr>
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
                      <div className="text-gray-700">{isLifetime(b.trial_ends_at) ? 'مدى الحياة' : formatDate(b.trial_ends_at)}</div>
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
                    <td className="px-4 py-3" data-testid="usage-cell">
                      {activity ? <UsageCell usage={usageById.get(b.id)} /> : <span className="text-xs text-gray-300">—</span>}
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
                        <Link
                          to={`/admin/setup/${b.id}`}
                          title="تجهيز الحساب"
                          className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <HiOutlineCog6Tooth className="w-4 h-4" />
                        </Link>
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
                        <button
                          onClick={() => setDeleteTarget(b)}
                          title="حذف الحساب"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <HiOutlineTrash className="w-4 h-4" />
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

      <DeleteBusinessModal key={deleteTarget?.id ?? 'none'} business={deleteTarget} onClose={() => setDeleteTarget(null)} />

      <ActivateModal key={activateTarget?.id} open={!!activateTarget} onClose={() => setActivateTarget(null)} business={activateTarget} />

      <ConfirmDialog
        open={!!deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={confirmDeactivate}
        variant="danger"
        loading={deactivate.isPending}
        title="إيقاف النشاط"
        message={deactivateTarget ? `هل أنت متأكد من إيقاف ${deactivateTarget.name}؟` : ''}
        confirmLabel="إيقاف"
      />
    </div>
  )
}

export default function AdminDashboard() {
  const [authenticated, setAuthenticated] = useState(() => hasAdminToken())

  if (!authenticated) return <PasswordGate onAuthenticated={() => setAuthenticated(true)} />
  return <Dashboard />
}
