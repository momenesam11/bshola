export default function DayToggle({ label, on, onChange, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100">
      <button
        type="button"
        onClick={() => onChange(!on)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <span
          role="switch"
          aria-checked={on}
          className={`relative inline-flex items-center flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ${on ? 'bg-accent-500' : 'bg-slate-200'}`}
        >
          <span
            className={`absolute top-0.5 ${on ? 'left-0.5' : 'left-[22px]'} w-5 h-5 bg-white rounded-full shadow transition-all duration-200`}
          />
        </span>
      </button>
      {on && children && <div className="px-4 pb-3">{children}</div>}
    </div>
  )
}
