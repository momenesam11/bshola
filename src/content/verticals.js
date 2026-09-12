import {
  HiOutlineAcademicCap,
  HiOutlineBolt,
  HiOutlineHeart,
  HiOutlineRectangleGroup,
  HiOutlineScissors,
} from 'react-icons/hi2'

/**
 * The verticals the onboarding actually offers (OnboardingFlow.jsx:107-114),
 * each linked to its own SEO page (src/content/marketingPages.js). Shared by
 * Nav's "الحلول" dropdown and the homepage's TrustStrip, so both list the
 * same businesses in the same order.
 */
export const VERTICALS = [
  { label: 'عيادات', Icon: HiOutlineHeart, to: '/solutions/clinics' },
  { label: 'صالونات وباربر', Icon: HiOutlineScissors, to: '/solutions/salons' },
  { label: 'جيم ولياقة', Icon: HiOutlineBolt, to: '/solutions/gyms' },
  { label: 'تعليم وتدريس', Icon: HiOutlineAcademicCap, to: '/solutions/education' },
  { label: 'ملاعب ومرافق', Icon: HiOutlineRectangleGroup, to: '/solutions/courts' },
]
