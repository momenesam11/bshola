import { createClient } from '@supabase/supabase-js'
import { supabaseUrl } from './supabaseUrl'

const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Copy .env.example to .env and fill in values.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
