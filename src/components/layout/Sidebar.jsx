import { NavLink, useNavigate } from 'react-router-dom'
import {
  HiOutlineHome,
  HiOutlineCalendarDays,
  HiOutlineUsers,
  HiOutlineChartBar,
  HiOutlineCog6Tooth,
  HiOutlineArrowRightOnRectangle,
  HiOutlineLink,
} from 'react-icons/hi2'
import { supabase } from '../../lib/supabase'
import { useBusiness } from '../../hooks/useBusiness'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'الرئيسية', icon: HiOutlineHome },
  { to: '/appointments', label: 'المواعيد', icon: HiOutlineCalendarDays },
  { to: '/crm', label: 'العملاء', icon: HiOutlineUsers },
  { to: '/reports', label: 'التقارير', icon: HiOutlineChartBar },
  { to: '/settings', label: 'الإعدادات', icon: HiOutlineCog6Tooth },
]

export default function Sidebar() {
  const navigate = useNavigate()
  const { data: business } = useBusiness()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const bookingUrl = business ? `/book/${business.id}` : null

  return (
    <>
      {/* ── Desktop sidebar (lg+): full 256px ── */}
      <aside className="hidden lg:flex fixed top-0 right-0 h-screen w-64 bg-white border-l border-slate-100 flex-col z-30">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-primary-700 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-sm">ب</div>
            <span className="font-bold text-slate-900 text-lg">بسهولة</span>
          </div>
          {business && (
            <p className="text-xs text-slate-400 mt-1.5 truncate">{business.name}</p>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5" dir="rtl">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 ${
                  isActive
                    ? 'bg-accent-50 text-accent-700 font-semibold border-r-2 border-accent-500'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              {({ isActive }) => {
                const Icon = item.icon
                return (
                  <>
                    <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-accent-600' : 'text-slate-500'}`} />
                    <span>{item.label}</span>
                  </>
                )
              }}
            </NavLink>
          ))}

          {bookingUrl && (
            <a
              href={bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
            >
              <HiOutlineLink className="w-5 h-5" />
              <span>رابط الحجز</span>
            </a>
          )}
        </nav>

        {/* Logout */}
        <div className="px-3 py-4 border-t border-slate-100">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
            dir="rtl"
          >
            <HiOutlineArrowRightOnRectangle className="w-5 h-5" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* ── Tablet sidebar (md): icon-only 64px ── */}
      <aside className="hidden md:flex lg:hidden fixed top-0 right-0 h-screen w-16 bg-white border-l border-slate-100 flex-col z-30 items-center">
        {/* Logo */}
        <div className="py-5 border-b border-slate-100 w-full flex justify-center">
          <div className="w-8 h-8 bg-primary-700 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-sm">ب</div>
        </div>

        {/* Nav icons */}
        <nav className="flex-1 py-4 flex flex-col items-center gap-1 w-full">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              title={item.label}
              className={({ isActive }) =>
                `relative flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-150 group ${
                  isActive
                    ? 'bg-accent-50 text-accent-600'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`
              }
            >
              {({ isActive }) => {
                const Icon = item.icon
                return (
                  <>
                    <Icon className="w-5 h-5" />
                    {/* Tooltip */}
                    <span className="absolute right-full mr-3 px-2 py-1 bg-slate-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                      {item.label}
                    </span>
                    {isActive && (
                      <span className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-accent-500 rounded-l" />
                    )}
                  </>
                )
              }}
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div className="py-4 border-t border-slate-100 w-full flex justify-center">
          <button
            onClick={handleLogout}
            title="تسجيل الخروج"
            className="flex items-center justify-center w-10 h-10 rounded-xl text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <HiOutlineArrowRightOnRectangle className="w-5 h-5" />
          </button>
        </div>
      </aside>

      {/* ── Mobile bottom nav (< md) ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 bg-white z-30 flex items-stretch"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
          height: 'calc(64px + env(safe-area-inset-bottom))',
          boxShadow: '0 -1px 0 0 #e2e8f0, 0 -4px 12px 0 rgba(0,0,0,0.04)',
        }}
        dir="rtl"
      >
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-1 text-center transition-colors min-h-[44px] pt-2 ${
                isActive ? 'text-accent-600' : 'text-slate-400'
              }`
            }
          >
            {({ isActive }) => {
              const Icon = item.icon
              return (
                <>
                  <div className="relative flex items-center justify-center">
                    {isActive && (
                      <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-5 h-1 bg-accent-500 rounded-full" />
                    )}
                    <Icon className={`w-6 h-6 ${isActive ? 'text-accent-600' : 'text-slate-400'}`} />
                  </div>
                  <span className={`text-[11px] leading-none ${isActive ? 'font-bold text-accent-600' : 'font-medium text-slate-500'}`}>
                    {item.label}
                  </span>
                </>
              )
            }}
          </NavLink>
        ))}
      </nav>
    </>
  )
}
