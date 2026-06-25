import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.jsx'
import { supabase } from './lib/supabase'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      retry: 1,
    },
  },
})

// Clear all cached data whenever the logged-in user changes (sign out, or
// signing in as a different account) so the new session never sees stale
// data left over from the previous one.
let lastUserId = null
supabase.auth.onAuthStateChange((_event, session) => {
  const userId = session?.user?.id ?? null
  if (userId !== lastUserId) {
    queryClient.clear()
    lastUserId = userId
  }
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
