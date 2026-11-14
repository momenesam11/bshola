import { defineConfig } from 'vite'
import process from 'node:process'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  // `npm run local:phone` (scripts/local.mjs): the app calls /__api on its own
  // address and this forwards it to the local backend on 127.0.0.1.
  ...(process.env.LOCAL_API_PROXY && {
    server: {
      proxy: {
        '/__api': {
          target: process.env.LOCAL_API_PROXY,
          changeOrigin: true,
          // No websockets: the local backend has no Realtime server, so the
          // app's retry every 10 s only filled the terminal with proxy errors.
          // It behaves as under `npm run local`: no live updates, refresh to see changes.
          ws: false,
          rewrite: (path) => path.replace(/^\/__api/, ''),
        },
      },
    },
  }),
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
