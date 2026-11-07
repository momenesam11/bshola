import { describe, it, expect } from 'vitest'
import { COUNTRIES, CURRENCIES, displayPhone, formatMoney, isValidPhone, joinPhone, phoneDigits, phoneFromInput, phoneMatches, splitPhone, telHref } from './countries'
import { phoneSchema, bookingClientSchema } from './validators'

describe('phone numbers', () => {
  it('stores international digits, dropping a typed leading zero', () => {
    expect(joinPhone('EG', '01012345678')).toBe('201012345678')
    expect(joinPhone('SA', '0501234567')).toBe('966501234567')
    expect(joinPhone('KW', '51234567')).toBe('96551234567')
    expect(joinPhone('SA', '')).toBe('')
  })

  it('accepts Arabic numerals', () => {
    expect(phoneDigits('٠١٠١٢٣٤٥٦٧٨')).toBe('01012345678')
    expect(joinPhone('EG', '٠١٠١٢٣٤٥٦٧٨')).toBe('201012345678')
  })

  it('keeps one country code when a whole number is pasted', () => {
    expect(phoneFromInput('EG', '201012345678')).toBe('201012345678')
    expect(phoneFromInput('EG', '01012345678')).toBe('201012345678')
    expect(phoneFromInput('SA', '966501234567')).toBe('966501234567')
    expect(phoneFromInput('EG', '+966 50 123 4567')).toBe('966501234567')
    expect(phoneFromInput('EG', '00966501234567')).toBe('966501234567')
    expect(phoneFromInput('SA', '0501234567')).toBe('966501234567')
    expect(phoneFromInput('XX', '447911123456')).toBe('447911123456')
  })

  it('reads numbers saved before the dropdown as Egyptian', () => {
    expect(splitPhone('01012345678')).toEqual({ country: 'EG', national: '1012345678' })
    expect(splitPhone('1012345678')).toEqual({ country: 'EG', national: '1012345678' })
    expect(splitPhone('201012345678')).toEqual({ country: 'EG', national: '1012345678' })
    expect(splitPhone('00201012345678')).toEqual({ country: 'EG', national: '1012345678' })
  })

  it('finds the country from the stored number', () => {
    expect(splitPhone('966501234567')).toEqual({ country: 'SA', national: '501234567' })
    expect(splitPhone('97150123456')).toEqual({ country: 'AE', national: '50123456' })
    expect(splitPhone('')).toEqual({ country: null, national: '' })
  })

  it('keeps numbers from outside the list instead of rewriting them', () => {
    expect(splitPhone('447911123456')).toEqual({ country: 'XX', national: '447911123456' })
    expect(joinPhone('XX', '447911123456')).toBe('447911123456')
    expect(isValidPhone('447911123456')).toBe(true)
  })

  it('round-trips every country without changing the number', () => {
    for (const c of COUNTRIES) {
      const national = '5'.repeat(c.nationalLength[1])
      const stored = joinPhone(c.code, national)
      expect(splitPhone(stored)).toEqual({ country: c.code, national })
      expect(isValidPhone(stored)).toBe(true)
    }
  })

  it('checks the length for the number\'s own country', () => {
    expect(isValidPhone('966501234567')).toBe(true)
    expect(isValidPhone('96650123456789')).toBe(false)
    expect(isValidPhone('2010123')).toBe(false)
    expect(isValidPhone('01012345678')).toBe(true)
  })

  it('still validates through the form schemas', () => {
    expect(phoneSchema().safeParse('+20 101 234 5678').data).toBe('201012345678')
    expect(phoneSchema().safeParse('966501234567').success).toBe(true)
    expect(phoneSchema().safeParse('').success).toBe(false)
    expect(bookingClientSchema.safeParse({ client_name: 'سارة', client_phone: '96551234567' }).success).toBe(true)
    expect(bookingClientSchema.safeParse({ client_name: 'سارة', client_phone: '9655123' }).success).toBe(false)
  })

  it('finds a patient by either way of writing the number', () => {
    expect(phoneMatches('201012345678', '01012345678')).toBe(true)
    expect(phoneMatches('201012345678', '٠١٠١٢')).toBe(true)
    expect(phoneMatches('201012345678', '2010123')).toBe(true)
    expect(phoneMatches('201012345678', '5678')).toBe(true)
    expect(phoneMatches('01012345678', '01012345678')).toBe(true)
    expect(phoneMatches('966501234567', '050')).toBe(false)
    expect(phoneMatches('966501234567', '50123')).toBe(true)
    expect(phoneMatches('201012345678', 'سارة')).toBe(false)
    expect(phoneMatches(null, '010')).toBe(false)
  })

  it('shows and dials numbers correctly', () => {
    expect(displayPhone('201012345678')).toBe('01012345678')
    expect(displayPhone('01012345678')).toBe('01012345678')
    expect(displayPhone('966501234567')).toBe('+966 501234567')
    expect(telHref('966501234567')).toBe('tel:+966501234567')
    expect(telHref('01012345678')).toBe('tel:+201012345678')
  })
})

describe('currencies', () => {
  it('has a currency entry for every country', () => {
    for (const c of COUNTRIES) expect(CURRENCIES[c.currency], c.code).toBeTruthy()
  })

  it('formats an amount with the account currency, defaulting to the pound', () => {
    expect(formatMoney(1500, 'SAR')).toBe('1,500 ر.س')
    expect(formatMoney(1500, undefined)).toBe('1,500 ج.م')
    expect(formatMoney(null, 'KWD')).toBe('0 د.ك')
  })
})
