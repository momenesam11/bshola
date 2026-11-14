// `npm run local`: the whole app on this machine, against a throwaway database
// filled with fake data. Nothing here can reach the live site: the app is pointed
// at the local backend, which holds no production keys. Data resets on restart.
//
// `npm run local:phone` does the same and also opens the pages to phones on the
// same Wi-Fi. The backend still listens on 127.0.0.1 only: the dev server
// forwards /__api to it (vite.config.js), so nothing else on the network can
// reach the database directly.

import { spawn } from 'node:child_process'
import { networkInterfaces } from 'node:os'
import { SEED_ACCOUNTS, SEED_PASSWORD } from '../tests/local-backend/seed.mjs'

const API_PORT = 54321
const WEB_PORT = 5180
const PHONE = process.argv.includes('--phone')

// This computer's addresses on the local network, for typing into a phone.
function lanAddresses() {
  return Object.values(networkInterfaces()).flat()
    .filter(a => a && a.family === 'IPv4' && !a.internal)
    .map(a => a.address)
    .filter(a => /^(192\.168|10|172\.(1[6-9]|2\d|3[01]))\./.test(a))
}

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
  const web = spawn('npx', ['vite', '--port', String(WEB_PORT), '--strictPort', ...(PHONE ? ['--host'] : [])], {
    env: {
      ...process.env,
      VITE_SUPABASE_URL: PHONE ? '/__api' : `http://127.0.0.1:${API_PORT}`,
      VITE_SUPABASE_ANON_KEY: 'local-anon-key',
      ...(PHONE && { LOCAL_API_PROXY: `http://127.0.0.1:${API_PORT}` }),
    },
    stdio: 'inherit',
    shell: true,
  })
  web.on('exit', (code) => { backend.kill(); process.exit(code ?? 0) })

  const lan = PHONE ? lanAddresses() : []
  const base = lan.length ? `http://${lan[0]}:${WEB_PORT}` : `http://localhost:${WEB_PORT}`
  const phoneLines = !PHONE ? '' : lan.length
    ? `
  📱 من الموبايل (لازم يكون على نفس الـWi-Fi):
${lan.map(ip => `       http://${ip}:${WEB_PORT}`).join('\n')}
     لو ويندوز سألك عن الـFirewall، اختار «Private networks» ودوس Allow.
`
    : `
  📱 مش لاقي عنوان للكمبيوتر على الـWi-Fi. اتأكد إنه متوصل بالشبكة.
`
  console.log(`
  ─────────────────────────────────────────────
  بسهولة شغال محلي على  http://localhost:${WEB_PORT}
  بيانات وهمية بالكامل وبتتمسح لما تقفله.
${phoneLines}
  الحسابات (كلمة السر لكلهم: ${SEED_PASSWORD})
${SEED_ACCOUNTS.map(a => `    ${a.email.padEnd(22)} ${a.label}`).join('\n')}

  صفحات الحجز:  /book/demo-clinic   /book/demo-salon
${myPage ? `  مواعيد مريض:  ${base}${myPage}\n` : ''}  لوحة الأدمن:  /admin   كلمة السر: local-admin-password
  ─────────────────────────────────────────────
`)
})

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { backend.kill(); process.exit(0) })
