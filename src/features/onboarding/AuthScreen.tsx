import { useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, LoaderCircle, Mail, ShieldCheck, Sparkles } from 'lucide-react'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'

type AuthScreenProps = {
  invitation?: boolean
  recovery?: boolean
  onPasswordUpdated?: () => void
}

type AuthMode = 'login' | 'register' | 'reset' | 'update'

const fieldClass =
  'w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/10'

export default function AuthScreen({
  invitation = false,
  recovery = false,
  onPasswordUpdated,
}: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>(recovery ? 'update' : 'login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [notice, setNotice] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage('')
    setNotice('')
    setBusy(true)

    try {
      if (mode === 'register') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: name.trim() },
            emailRedirectTo: window.location.origin,
          },
        })
        if (error) throw error
        if (!data.session) {
          setNotice('Account created. Check your email to confirm the address, then sign in to continue.')
        }
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin,
        })
        if (error) throw error
        setNotice('If an account exists for that email, a password reset link has been sent.')
      } else if (mode === 'update') {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        setNotice('Password updated.')
        onPasswordUpdated?.()
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) throw error
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Authentication failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const setAuthMode = (nextMode: AuthMode) => {
    setMode(nextMode)
    setErrorMessage('')
    setNotice('')
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(34,211,238,.12),transparent_30%),radial-gradient(circle_at_90%_80%,rgba(139,92,246,.16),transparent_32%)]" />
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel relative grid w-full max-w-5xl overflow-hidden lg:grid-cols-[1fr_0.9fr]"
      >
        <div className="grid-sheen hidden flex-col justify-between border-r border-white/10 p-10 lg:flex">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400/30 to-violet-500/30 ring-1 ring-white/10">
              <Sparkles className="h-5 w-5 text-cyan-200" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Aithya</p>
              <p className="font-semibold text-white">Project Studio</p>
            </div>
          </div>
          <div className="max-w-md">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-100">
              <ShieldCheck className="h-3.5 w-3.5" />
              {invitation ? 'Private team invitation' : 'One account, every project'}
            </p>
            <h1 className="text-4xl font-semibold leading-tight text-white">
              {invitation ? 'Join your team workspace.' : 'Make good ideas ship.'}
            </h1>
            <p className="mt-4 leading-7 text-slate-300">
              {invitation
                ? 'Sign in or create your account first. Your project details stay private until your invitation is securely verified.'
                : 'Plan projects with your team, define the rules up front, and keep every build connected to its learning.'}
            </p>
          </div>
          <p className="text-xs text-slate-500">Midnight Glass · Built for collaborative project work</p>
        </div>

        <div className="p-6 sm:p-10">
          <div className="mb-8 lg:hidden">
            <p className="text-xs uppercase tracking-[0.28em] text-cyan-200">Aithya · Project Studio</p>
            <p className="mt-2 text-sm text-slate-400">
              {invitation ? 'Authenticate to verify your private team invitation.' : 'Your projects, one account.'}
            </p>
          </div>

          <div className="mb-7">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
              {mode === 'register' ? 'Create account' : mode === 'reset' ? 'Account recovery' : mode === 'update' ? 'Secure your account' : 'Welcome back'}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              {mode === 'register' ? 'Start with your profile' : mode === 'reset' ? 'Reset your password' : mode === 'update' ? 'Choose a new password' : 'Sign in to continue'}
            </h2>
          </div>

          {!isSupabaseConfigured && (
            <div role="alert" className="mb-5 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">
              Authentication is disabled until a Supabase project is configured. Add the public project URL and anon key to <code>.env.local</code>, then restart Vite.
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <label className="block space-y-2 text-sm text-slate-300">
                Full name
                <input
                  autoComplete="name"
                  className={fieldClass}
                  minLength={2}
                  onChange={(event) => setName(event.target.value)}
                  required
                  value={name}
                />
              </label>
            )}
            <label className="block space-y-2 text-sm text-slate-300">
              Email address
              <span className="relative block">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  autoComplete="email"
                  className={`${fieldClass} pl-11`}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </span>
            </label>
            {mode !== 'reset' && (
              <label className="block space-y-2 text-sm text-slate-300">
                Password
                <input
                  autoComplete={mode === 'register' || mode === 'update' ? 'new-password' : 'current-password'}
                  className={fieldClass}
                  minLength={8}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
                <span className="block text-xs text-slate-500">Use at least 8 characters.</span>
              </label>
            )}

            {errorMessage && (
              <p role="alert" className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {errorMessage}
              </p>
            )}
            {notice && (
              <p role="status" className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                {notice}
              </p>
            )}

            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-cyan-300 to-violet-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={busy || !isSupabaseConfigured}
              type="submit"
            >
              {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}
              {mode === 'register' ? 'Create account' : mode === 'reset' ? 'Send reset link' : mode === 'update' ? 'Update password' : 'Sign in'}
              {!busy && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
            {mode === 'login' ? (
              <>
                <button className="text-slate-400 transition hover:text-cyan-200" onClick={() => setAuthMode('reset')} type="button">
                  Forgot password?
                </button>
                <button className="font-medium text-cyan-200 hover:text-white" onClick={() => setAuthMode('register')} type="button">
                  Create account
                </button>
              </>
            ) : (
              <button className="font-medium text-cyan-200 hover:text-white" onClick={() => setAuthMode('login')} type="button">
                Back to sign in
              </button>
            )}
          </div>
        </div>
      </motion.section>
    </main>
  )
}
