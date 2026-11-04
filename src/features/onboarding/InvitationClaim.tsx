import { useEffect, useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, LoaderCircle, ShieldCheck, Users } from 'lucide-react'
import { callInvitationFunction } from '../../lib/invitations'

type VerifiedInvitation = {
  project_id: string
  project_name: string
  member_name: string
  invited_email?: string | null
}

type InvitationClaimProps = {
  token: string
  accountEmail: string
  onAccepted: (invitation: VerifiedInvitation, confirmedName: string) => void
  onCancel: () => void
}

const fieldClass =
  'w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/10'

export default function InvitationClaim({
  token,
  accountEmail,
  onAccepted,
  onCancel,
}: InvitationClaimProps) {
  const [invitation, setInvitation] = useState<VerifiedInvitation | null>(null)
  const [confirmedName, setConfirmedName] = useState('')
  const [nameConfirmed, setNameConfirmed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let active = true
    const verify = async () => {
      try {
        const result = await callInvitationFunction('verify', { token })
        if (!result.invitation) throw new Error('The invitation could not be verified.')
        if (!active) return
        setInvitation(result.invitation)
        setConfirmedName(result.invitation.member_name)
      } catch (error) {
        if (active) setErrorMessage(error instanceof Error ? error.message : 'The invitation could not be verified.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void verify()
    return () => { active = false }
  }, [token])

  const accept = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!nameConfirmed || confirmedName.trim().length < 2) {
      setErrorMessage('Confirm the name assigned to this invitation before continuing.')
      return
    }
    setBusy(true)
    setErrorMessage('')
    try {
      const result = await callInvitationFunction('claim', { token })
      if (!result.invitation || !invitation) throw new Error('The invitation could not be claimed.')
      onAccepted(result.invitation, confirmedName.trim())
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The invitation could not be claimed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(139,92,246,.16),transparent_30%),radial-gradient(circle_at_10%_85%,rgba(34,211,238,.12),transparent_32%)]" />
      <motion.section
        animate={{ opacity: 1, y: 0 }}
        initial={{ opacity: 0, y: 14 }}
        className="glass-panel relative w-full max-w-2xl overflow-hidden"
      >
        <div className="border-b border-white/10 bg-gradient-to-r from-violet-500/[0.08] to-cyan-400/[0.08] p-6 sm:p-8">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-300/[0.07] px-3 py-1.5 text-xs text-violet-100">
            <ShieldCheck className="h-3.5 w-3.5" />
            Private invitation · authenticated
          </div>
          <h1 className="text-3xl font-semibold text-white">You’ve been invited to collaborate</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            This invitation is tied to your authenticated account and expires after seven days. Project access is granted only after you confirm and claim it.
          </p>
        </div>

        <div className="p-6 sm:p-8">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-8 text-sm text-slate-300">
              <LoaderCircle className="h-5 w-5 animate-spin text-cyan-200" />
              Verifying invitation securely…
            </div>
          ) : invitation ? (
            <form onSubmit={accept}>
              <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-5">
                <div className="flex items-center gap-3">
                  <span className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-cyan-100">
                    <Users className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Project workspace</p>
                    <h2 className="mt-1 text-lg font-semibold text-white">{invitation.project_name}</h2>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 border-t border-white/5 pt-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-slate-500">Invitation is for</p>
                    <p className="mt-1 text-sm text-slate-200">{invitation.member_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Signed in as</p>
                    <p className="mt-1 break-all text-sm text-slate-200">{accountEmail}</p>
                  </div>
                </div>
              </div>

              <label className="mt-5 block space-y-2 text-sm text-slate-300">
                Confirm your name for the team
                <input
                  className={fieldClass}
                  minLength={2}
                  onChange={(event) => {
                    setConfirmedName(event.target.value)
                    setNameConfirmed(false)
                  }}
                  required
                  value={confirmedName}
                />
              </label>
              <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm leading-6 text-slate-300">
                <input
                  checked={nameConfirmed}
                  className="mt-1 h-4 w-4 accent-cyan-300"
                  onChange={(event) => setNameConfirmed(event.target.checked)}
                  type="checkbox"
                />
                <span>I am the intended teammate for this invitation and want to join this project.</span>
              </label>

              {errorMessage && (
                <p className="mt-4 rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200" role="alert">
                  {errorMessage}
                </p>
              )}
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-cyan-300 to-violet-400 px-5 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50"
                  disabled={busy || !nameConfirmed}
                  type="submit"
                >
                  {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                  Accept invitation and continue
                  {!busy && <ArrowRight className="h-4 w-4" />}
                </button>
                <button className="rounded-full border border-white/10 px-5 py-3 text-sm text-slate-300 hover:bg-white/5" onClick={onCancel} type="button">
                  Sign out
                </button>
              </div>
            </form>
          ) : (
            <div>
              <p className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm leading-6 text-rose-200" role="alert">
                {errorMessage || 'This invitation is invalid, expired, revoked, or intended for a different account.'}
              </p>
              <button className="mt-5 rounded-full border border-white/10 px-5 py-3 text-sm text-slate-200 hover:bg-white/5" onClick={onCancel} type="button">
                Sign out and try the intended account
              </button>
            </div>
          )}
        </div>
      </motion.section>
    </main>
  )
}
