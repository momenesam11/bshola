import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { Toaster } from 'react-hot-toast'
import { Analytics } from '@vercel/analytics/react'
import { supabase } from './lib/supabase'
import { BranchProvider } from './context/BranchContext'
import TrialGuard from './middleware/TrialGuard'
import AdminDashboard from './pages/admin/AdminDashboard'

import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'
import AuthCallback from './pages/auth/AuthCallback'
import OnboardingFlow from './pages/onboarding/OnboardingFlow'
import Dashboard from './pages/dashboard/Dashboard'
import AppointmentList from './pages/dashboard/AppointmentList'
import Reports from './pages/reports/Reports'
import Settings from './pages/settings/Settings'
import BookingPage from './pages/booking/BookingPage'
import ClientsPage from './pages/crm/ClientsPage'
import PatientRecord from './pages/patients/PatientRecord'
import BranchSettings from './pages/settings/BranchSettings'
import LandingPage from './pages/marketing/LandingPage'

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

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-accent-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

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

          {/* Default */}
          <Route path="/" element={<PublicRoute><LandingPage /></PublicRoute>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        <Analytics />
      </BrowserRouter>
    </HelmetProvider>
  )
}
