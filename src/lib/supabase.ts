import { createClient } from '@supabase/supabase-js'

const configuredUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const configuredAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const isSupabaseConfigured = Boolean(
  configuredUrl
    && configuredAnonKey
    && configuredUrl.startsWith('https://')
    && !configuredUrl.includes('your-project')
    && configuredAnonKey !== 'your-anon-key',
)

export const requireSupabaseConfig = () => {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.')
  }
}

export const supabase = createClient(
  isSupabaseConfigured ? configuredUrl : 'https://example.supabase.co',
  isSupabaseConfigured ? configuredAnonKey : 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  },
)

export const logSupabaseSetup = () => isSupabaseConfigured
  ? 'Supabase configured'
  : 'Supabase setup required'
