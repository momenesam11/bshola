import { Link } from 'react-router-dom'

/**
 * The exact lockup used inside the app itself (see src/components/layout/
 * Sidebar.jsx, which renders the same file on its own white background) —
 * icon + "بسهولة" wordmark as one image, not a redrawn mark. The nav is dark
 * navy, so this uses the dark-surface export (logo-dark.png); logo.png is the
 * light-surface version the in-app sidebar uses on its white background.
 */
export default function Logo({ className = '' }) {
  return (
    <Link to="/" className={`flex items-center ${className}`}>
      <img
        src="/logo-dark.png"
        alt="بسهولة"
        width={500}
        height={179}
        className="h-8 sm:h-9 w-auto"
        style={{ aspectRatio: '500 / 179' }}
        fetchPriority="high"
      />
    </Link>
  )
}
