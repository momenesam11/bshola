import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useBusiness } from '../hooks/useBusiness'
import TrialExpiredScreen from '../pages/trial/TrialExpiredScreen'
import TrialWarningBanner from '../components/trial/TrialWarningBanner'

export default function TrialGuard({ children }) {
  const { data: business, isSuccess } = useBusiness()
  const [dismissed, setDismissed] = useState(false)

  // Signed up but never finished onboarding: every page would be empty and
  // nothing could be added, so send them to finish it.
  if (isSuccess && business === null) return <Navigate to="/onboarding" replace />
  if (!business) return children

  const trialEndsAt = business.trial_ends_at ? new Date(business.trial_ends_at) : null
  const isExpired = business.is_active === false || (trialEndsAt && trialEndsAt < new Date())
  const left = trialEndsAt ? Math.ceil((trialEndsAt - new Date()) / (1000 * 60 * 60 * 24)) : null
  const showWarning = !isExpired && left !== null && left >= 0 && left < 3 && !dismissed

  return (
    <>
      {showWarning && (
        <TrialWarningBanner daysLeft={left} isPaid={business.subscription_type === 'paid'} onDismiss={() => setDismissed(true)} />
      )}
      {children}
      {isExpired && <TrialExpiredScreen />}
    </>
  )
}
