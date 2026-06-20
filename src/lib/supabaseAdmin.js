import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Dedicated client for the hidden /mawid-super-admin-2025 dashboard.
// It never persists or picks up a session, so requests always hit
// Supabase as the "anon" role — even if the browser also has a
// logged-in business owner session open in another tab.
export const supabaseAdmin = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: 'sb-mawid-admin-auth-token',
  },
})
