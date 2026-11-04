import { requireSupabaseConfig, supabase } from './supabase'
import type { InvitationRecord } from '../features/onboarding/types'

type InvitationResponse = {
  invitationId?: string
  token?: string
  expiresAt?: string
  invitation?: {
    project_id: string
    project_name: string
    member_name: string
    invited_email?: string | null
  }
  invitations?: InvitationRecord[]
  revoked?: boolean
  error?: string
}

export function buildInvitationLink(token: string) {
  const url = new URL(window.location.href)
  url.searchParams.delete('invite')
  url.hash = new URLSearchParams({ invite: token }).toString()
  return url.toString()
}

export async function callInvitationFunction(
  action: 'create' | 'verify' | 'claim' | 'status' | 'revoke',
  values: Record<string, string>,
) {
  requireSupabaseConfig()
  const { data, error } = await supabase.functions.invoke<InvitationResponse>('invitations', {
    body: { action, ...values },
  })

  if (error) {
    throw new Error(error.message || 'Invitation service request failed.')
  }
  if (data?.error) {
    throw new Error(data.error)
  }
  if (!data) {
    throw new Error('Invitation service returned an empty response.')
  }

  return data
}
