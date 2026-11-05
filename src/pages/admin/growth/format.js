import toast from 'react-hot-toast'
import { SOURCE_BY_KEY, CATEGORY_BY_KEY } from '../../../lib/growth/constants'

// Non-component helpers for the growth screens (kept out of ui.jsx so React
// fast refresh keeps working there).

export const sourceLabel = (key) => SOURCE_BY_KEY[key]?.label ?? key
export const categoryLabel = (key) => CATEGORY_BY_KEY[key]?.label ?? key

export const inputClass =
  'w-full border border-rule rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-accent-400 bg-white'

export async function copyText(text, done = 'اتنسخ ✓') {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(done)
  } catch {
    toast.error('مقدرتش أنسخ — انسخه بإيدك')
  }
}

export function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

export function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** <input type="datetime-local"> value ↔ ISO, in the browser's local time. */
export function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export const fromLocalInput = (value) => (value ? new Date(value).toISOString() : null)

export function downloadCsv(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
