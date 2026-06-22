import { createClient } from '@supabase/supabase-js'
import { loadEnv } from './env'

loadEnv()

// Plain anon-role client — used to call the REST API directly the same way
// the public booking page does, so RLS policies (C2/C4/C5 fixes) are
// exercised exactly as a real anonymous visitor would hit them.
export const supabaseAnon = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!,
)
