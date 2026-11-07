// Arab countries and their currencies: the phone dropdown, each account's
// currency and the regional price list all read from here.
//
// `nationalLength` is the digit count after the dial code, without a leading 0.
// It covers mobiles and landlines, because the same field takes both.

export const CURRENCIES = {
  EGP: { label: 'جنيه', short: 'ج.م', name: 'جنيه مصري', inWord: 'بالجنيه' },
  SAR: { label: 'ريال', short: 'ر.س', name: 'ريال سعودي', inWord: 'بالريال' },
  AED: { label: 'درهم', short: 'د.إ', name: 'درهم إماراتي', inWord: 'بالدرهم' },
  QAR: { label: 'ريال', short: 'ر.ق', name: 'ريال قطري', inWord: 'بالريال' },
  KWD: { label: 'دينار', short: 'د.ك', name: 'دينار كويتي', inWord: 'بالدينار' },
  BHD: { label: 'دينار', short: 'د.ب', name: 'دينار بحريني', inWord: 'بالدينار' },
  OMR: { label: 'ريال', short: 'ر.ع', name: 'ريال عماني', inWord: 'بالريال' },
  JOD: { label: 'دينار', short: 'د.أ', name: 'دينار أردني', inWord: 'بالدينار' },
  MAD: { label: 'درهم', short: 'د.م', name: 'درهم مغربي', inWord: 'بالدرهم' },
  TND: { label: 'دينار', short: 'د.ت', name: 'دينار تونسي', inWord: 'بالدينار' },
  DZD: { label: 'دينار', short: 'د.ج', name: 'دينار جزائري', inWord: 'بالدينار' },
  LYD: { label: 'دينار', short: 'د.ل', name: 'دينار ليبي', inWord: 'بالدينار' },
  IQD: { label: 'دينار', short: 'د.ع', name: 'دينار عراقي', inWord: 'بالدينار' },
  LBP: { label: 'ليرة', short: 'ل.ل', name: 'ليرة لبنانية', inWord: 'بالليرة' },
  SYP: { label: 'ليرة', short: 'ل.س', name: 'ليرة سورية', inWord: 'بالليرة' },
  ILS: { label: 'شيكل', short: '₪', name: 'شيكل', inWord: 'بالشيكل' },
  SDG: { label: 'جنيه', short: 'ج.س', name: 'جنيه سوداني', inWord: 'بالجنيه' },
  YER: { label: 'ريال', short: 'ر.ي', name: 'ريال يمني', inWord: 'بالريال' },
  MRU: { label: 'أوقية', short: 'أ.م', name: 'أوقية موريتانية', inWord: 'بالأوقية' },
  SOS: { label: 'شلن', short: 'ش.ص', name: 'شلن صومالي', inWord: 'بالشلن' },
  DJF: { label: 'فرنك', short: 'ف.ج', name: 'فرنك جيبوتي', inWord: 'بالفرنك' },
  KMF: { label: 'فرنك', short: 'ف.ق', name: 'فرنك قمري', inWord: 'بالفرنك' },
  USD: { label: 'دولار', short: '$', name: 'دولار أمريكي', inWord: 'بالدولار' },
}

export const COUNTRIES = [
  { code: 'EG', name: 'مصر', flag: '🇪🇬', dial: '20', currency: 'EGP', nationalLength: [8, 10] },
  { code: 'SA', name: 'السعودية', flag: '🇸🇦', dial: '966', currency: 'SAR', nationalLength: [8, 9] },
  { code: 'AE', name: 'الإمارات', flag: '🇦🇪', dial: '971', currency: 'AED', nationalLength: [8, 9] },
  { code: 'QA', name: 'قطر', flag: '🇶🇦', dial: '974', currency: 'QAR', nationalLength: [8, 8] },
  { code: 'KW', name: 'الكويت', flag: '🇰🇼', dial: '965', currency: 'KWD', nationalLength: [8, 8] },
  { code: 'BH', name: 'البحرين', flag: '🇧🇭', dial: '973', currency: 'BHD', nationalLength: [8, 8] },
  { code: 'OM', name: 'عُمان', flag: '🇴🇲', dial: '968', currency: 'OMR', nationalLength: [8, 8] },
  { code: 'JO', name: 'الأردن', flag: '🇯🇴', dial: '962', currency: 'JOD', nationalLength: [8, 9] },
  { code: 'MA', name: 'المغرب', flag: '🇲🇦', dial: '212', currency: 'MAD', nationalLength: [9, 9] },
  { code: 'TN', name: 'تونس', flag: '🇹🇳', dial: '216', currency: 'TND', nationalLength: [8, 8] },
  { code: 'DZ', name: 'الجزائر', flag: '🇩🇿', dial: '213', currency: 'DZD', nationalLength: [8, 9] },
  { code: 'LY', name: 'ليبيا', flag: '🇱🇾', dial: '218', currency: 'LYD', nationalLength: [8, 9] },
  { code: 'IQ', name: 'العراق', flag: '🇮🇶', dial: '964', currency: 'IQD', nationalLength: [8, 10] },
  { code: 'LB', name: 'لبنان', flag: '🇱🇧', dial: '961', currency: 'LBP', nationalLength: [7, 8] },
  { code: 'SY', name: 'سوريا', flag: '🇸🇾', dial: '963', currency: 'SYP', nationalLength: [8, 9] },
  { code: 'PS', name: 'فلسطين', flag: '🇵🇸', dial: '970', currency: 'ILS', nationalLength: [8, 9] },
  { code: 'SD', name: 'السودان', flag: '🇸🇩', dial: '249', currency: 'SDG', nationalLength: [9, 9] },
  { code: 'YE', name: 'اليمن', flag: '🇾🇪', dial: '967', currency: 'YER', nationalLength: [7, 9] },
  { code: 'MR', name: 'موريتانيا', flag: '🇲🇷', dial: '222', currency: 'MRU', nationalLength: [8, 8] },
  { code: 'SO', name: 'الصومال', flag: '🇸🇴', dial: '252', currency: 'SOS', nationalLength: [7, 9] },
  { code: 'DJ', name: 'جيبوتي', flag: '🇩🇯', dial: '253', currency: 'DJF', nationalLength: [8, 8] },
  { code: 'KM', name: 'جزر القمر', flag: '🇰🇲', dial: '269', currency: 'KMF', nationalLength: [7, 7] },
]

