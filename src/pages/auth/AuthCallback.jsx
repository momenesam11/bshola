import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false

    async function decide() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        navigate('/login', { replace: true })
        return
      }
      const { data: business } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', user.id)
        .maybeSingle()
      if (cancelled) return
      navigate(business ? '/dashboard' : '/onboarding', { replace: true })
    }

    decide()
    return () => { cancelled = true }
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-accent-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
