import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { adminLogin } from '../../hooks/useAdmin'

/** Password screen shared by /admin and /admin/growth (same admin session). */
export default function PasswordGate({ onAuthenticated }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    const token = await adminLogin(password)
    setLoading(false)
    if (token) {
      onAuthenticated()
    } else {
      setError(true)
      setTimeout(() => setError(false), 500)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir="rtl">
      <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
      <form
        onSubmit={handleSubmit}
        className={`w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center ${error ? 'animate-shake' : ''}`}
      >
        <div className="inline-flex items-center justify-center w-14 h-14 bg-accent-500 rounded-2xl mb-3 shadow-lg">
          <span className="text-white font-bold text-2xl">ب</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-4">لوحة تحكم المالك</h1>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="كلمة السر"
          dir="ltr"
          autoFocus
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-accent-400"
        />
        {error && <p className="text-xs text-red-500 mt-2">كلمة السر غلط</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full mt-4 bg-accent-500 text-white font-medium rounded-lg py-2.5 text-sm hover:bg-accent-600 transition-colors disabled:opacity-50"
        >
          {loading ? 'جاري التحقق...' : 'دخول'}
        </button>
      </form>
      <style>{`
        @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }
        .animate-shake { animation: shake 0.3s; }
      `}</style>
    </div>
  )
}