// Numbers from anywhere else still have to work, such as a foreign patient
// visiting a clinic. This entry takes the full international number as typed.
export const OTHER_COUNTRY = { code: 'XX', name: 'دولة أخرى', flag: '🌐', dial: '', currency: 'USD', nationalLength: [10, 15] }

export const DEFAULT_COUNTRY = 'EG'

export const countryByCode = (code) => COUNTRIES.find((c) => c.code === code)
export const isArabCountry = (code) => Boolean(countryByCode(code))
export const currencyFor = (code) => CURRENCIES[code] ?? CURRENCIES.EGP
export const defaultCurrencyOf = (countryCode) => countryByCode(countryCode)?.currency ?? 'EGP'

export function formatMoney(amount, currencyCode) {
  const value = Number(amount || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
  return `${value} ${currencyFor(currencyCode).short}`
}

const ARABIC_DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' }

/** Digits only, with Arabic numerals converted: phones here often type them. */
export function phoneDigits(raw) {
  return String(raw ?? '')
    .replace(/[٠-٩۰-۹]/g, (d) => ARABIC_DIGITS[d])
    .replace(/[^0-9]/g, '')
}

const countryFromDigits = (digits) => COUNTRIES.find((c) => digits.startsWith(c.dial))

/**
 * Splits a stored number for the dropdown. Numbers saved before the dropdown can
 * be local (01012345678), so those read as Egyptian. `country` is null when the
 * number has no digits yet, and XX when its code isn't one of ours.
 */
export function splitPhone(raw) {
  let digits = phoneDigits(raw)
  if (!digits) return { country: null, national: '' }
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (/^0\d{8,10}$/.test(digits)) return { country: 'EG', national: digits.slice(1) }
  if (/^1\d{9}$/.test(digits)) return { country: 'EG', national: digits }
  const match = countryFromDigits(digits)
  if (match) return { country: match.code, national: digits.slice(match.dial.length) }
  return { country: OTHER_COUNTRY.code, national: digits }
}

/** What gets stored: international digits with no "+", such as 966501234567. */
export function joinPhone(countryCode, national) {
  const digits = phoneDigits(national)
  if (countryCode === OTHER_COUNTRY.code) return digits.replace(/^00/, '')
  const country = countryByCode(countryCode) ?? countryByCode(DEFAULT_COUNTRY)
  const local = digits.replace(/^0+/, '')
  return local ? `${country.dial}${local}` : ''
}

/**
 * What someone typed or pasted into the number box. People paste full numbers,
 * so "+966501234567", "00966..." and, with Saudi selected, "966501234567" all
 * keep one code instead of gaining a second.
 */
export function phoneFromInput(countryCode, raw) {
  const text = String(raw ?? '').trim()
  const digits = phoneDigits(text)
  if (text.startsWith('+') || digits.startsWith('00')) return digits.replace(/^00/, '')
  const country = countryByCode(countryCode)
  if (country && digits.startsWith(country.dial) && digits.length > country.nationalLength[1]) return digits
  return joinPhone(countryCode, digits)
}

/** Checks the length for the number's own country, on top of the 10-15 digit rule. */
export function isValidPhone(raw) {
  const digits = phoneDigits(raw)
  if (!/^[0-9]{10,15}$/.test(digits)) return false
  const { country, national } = splitPhone(digits)
  const known = countryByCode(country)
  if (!known) return true
  const [min, max] = known.nationalLength
  return national.length >= min && national.length <= max
}

/** How a number is shown to people: 01012345678 in Egypt, +966 501234567 elsewhere. */
export function displayPhone(raw) {
  const { country, national } = splitPhone(raw)
  if (!national) return ''
  if (country === 'EG') return `0${national}`
  const known = countryByCode(country)
  return known ? `+${known.dial} ${national}` : `+${national}`
}

export function telHref(raw) {
  const { country, national } = splitPhone(raw)
  const known = countryByCode(country)
  return `tel:+${known ? known.dial : ''}${national}`
}
