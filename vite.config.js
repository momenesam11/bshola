import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The prerender build (entry-server.jsx) bundles everything into one file.
  ssr: { noExternal: true },
})
