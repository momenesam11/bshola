import { STAGE_BY_KEY } from '../../../lib/growth/constants'
import { QUALITY_STYLE } from '../../../lib/growth/quality'

// Small building blocks shared by the growth screens.

export function Card({ title, actions, children, className = '' }) {
  return (
    <section className={`bg-white rounded-xl border border-rule shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-4 pt-4">
          {title && <h2 className="text-sm font-bold text-ink">{title}</h2>}
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

export function StageBadge({ stage }) {
  const s = STAGE_BY_KEY[stage] ?? { label: stage, color: 'bg-gray-100 text-ink-soft' }
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[12.5px] font-bold whitespace-nowrap ${s.color}`}>{s.label}</span>
}

export function ScoreBadge({ score }) {
  const tone = score >= 70 ? 'bg-accent-600' : score >= 45 ? 'bg-ink-soft' : 'bg-gray-400'
  return (
    <span className={`inline-flex items-center justify-center min-w-[34px] h-6 px-1.5 rounded-md text-white text-xs font-bold tabular-nums ${tone}`}>
      {score}
    </span>
  )
}

export function ScoreBar({ label, score, reasons = [] }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-ink-soft">{label}</span>
        <span className="tabular-nums text-ink-soft">{score}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
        <div className="h-full bg-accent-500 rounded-full" style={{ width: `${score}%` }} />
      </div>
      {reasons.length > 0 && <p className="text-[12.5px] text-gray-400 mt-1 leading-relaxed">{reasons.join(' · ')}</p>}
    </div>
  )
}

export function Btn({ children, tone = 'default', className = '', ...props }) {
  const tones = {
    default: 'bg-white border border-rule text-ink hover:bg-paper',
    primary: 'bg-accent-500 text-white hover:bg-accent-600',
    whatsapp: 'bg-accent-500 text-white hover:bg-accent-600',
    danger: 'bg-white border border-red-200 text-red-600 hover:bg-red-50',
    ghost: 'text-ink-soft hover:text-ink hover:bg-ink/5',
  }
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${tones[tone]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-ink-soft mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[12.5px] text-gray-400 mt-1">{hint}</span>}
    </label>
  )
}

export function EmptyState({ icon = '🗂️', title, children }) {
  return (
    <div className="text-center py-12 px-4">
      <div className="text-3xl mb-2">{icon}</div>
      <p className="font-bold text-ink">{title}</p>
      {children && <div className="text-sm text-ink-soft mt-1.5 max-w-md mx-auto leading-relaxed">{children}</div>}
    </div>
  )
}

/** ✅ real / ⚪ unknown / ⚠️ needs review / 🧪 test — see lib/growth/quality.js */
export function QualityBadge({ quality, compact = false }) {
  const style = QUALITY_STYLE[quality.level]
  return (
    <span title={quality.reasons.join(' · ')} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[12.5px] font-bold whitespace-nowrap ${style.tone}`}>
      {style.icon}{!compact && ` ${quality.label}`}
    </span>
  )
}
