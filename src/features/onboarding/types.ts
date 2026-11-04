export type ProjectSummary = {
  id: string
  name: string
  leader_id: string
  onboarding_finalized_at: string | null
  workflow_status: 'provided' | 'requires_generation'
  hackathon_name?: string
  description?: string
  theme?: string
}

export type ProjectMemberRecord = {
  id: string
  project_id: string
  user_id: string | null
  email: string | null
  full_name: string
  role: string
  preliminary_skills: string[]
  status: 'invited' | 'accepted'
  is_leader: boolean
  profile_completed_at: string | null
}

export type InvitationRecord = {
  id: string
  project_member_id: string
  claim_status: 'pending' | 'claimed' | 'revoked' | 'expired'
  expires_at: string
  claimed_at: string | null
  revoked_at: string | null
  created_at: string
}

export type MemberProfile = {
  full_name: string
  interests: string[]
  preferred_technologies: string[]
  availability: string
}

export type SkillDraft = {
  category: string
  skill_name: string
  proficiency: 'beginner' | 'intermediate' | 'advanced' | 'expert'
  evidence: string
}
