import { forwardRef, useState } from 'react'
import { HiOutlineChevronDown, HiOutlineExclamationTriangle } from 'react-icons/hi2'
import { COUNTRIES, DEFAULT_COUNTRY, OTHER_COUNTRY, countryByCode, joinPhone, phoneDigits, phoneFromInput, splitPhone } from '../../lib/countries'

const OPTIONS = [...COUNTRIES, OTHER_COUNTRY]

const inputBase = `w-full min-w-0 border rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-white placeholder:text-gray-400
  transition-colors focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-accent-400`
const pickerBase = 'border rounded-xl bg-white text-gray-900 focus-within:ring-2 focus-within:ring-accent-400'

/**
 * A country-code dropdown next to the number. The value going in and out is one
 * string of international digits, such as 966501234567. Editing nothing emits
 * nothing, so an older number like 01012345678 stays exactly as it was saved:
 * phones identify patients, and a changed format would split their history.
 *
 * The picker is a native select laid over a compact "+966" label, so phones get
 * their own country list while the closed field stays small.
 */
const PhoneInput = forwardRef(function PhoneInput(
  { label, value, onChange, onBlur, name, error, helper, defaultCountry = DEFAULT_COUNTRY, placeholder, disabled, autoFocus,
    inputClassName, pickerClassName, ariaLabel },
  ref
) {
  const [picked, setPicked] = useState(null)
  const parsed = splitPhone(value)
  // The number decides its own country, so reopening a form on another patient
  // can't show a stale pick. "Other" is the exception: there the person is typing
  // the code by hand, and 966... must stay as typed rather than jump to Saudi.
  const code = picked === OTHER_COUNTRY.code
    ? picked
    : parsed.country ?? picked ?? (countryByCode(defaultCountry) ? defaultCountry : DEFAULT_COUNTRY)
  const country = countryByCode(code) ?? OTHER_COUNTRY
  const isOther = country.code === OTHER_COUNTRY.code
  const national = picked === OTHER_COUNTRY.code ? phoneDigits(value) : parsed.national

  function changeCountry(next) {
    setPicked(next)
    if (national) onChange(joinPhone(next, national))
  }

  const borders = error ? 'border-red-400' : 'border-gray-200'

  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
      <div className="flex gap-2" dir="ltr">
        <div className={`relative flex-shrink-0 ${pickerClassName ?? `${pickerBase} ${borders}`} ${disabled ? 'opacity-60' : ''}`}>
          <span className="flex h-full items-center gap-1 px-2.5 py-2.5 text-sm font-medium tabular-nums" aria-hidden="true">
            <span>{country.flag}</span>
            <span>{isOther ? '+' : `+${country.dial}`}</span>
            <HiOutlineChevronDown className="w-3.5 h-3.5 opacity-60" />
          </span>
          <select
            value={country.code}
            onChange={(e) => changeCountry(e.target.value)}
            disabled={disabled}
            aria-label="كود الدولة"
            dir="rtl"
            className="absolute inset-0 w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          >
            {OPTIONS.map((c) => (
              <option key={c.code} value={c.code} className="text-gray-900">
                {c.name}{c.dial ? ` +${c.dial}` : ''}
              </option>
            ))}
          </select>
        </div>
        <input
          ref={ref}
          name={name}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          dir="ltr"
          aria-label={ariaLabel ?? label}
          autoFocus={autoFocus}
          disabled={disabled}
          placeholder={placeholder ?? (isOther ? 'الرقم بكود دولته' : country.code === 'EG' ? '1XXXXXXXXX' : 'XXXXXXXXX')}
          value={national}
          onBlur={onBlur}
          onChange={(e) => onChange(phoneFromInput(country.code, e.target.value))}
          className={inputClassName ?? `${inputBase} ${error ? 'border-red-400 bg-red-50' : 'border-gray-200'} disabled:bg-gray-50`}
        />
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

export default PhoneInput
