import { Suspense, lazy, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { Toaster } from 'react-hot-toast'
import { Analytics } from '@vercel/analytics/react'
import { supabase } from './lib/supabase'
import { BranchProvider } from './context/BranchContext'
import TrialGuard from './middleware/TrialGuard'

// The whole logged-in app used to ship in the first chunk, so a visitor landing
// on a marketing page downloaded the dashboard, CRM and reports before seeing
// anything. Lazy-loading them keeps the public pages light, which is what Core
// Web Vitals (a ranking signal) actually measures.
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const Login = lazy(() => import('./pages/auth/Login'))
const Register = lazy(() => import('./pages/auth/Register'))
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'))
const AuthCallback = lazy(() => import('./pages/auth/AuthCallback'))
const OnboardingFlow = lazy(() => import('./pages/onboarding/OnboardingFlow'))
const Dashboard = lazy(() => import('./pages/dashboard/Dashboard'))
const AppointmentList = lazy(() => import('./pages/dashboard/AppointmentList'))
const Reports = lazy(() => import('./pages/reports/Reports'))
const Settings = lazy(() => import('./pages/settings/Settings'))
const BookingPage = lazy(() => import('./pages/booking/BookingPage'))
const ClientsPage = lazy(() => import('./pages/crm/ClientsPage'))
const PatientRecord = lazy(() => import('./pages/patients/PatientRecord'))
const BranchSettings = lazy(() => import('./pages/settings/BranchSettings'))

// Marketing pages stay eagerly imported: they are the entry point for search
// traffic, so an extra round-trip before first paint would be the wrong trade.
import LandingPage from './pages/marketing/LandingPage'
import SolutionPage from './pages/marketing/SolutionPage'
import NotFound from './pages/marketing/NotFound'
import LegalPage from './pages/marketing/LegalPage'
import { ALL_MARKETING_PAGES } from './content/marketingPages'
import { LEGAL_PAGES } from './content/legalPages'

function AuthGuard({ children }) {
  const [session, setSession] = useState(undefined)
  const location = useLocation()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, sess) => setSession(sess))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-accent-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!session) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}

function ProtectedRoute({ children }) {
  return (
    <AuthGuard>
      <TrialGuard>
        <BranchProvider>
          {children}
        </BranchProvider>
      </TrialGuard>
    </AuthGuard>
  )
}

function PublicRoute({ children }) {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, sess) => setSession(sess))
    return () => subscription.unsubscribe()
  }, [])

  // While the session check is in flight we render the public page rather than a
  // spinner: this route is the landing page, and a spinner as the first paint
  // delays LCP and hands crawlers an empty screen. A logged-in visitor sees the
  // landing page for a moment before the redirect below fires — an acceptable
  // trade for the page that has to rank.
  if (session === undefined) return children

  if (session) return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  return (
    <HelmetProvider>
    <BrowserRouter>
        <Toaster
          position="bottom-left"
          toastOptions={{
            style: {
              fontFamily: 'Tajawal, sans-serif',
              direction: 'rtl',
              textAlign: 'right',
              borderRadius: '12px',
              fontSize: '14px',
            },
            success: {
              style: { background: '#D7F5EE', color: '#08594A', border: '1px solid #8FE0CD' },
              iconTheme: { primary: '#16B89A', secondary: '#fff' },
            },
            error: {
              style: { background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA' },
            },
          }}
        />
        <Suspense
          fallback={
            <div className="min-h-screen flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-accent-500 border-t-transparent rounded-full animate-spin" />
            </div>
          }
        >
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/book/:businessSlug" element={<BookingPage />} />
          <Route path="/admin" element={<AdminDashboard />} />

          {/* Protected */}
          <Route path="/onboarding" element={<AuthGuard><OnboardingFlow /></AuthGuard>} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/appointments" element={<ProtectedRoute><AppointmentList /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/settings/branches" element={<ProtectedRoute><BranchSettings /></ProtectedRoute>} />
          <Route path="/crm" element={<ProtectedRoute><ClientsPage /></ProtectedRoute>} />
          <Route path="/patients/:clientPhone" element={<ProtectedRoute><PatientRecord /></ProtectedRoute>} />

          {/* Marketing / SEO pages — generated from content/marketingPages.js so
              adding a keyword page needs a content entry only, and the sitemap
              script reads that same list (a route can never be missing from the
              sitemap). Deliberately NOT wrapped in PublicRoute: they must stay
              readable for crawlers and for already-logged-in visitors. */}
          {ALL_MARKETING_PAGES.map((page) => (
            <Route key={page.slug} path={`/${page.slug}`} element={<SolutionPage slug={page.slug} />} />
          ))}

          {/* Privacy / terms — linked from every public footer, so they have to
              be real routes and not the dead text they used to be. */}
          {LEGAL_PAGES.map((page) => (
            <Route key={page.slug} path={`/${page.slug}`} element={<LegalPage slug={page.slug} />} />
          ))}

          {/* Default */}
          <Route path="/" element={<PublicRoute><LandingPage /></PublicRoute>} />
          {/* A real 404 instead of redirecting to /dashboard: that redirect made
              every typo and dead backlink a soft 404 in Search Console. */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
        <Analytics />
      </BrowserRouter>
    </HelmetProvider>
  )
}
