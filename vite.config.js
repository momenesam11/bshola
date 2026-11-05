import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  // The prerender build (entry-server.jsx) bundles everything into one file. It
  // only renders HTML and never talks to Supabase, so it doesn't need real
  // settings: a placeholder keeps the client's import from failing on any
  // environment without them, and keeps real values out of that bundle.
  ...(isSsrBuild && {
    ssr: { noExternal: true },
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://prerender.invalid'),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('prerender'),
    },
  }),
}))
