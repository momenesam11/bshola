import {
  HiOutlineHome,
  HiOutlineCalendarDays,
  HiOutlineUsers,
  HiOutlineChartBar,
  HiOutlineCog6Tooth,
} from 'react-icons/hi2'

export const NAV_ITEMS = [
  { to: '/dashboard', label: 'الرئيسية', icon: HiOutlineHome },
  { to: '/appointments', label: 'المواعيد', icon: HiOutlineCalendarDays },
  { to: '/crm', label: 'العملاء', icon: HiOutlineUsers },
  { to: '/reports', label: 'التقارير', icon: HiOutlineChartBar },
  { to: '/settings', label: 'الإعدادات', icon: HiOutlineCog6Tooth },
]
