import { forwardRef } from 'react'
import { Link } from 'react-router-dom'

/** The links open in a new tab, so reading the terms doesn't lose the form. */
const TermsCheckbox = forwardRef(function TermsCheckbox({ error, ...props }, ref) {
  return (
    <div>
      <label className="flex items-start gap-2.5 text-sm text-gray-700 leading-relaxed cursor-pointer">
        <input
          ref={ref}
          type="checkbox"
          className="mt-1 w-4 h-4 flex-shrink-0 accent-accent-600 cursor-pointer"
          {...props}
        />
        <span>
          قرأت ووافقت على{' '}
          <Link to="/terms" target="_blank" className="font-semibold text-accent-700 underline">الشروط والأحكام</Link>
          {' '}و{' '}
          <Link to="/privacy" target="_blank" className="font-semibold text-accent-700 underline">سياسة الخصوصية</Link>
        </span>
      </label>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
})

export default TermsCheckbox
