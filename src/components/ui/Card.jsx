export default function Card({ children, className = '', onClick }) {
  return (
    <div
      className={`bg-white rounded-xl border border-gray-100 shadow-sm ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

export function StatCard({ label, value, Icon, color = 'accent' }) {
  const colors = {
    accent: 'bg-accent-50 text-accent-600',
    blue: 'bg-blue-50 text-blue-600',
    orange: 'bg-orange-50 text-orange-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    slate: 'bg-slate-100 text-slate-600',
  }
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-5">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${colors[color]}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs text-gray-500 truncate">{label}</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  )
}
