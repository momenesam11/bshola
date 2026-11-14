// The Supabase address the app talks to. Normally a full URL from the
// environment. `npm run local:phone` sets a path instead ('/__api'), which the
// dev server forwards to the local backend, so a phone on the same Wi-Fi
// reaches it through the page's own address while the backend itself stays
// closed to the network.
export function resolveSupabaseUrl(value, origin = typeof window !== 'undefined' ? window.location.origin : '') {
  if (value && value.startsWith('/') && origin) return `${origin}${value}`
  return value
}

export const supabaseUrl = resolveSupabaseUrl(import.meta.env.VITE_SUPABASE_URL)
