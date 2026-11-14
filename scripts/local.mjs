// `npm run local`: the whole app on this machine, against a throwaway database
// filled with fake data. Nothing here can reach the live site: the app is pointed
// at the local backend, which holds no production keys. Data resets on restart.

import { spawn } from 'node:child_process'
import { SEED_ACCOUNTS, SEED_PASSWORD } from '../tests/local-backend/seed.mjs'

const API_PORT = 54321
const WEB_PORT = 5180

const backend = spawn(process.execPath, ['tests/local-backend/server.mjs'], {
  env: { ...process.env, LOCAL_BACKEND_PORT: String(API_PORT), LOCAL_SEED: '1' },
  stdio: ['ignore', 'pipe', 'inherit'],
})

let backendOut = ''
backend.stdout.on('data', (chunk) => {
  process.stdout.write(chunk)
  backendOut += chunk
  if (!String(chunk).includes('local backend ready')) return
  // The seed prints the demo patient's /my link; its token is new every run.
  const myPage = backendOut.match(/demo patient page: (\/my\/[0-9a-f-]+)/)?.[1]
  const web = spawn('npx', ['vite', '--port', String(WEB_PORT), '--strictPort'], {
    env: {
      ...process.env,
      VITE_SUPABASE_URL: `http://127.0.0.1:${API_PORT}`,
      VITE_SUPABASE_ANON_KEY: 'local-anon-key',
    },
    stdio: 'inherit',
    shell: true,
  })
  web.on('exit', (code) => { backend.kill(); process.exit(code ?? 0) })
  console.log(`
  ─────────────────────────────────────────────
  بسهولة شغال محلي على  http://localhost:${WEB_PORT}
  بيانات وهمية بالكامل وبتتمسح لما تقفله.

  الحسابات (كلمة السر لكلهم: ${SEED_PASSWORD})
${SEED_ACCOUNTS.map(a => `    ${a.email.padEnd(22)} ${a.label}`).join('\n')}

  صفحات الحجز:  /book/demo-clinic   /book/demo-salon
${myPage ? `  مواعيد مريض:  http://localhost:${WEB_PORT}${myPage}\n` : ''}  لوحة الأدمن:  /admin   كلمة السر: local-admin-password
  ─────────────────────────────────────────────
`)
})

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { backend.kill(); process.exit(0) })
