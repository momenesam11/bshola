import { useSyncExternalStore } from 'react'
import { currentRef } from '../lib/refCapture'
import { visitorTrialCopy } from '../lib/trialDays'
import { useRefTrialDays } from './useGrowth'

// The ref code doesn't change while the page is open (it comes with the link).
const subscribe = () => () => {}
const getSnapshot = () => currentRef()
// Prerendered pages (and the first render while hydrating) say the usual 14 days.
const getServerSnapshot = () => null

/**
 * The trial wording for this visitor: null for the usual 14 days, or the
 * texts for the trial their partner's link gives (migration 067).
 */
export function useVisitorTrial() {
  const code = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const { data } = useRefTrialDays(code)
  return visitorTrialCopy(data ?? null)
}
