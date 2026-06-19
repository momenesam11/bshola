import { forwardRef, useState } from 'react'
import { HiOutlineEye, HiOutlineEyeSlash, HiOutlineExclamationTriangle } from 'react-icons/hi2'

const base = `w-full border rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-white
  placeholder:text-gray-400 transition-colors
  focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-accent-400
  disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed`

const Input = forwardRef(function Input({ label, error, helper, className = '', type, ...props }, ref) {
  const [revealed, setRevealed] = useState(false)
  const isPassword = type === 'password'
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
      <div className="relative">
        <input
          ref={ref}
          type={isPassword && revealed ? 'text' : type}
          className={`${base} ${isPassword ? 'pl-10' : ''} ${error ? 'border-red-400 focus:ring-red-300 focus:border-red-400 bg-red-50' : 'border-gray-200'} ${className}`}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed(r => !r)}
            tabIndex={-1}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            {revealed ? <HiOutlineEyeSlash className="w-4 h-4" /> : <HiOutlineEye className="w-4 h-4" />}
          </button>
        )}
      </div>
      {error && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <HiOutlineExclamationTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </p>
      )}
      {!error && helper && <p className="text-xs text-gray-400">{helper}</p>}
    </div>
  )
})

export default Input

export const Select = forwardRef(function Select({ label, error, children, className = '', ...props }, ref) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
      <div className="relative">
        <select
          ref={ref}
          className={`${base} appearance-none pr-3 pl-9 cursor-pointer ${error ? 'border-red-400' : 'border-gray-200'} ${className}`}
          {...props}
        >
          {children}
        </select>
        {/* Custom arrow — positioned on left side for RTL */}
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
})

export const Textarea = forwardRef(function Textarea({ label, error, className = '', ...props }, ref) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
      <textarea
        ref={ref}
        rows={3}
        className={`${base} resize-none ${error ? 'border-red-400' : 'border-gray-200'} ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
})

export function Toggle({ on, onChange, size = 'md' }) {
  const sizes = {
    sm: { track: 'w-8 h-4', thumb: 'w-3 h-3', translate: 'translate-x-4' },
    md: { track: 'w-11 h-6', thumb: 'w-5 h-5', translate: 'translate-x-5' },
  }
  const s = sizes[size] || sizes.md
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative inline-flex items-center flex-shrink-0 ${s.track} rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:ring-offset-1 ${on ? 'bg-accent-500' : 'bg-slate-300'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 ${s.thumb} bg-white rounded-full shadow-sm transition-transform duration-200 ${on ? s.translate : 'translate-x-0'}`}
      />
    </button>
  )
}
