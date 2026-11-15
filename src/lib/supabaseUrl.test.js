import { describe, it, expect } from 'vitest'
import { resolveSupabaseUrl } from './supabaseUrl'

describe('supabase url', () => {
  it('keeps a full URL as it is', () => {
    expect(resolveSupabaseUrl('https://x.supabase.co', 'http://192.168.1.5:5180')).toBe('https://x.supabase.co')
  })
  it('turns the phone-mode path into an address on the page\'s own host', () => {
    expect(resolveSupabaseUrl('/__api', 'http://192.168.1.5:5180')).toBe('http://192.168.1.5:5180/__api')
  })
})
