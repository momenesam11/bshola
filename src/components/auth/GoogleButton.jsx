import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'

// Public by design: Google sends this ID to every browser that opens the sign-in.
const GOOGLE_CLIENT_ID = '2982041867-29dqb16h0c2vs0a2ja1o3013q11gi8id.apps.googleusercontent.com'
// The one origin listed on that client. Anywhere else (localhost, previews)
// Google refuses its button, so those keep the redirect below.
const GOOGLE_BUTTON_HOST = 'www.beshola.co'
const GOOGLE_BUTTON_MAX_WIDTH = 400

let googleScript = null
function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (!googleScript) {
    googleScript = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.onload = resolve
      script.onerror = () => { googleScript = null; reject(new Error('Google sign-in script failed to load')) }
      document.head.appendChild(script)
    })
  }
  return googleScript
}

// Google signs the hashed nonce into its token, and Supabase checks the raw one
// against it, so a token can't be replayed into another sign-in.
async function createNonce() {
  const raw = crypto.randomUUID()
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  const hashed = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
  return { raw, hashed }
}

function redirectToGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  })
}

// Google names the site that starts the sign-in. Through the redirect that's
// the Supabase project's address, so on the live site the sign-in starts from
// Google's own button instead, and the visitor sees beshola.co. The redirect
// stays as the way in whenever that button can't be used.
export default function GoogleButton({ label = 'الدخول بحساب Google', disabled = false, onStart }) {
  const wrapperRef = useRef(null)
  const googleButtonRef = useRef(null)
  const onStartRef = useRef(onStart)
  const [googleButtonReady, setGoogleButtonReady] = useState(false)

  useEffect(() => {
    onStartRef.current = onStart
  }, [onStart])

  useEffect(() => {
    if (window.location.hostname !== GOOGLE_BUTTON_HOST) return
    let cancelled = false

    async function setUp() {
      try {
        const [, nonce] = await Promise.all([loadGoogleScript(), createNonce()])
        if (cancelled) return
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          nonce: nonce.hashed,
          ux_mode: 'popup',
          callback: async ({ credential }) => {
            const { error } = await supabase.auth.signInWithIdToken({
              provider: 'google',
              token: credential,
              nonce: nonce.raw,
            })
            if (error) {
              await redirectToGoogle()
              return
            }
            // A full load, the same arrival the redirect has always made.
            window.location.assign('/auth/callback')
          },
        })
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          logo_alignment: 'center',
          locale: 'ar',
          width: Math.min(GOOGLE_BUTTON_MAX_WIDTH, wrapperRef.current?.offsetWidth || GOOGLE_BUTTON_MAX_WIDTH),
          click_listener: () => onStartRef.current?.(),
        })
        setGoogleButtonReady(true)
      } catch {
        // Blocked or offline: the redirect button below stays on screen.
      }
    }

    setUp()
    return () => { cancelled = true }
  }, [])

  async function handleClick() {
    onStart?.()
    await redirectToGoogle()
  }

  const showGoogleButton = googleButtonReady && !disabled

  return (
    <div ref={wrapperRef}>
      <div ref={googleButtonRef} className={showGoogleButton ? 'flex justify-center' : 'hidden'} />
      {!showGoogleButton && (
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled}
          className="disabled:opacity-50 disabled:cursor-not-allowed w-full flex items-center justify-center gap-2 border border-gray-200 rounded-lg py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-accent-400 focus:ring-offset-1"
        >
          <svg className="w-4 h-4" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
            <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
            <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
            <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.084 5.571l6.19 5.238C39.871 36.49 44 30.84 44 24c0-1.341-.138-2.65-.389-3.917z" />
          </svg>
          {label}
        </button>
      )}
    </div>
  )
}
