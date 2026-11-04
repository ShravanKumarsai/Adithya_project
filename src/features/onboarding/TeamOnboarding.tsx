import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clipboard,
  Clock3,
  LoaderCircle,
  Mail,
  RefreshCw,
  ShieldCheck,
  UserRound,
  Users,
  XCircle,
} from 'lucide-react'
import { buildInvitationLink, callInvitationFunction } from '../../lib/invitations'
import { requireSupabaseConfig, supabase } from '../../lib/supabase'
import type { InvitationRecord, ProjectMemberRecord, ProjectSummary } from './types'

type TeamOnboardingProps = {
  project: ProjectSummary
  userId: string
  initialLinks?: Record<string, string>
  initialWarnings?: string[]
  onDashboard: () => void
}

type ProjectDocument = {
  id: string
  file_name: string
  document_type: 'rulebook' | 'supporting' | 'workflow'
  storage_path: string
  created_at: string
}

type ProjectSkill = {
  id: string
  user_id: string
  category: string
  skill_name: string
  self_assessed_level: string
  self_evidence: string
  verified_level: string | null
  verified_evidence: string
  verified_at: string | null
  verified_by: string | null
}

const iconBadge = 'rounded-xl border border-white/10 bg-white/5 p-2 text-cyan-100'

export default function TeamOnboarding({
  project,
  userId,
  initialLinks = {},
  initialWarnings = [],
  onDashboard,
}: TeamOnboardingProps) {
  const [members, setMembers] = useState<ProjectMemberRecord[]>([])
  const [invitations, setInvitations] = useState<InvitationRecord[]>([])
  const [documents, setDocuments] = useState<ProjectDocument[]>([])
  const [skillRecords, setSkillRecords] = useState<ProjectSkill[]>([])
  const [verifiedUsers, setVerifiedUsers] = useState<Set<string>>(new Set())
  const [links, setLinks] = useState<Record<string, string>>(initialLinks)
  const [loading, setLoading] = useState(true)
  const [busyMember, setBusyMember] = useState('')
  const [busyAction, setBusyAction] = useState(false)
  const [uploadingDocuments, setUploadingDocuments] = useState(false)
  const [downloadingDocument, setDownloadingDocument] = useState('')
  const [verifyingSkill, setVerifyingSkill] = useState('')
  const [documentType, setDocumentType] = useState<ProjectDocument['document_type']>('supporting')
  const [errorMessage, setErrorMessage] = useState('')
  const [notice, setNotice] = useState(initialWarnings.join(' '))
  const [copiedMember, setCopiedMember] = useState('')
  const [confirmIncomplete, setConfirmIncomplete] = useState(false)
  const [finalized, setFinalized] = useState(Boolean(project.onboarding_finalized_at))

  const isLeader = project.leader_id === userId

  const loadTeam = useCallback(async () => {
    try {
      requireSupabaseConfig()
      const [projectResult, memberResult, skillsResult, documentResult] = await Promise.all([
        supabase.from('projects')
          .select('id, name, leader_id, onboarding_finalized_at, workflow_status')
          .eq('id', project.id)
          .single(),
        supabase.from('project_members')
          .select('id, project_id, user_id, email, full_name, role, preliminary_skills, status, is_leader, profile_completed_at')
          .eq('project_id', project.id)
          .order('created_at', { ascending: true }),
        supabase.from('user_skills')
          .select('id, user_id, category, skill_name, self_assessed_level, self_evidence, verified_level, verified_evidence, verified_at, verified_by')
          .eq('project_id', project.id),
        supabase.from('project_documents')
          .select('id, file_name, document_type, storage_path, created_at')
          .eq('project_id', project.id)
          .order('created_at', { ascending: false }),
      ])
      if (projectResult.error) throw projectResult.error
      if (memberResult.error) throw memberResult.error
      if (skillsResult.error) throw skillsResult.error
      if (documentResult.error) throw documentResult.error
      setMembers(memberResult.data ?? [])
      setDocuments(documentResult.data ?? [])
      setSkillRecords(skillsResult.data ?? [])
      setVerifiedUsers(new Set(
        (skillsResult.data ?? [])
          .filter((skill) => skill.verified_level !== null)
          .map((skill) => skill.user_id),
      ))
      setFinalized(Boolean(projectResult.data.onboarding_finalized_at))

      if (isLeader) {
        const status = await callInvitationFunction('status', { projectId: project.id })
        setInvitations(status.invitations ?? [])
      } else {
        setInvitations([])
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not load team onboarding.')
    } finally {
      setLoading(false)
    }
  }, [isLeader, project.id])

  useEffect(() => {
    void loadTeam()
  }, [loadTeam])

  const completedCount = members.filter((member) => member.profile_completed_at).length
  const acceptedCount = members.filter((member) => member.status === 'accepted').length
  const incompleteCount = members.filter((member) => !member.profile_completed_at).length
  const pendingCount = members.filter((member) => member.status === 'invited').length

  const latestInvitationByMember = useMemo(() => {
    const result = new Map<string, InvitationRecord>()
    for (const invitation of invitations) {
      if (!result.has(invitation.project_member_id)) result.set(invitation.project_member_id, invitation)
    }
    return result
  }, [invitations])

  const createInvite = async (memberId: string) => {
    setBusyMember(memberId)
    setErrorMessage('')
    setNotice('')
    try {
      const result = await callInvitationFunction('create', { projectMemberId: memberId })
      if (!result.token) throw new Error('The invitation service did not return a token.')
      const token = result.token
      setLinks((current) => ({ ...current, [memberId]: buildInvitationLink(token) }))
      setNotice('Invitation link generated. Share it directly with the intended teammate; it expires in seven days.')
      await loadTeam()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not create the invitation.')
    } finally {
      setBusyMember('')
    }
  }

  const revokeInvite = async (invitationId: string) => {
    setBusyMember(invitationId)
    setErrorMessage('')
    setNotice('')
    try {
      await callInvitationFunction('revoke', { invitationId })
      setNotice('Invitation revoked. Its link can no longer be claimed.')
      await loadTeam()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not revoke the invitation.')
    } finally {
      setBusyMember('')
    }
  }

  const copyLink = async (memberId: string) => {
    const link = links[memberId]
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopiedMember(memberId)
      window.setTimeout(() => setCopiedMember(''), 1800)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not copy the invitation link.')
    }
  }

  const downloadDocument = async (item: ProjectDocument) => {
    setDownloadingDocument(item.id)
    setErrorMessage('')
    try {
      const { data, error } = await supabase.storage
        .from('project-documents')
        .createSignedUrl(item.storage_path, 60)
      if (error) throw error
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not open this document.')
    } finally {
      setDownloadingDocument('')
    }
  }

  const verifySkill = async (skill: ProjectSkill, level: string, evidence: string) => {
    if (evidence.trim().length < 8) {
      setErrorMessage('Add at least eight characters describing the skill evidence.')
      return
    }
    setVerifyingSkill(skill.id)
    setErrorMessage('')
    setNotice('')
    try {
      requireSupabaseConfig()
      const { error } = await supabase.rpc('verify_project_member_skill', {
        p_project_id: project.id,
        p_skill_id: skill.id,
        p_verified_level: level,
        p_verified_evidence: evidence.trim(),
      })
      if (error) throw error
      setSkillRecords((current) => current.map((record) => record.id === skill.id
        ? {
            ...record,
            verified_level: level,
            verified_evidence: evidence.trim(),
            verified_at: new Date().toISOString(),
            verified_by: userId,
          }
        : record))
      setVerifiedUsers((current) => new Set(current).add(skill.user_id))
      setNotice(`${skill.skill_name} has been marked as verified for this project.`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not verify this skill.')
    } finally {
      setVerifyingSkill('')
    }
  }

  const uploadDocuments = async (fileList: FileList | null) => {
    if (!fileList || !isLeader) return
    const files = Array.from(fileList)
    if (files.some((file) => file.size > 15 * 1024 * 1024)) {
      setErrorMessage('Each document must be smaller than 15 MB.')
      return
    }
    if (documentType === 'rulebook' && files.some((file) => !file.name.toLowerCase().endsWith('.pdf'))) {
      setErrorMessage('Rulebooks must be PDF files.')
      return
    }
    setUploadingDocuments(true)
    setErrorMessage('')
    setNotice('')
    const failures: string[] = []
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!userData.user) throw new Error('Sign in again before uploading project documents.')

      for (const file of files) {
        const extension = file.name.split('.').pop()?.toLowerCase()
        const contentType = file.type
          || (extension === 'pdf'
            ? 'application/pdf'
            : extension === 'txt'
              ? 'text/plain'
              : extension === 'docx'
                ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                : 'application/octet-stream')
        const path = `${project.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
        const { error: storageError } = await supabase.storage
          .from('project-documents')
          .upload(path, file, { contentType, upsert: false })
        if (storageError) {
          failures.push(`${file.name}: ${storageError.message}`)
          continue
        }

        const { data: document, error: metadataError } = await supabase.from('project_documents')
          .insert({
            project_id: project.id,
            uploaded_by: userData.user.id,
            document_type: documentType,
            file_name: file.name,
            storage_path: path,
            content_type: contentType,
            size_bytes: file.size,
          })
          .select('id, file_name, document_type, storage_path, created_at')
          .single()
        if (metadataError) {
          const { error: cleanupError } = await supabase.storage.from('project-documents').remove([path])
          failures.push(`${file.name}: ${metadataError.message}${cleanupError ? ` (cleanup failed: ${cleanupError.message})` : ''}`)
          continue
        }
        setDocuments((current) => [document, ...current])
      }

      if (failures.length) {
        setErrorMessage(failures.join(' '))
      } else {
        setNotice('Project documents uploaded to private project storage.')
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not upload project documents.')
    } finally {
      setUploadingDocuments(false)
    }
  }

  const finalize = async (allowIncomplete: boolean) => {
    setBusyAction(true)
    setErrorMessage('')
    setNotice('')
    try {
      requireSupabaseConfig()
      const { error } = await supabase.rpc('finalize_project_onboarding', {
        p_project_id: project.id,
        p_allow_incomplete: allowIncomplete,
      })
      if (error) throw error
      setFinalized(true)
      setNotice(allowIncomplete
        ? 'Team onboarding finalized with incomplete profiles. You can continue to the project dashboard.'
        : 'Team onboarding finalized.')
      setConfirmIncomplete(false)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not finalize team onboarding.')
    } finally {
      setBusyAction(false)
    }
  }

  return (
    <main className="min-h-screen px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Aithya · Team onboarding</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">{project.name}</h1>
            <p className="mt-2 text-sm text-slate-400">Invite teammates, track profiles, then finalize the team setup.</p>
          </div>
          <button
            className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2.5 text-sm text-slate-200 hover:bg-white/5"
            onClick={onDashboard}
            type="button"
          >
            <ArrowLeft className="h-4 w-4" />
            Project dashboard
          </button>
        </header>

        {loading ? (
          <div className="glass-panel flex items-center justify-center gap-3 p-16 text-sm text-slate-300">
            <LoaderCircle className="h-5 w-5 animate-spin text-cyan-200" />
            Loading project roster…
          </div>
        ) : (
          <>
            <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Team members" value={members.length} detail="Including the project lead" icon={<Users className="h-5 w-5" />} />
              <StatCard label="Accepted invitations" value={`${acceptedCount} / ${members.length}`} detail={`${pendingCount} still pending`} icon={<Mail className="h-5 w-5" />} />
              <StatCard label="Profiles completed" value={`${completedCount} / ${members.length}`} detail={`${incompleteCount} incomplete profiles`} icon={<UserRound className="h-5 w-5" />} />
              <StatCard label="Members with verified skills" value={verifiedUsers.size} detail="Verified evidence only" icon={<ShieldCheck className="h-5 w-5" />} />
            </section>

            <section className="grid gap-6 xl:grid-cols-[1fr_0.38fr]">
              <div className="glass-panel p-5 sm:p-6">
                <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Roster and invitation status</p>
                    <h2 className="mt-2 text-xl font-semibold text-white">Your project team</h2>
                  </div>
                  <div className="text-sm text-cyan-100">
                    {completedCount} / {members.length} team members completed onboarding
                  </div>
                </div>

                <div className="space-y-3">
                  {members.map((member) => {
                    const invitation = latestInvitationByMember.get(member.id)
                    const expired = invitation?.claim_status === 'expired'
                    const activeInvite = invitation?.claim_status === 'pending' && !expired
                    const link = links[member.id]
                    const isBusy = busyMember === member.id || busyMember === invitation?.id

                    return (
                      <motion.article
                        animate={{ opacity: 1, y: 0 }}
                        initial={{ opacity: 0, y: 8 }}
                        className="rounded-2xl border border-white/10 bg-slate-950/25 p-4"
                        key={member.id}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/25 to-violet-500/25 text-sm font-semibold text-white">
                              {member.full_name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-white">{member.full_name}</p>
                              <p className="mt-1 truncate text-xs text-slate-400">
                                {member.role}{member.email ? ` · ${member.email}` : ''}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <StatusPill good={member.status === 'accepted'}>{member.status === 'accepted' ? 'Joined' : 'Invitation pending'}</StatusPill>
                            <StatusPill good={Boolean(member.profile_completed_at)}>{member.profile_completed_at ? 'Profile complete' : 'Profile incomplete'}</StatusPill>
                            {member.user_id && (
                              <StatusPill good={verifiedUsers.has(member.user_id)}>
                                {verifiedUsers.has(member.user_id) ? 'Skills verified' : 'Skills not verified'}
                              </StatusPill>
                            )}
                          </div>
                        </div>

                        {(member.preliminary_skills.length > 0) && (
                          <p className="mt-3 text-xs text-slate-400">
                            Preliminary skills: {member.preliminary_skills.join(', ')}
                          </p>
                        )}
                        {member.user_id && skillRecords.some((skill) => skill.user_id === member.user_id) && (
                          <div className="mt-4 space-y-3 border-t border-white/5 pt-4">
                            {skillRecords.filter((skill) => skill.user_id === member.user_id).map((skill) => (
                              <SkillVerificationRow
                                busy={verifyingSkill === skill.id}
                                isLeader={isLeader}
                                key={skill.id}
                                onVerify={(level, evidence) => void verifySkill(skill, level, evidence)}
                                skill={skill}
                              />
                            ))}
                          </div>
                        )}

                        {isLeader && !member.is_leader && member.status !== 'accepted' && (
                          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
                            <span className="mr-auto flex items-center gap-2 text-xs text-slate-400">
                              {expired
                                ? <><Clock3 className="h-3.5 w-3.5 text-amber-200" /> Expired</>
                                : activeInvite
                                  ? <><Clock3 className="h-3.5 w-3.5 text-cyan-200" /> Expires {new Date(invitation.expires_at).toLocaleDateString()}</>
                                  : <><XCircle className="h-3.5 w-3.5" /> No active link</>}
                            </span>
                            <button
                              className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 px-3 py-2 text-xs text-cyan-100 hover:bg-cyan-300/10 disabled:opacity-50"
                              disabled={isBusy}
                              onClick={() => void createInvite(member.id)}
                              type="button"
                            >
                              {isBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                              {activeInvite ? 'Resend / rotate link' : 'Generate invitation'}
                            </button>
                            {link && (
                              <button
                                className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs text-slate-200 hover:bg-white/5"
                                onClick={() => void copyLink(member.id)}
                                type="button"
                              >
                                {copiedMember === member.id ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
                                {copiedMember === member.id ? 'Copied' : 'Copy link'}
                              </button>
                            )}
                            {activeInvite && (
                              <button
                                className="rounded-full border border-rose-300/15 px-3 py-2 text-xs text-rose-200 hover:bg-rose-500/10 disabled:opacity-50"
                                disabled={isBusy}
                                onClick={() => void revokeInvite(invitation.id)}
                                type="button"
                              >
                                Revoke
                              </button>
                            )}
                          </div>
                        )}
                      </motion.article>
                    )
                  })}
                </div>
              </div>

              <aside className="space-y-5">
                <div className="glass-panel p-5">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Private project files</p>
                    <h2 className="mt-2 text-lg font-semibold text-white">Official documents</h2>
                    <p className="mt-2 text-sm text-slate-400">
                      {documents.length} file{documents.length === 1 ? '' : 's'} stored privately for this project.
                    </p>
                    {documents.length > 0 && (
                      <ul className="mt-3 space-y-2 border-t border-white/5 pt-3">
                        {documents.map((document) => (
                          <li className="flex items-start justify-between gap-2 text-xs" key={document.id}>
                            <button
                              className="break-all text-left text-slate-200 underline decoration-white/20 underline-offset-2 hover:text-cyan-100 disabled:opacity-50"
                              disabled={downloadingDocument === document.id}
                              onClick={() => void downloadDocument(document)}
                              type="button"
                            >
                              {downloadingDocument === document.id ? 'Opening…' : document.file_name}
                            </button>
                            <span className="shrink-0 text-slate-500">{document.document_type}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {isLeader && (
                      <div className="mt-4 grid gap-2">
                        <select
                          aria-label="Document type"
                          className="w-full rounded-xl border border-white/10 bg-slate-950/45 px-3 py-2 text-xs text-slate-200"
                          onChange={(event) => setDocumentType(event.target.value as ProjectDocument['document_type'])}
                          value={documentType}
                        >
                          <option value="rulebook">Rulebook PDF</option>
                          <option value="supporting">Supporting document</option>
                          <option value="workflow">Existing workflow</option>
                        </select>
                        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-full border border-cyan-300/20 px-3 py-2.5 text-xs text-cyan-100 hover:bg-cyan-300/10">
                          {uploadingDocuments
                            ? <LoaderCircle className="h-4 w-4 animate-spin" />
                            : <RefreshCw className="h-4 w-4" />}
                          {uploadingDocuments ? 'Uploading…' : 'Upload / retry document'}
                          <input
                            accept=".pdf,.txt,.docx,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            className="sr-only"
                            disabled={uploadingDocuments}
                            multiple
                            onChange={(event) => {
                              void uploadDocuments(event.target.files)
                              event.target.value = ''
                            }}
                            type="file"
                          />
                        </label>
                      </div>
                    )}
                </div>
                <div className="glass-panel p-5">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Onboarding progress</p>
                  <div className="mt-4 flex items-end justify-between">
                    <p className="text-3xl font-semibold text-white">{completedCount}<span className="text-lg text-slate-500"> / {members.length}</span></p>
                    <span className="text-xs text-cyan-100">{members.length ? Math.round((completedCount / members.length) * 100) : 0}%</span>
                  </div>
                  <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-violet-400 transition-all" style={{ width: `${members.length ? (completedCount / members.length) * 100 : 0}%` }} />
                  </div>
                  <p className="mt-4 text-sm leading-6 text-slate-400">
                    {pendingCount} pending invitation{pendingCount === 1 ? '' : 's'} · {incompleteCount} incomplete profile{incompleteCount === 1 ? '' : 's'}
                  </p>
                </div>

                {isLeader && (
                  <div className="glass-panel p-5">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Ready to proceed?</p>
                    <h2 className="mt-2 text-lg font-semibold text-white">Finalize team onboarding</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      This records the onboarding checkpoint. Members with pending invitations or incomplete profiles can still be invited and updated later.
                    </p>
                    {confirmIncomplete ? (
                      <div className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-300/[0.07] p-4">
                        <p className="text-sm font-medium text-amber-100">Some members are not onboarded yet.</p>
                        <p className="mt-2 text-xs leading-5 text-amber-100/70">
                          {pendingCount} invitation(s) are pending and {incompleteCount} profile(s) are incomplete. Proceeding will finalize setup without waiting for them.
                        </p>
                        <div className="mt-4 flex gap-2">
                          <button className="flex-1 rounded-full bg-amber-200 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50" disabled={busyAction} onClick={() => void finalize(true)} type="button">
                            {busyAction ? 'Saving…' : 'Proceed anyway'}
                          </button>
                          <button className="rounded-full border border-white/10 px-3 py-2 text-xs text-slate-200" onClick={() => setConfirmIncomplete(false)} type="button">
                            Wait
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-cyan-300 to-violet-400 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50"
                        disabled={busyAction}
                        onClick={() => {
                          if (finalized) {
                            onDashboard()
                          } else if (incompleteCount > 0) {
                            setConfirmIncomplete(true)
                          } else {
                            void finalize(false)
                          }
                        }}
                        type="button"
                      >
                        {busyAction ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        {finalized ? 'Continue to project dashboard' : 'Finalize onboarding'}
                      </button>
                    )}
                  </div>
                )}
              </aside>
            </section>
          </>
        )}

        {notice && (
          <p className="mt-5 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] px-4 py-3 text-sm leading-6 text-cyan-100" role="status">
            {notice}
          </p>
        )}
        {errorMessage && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200" role="alert">
            <span>{errorMessage}</span>
            <button
              className="text-rose-100 underline"
              onClick={() => {
                setLoading(true)
                setErrorMessage('')
                void loadTeam()
              }}
              type="button"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </main>
  )
}

function StatCard({ label, value, detail, icon }: { label: string; value: string | number; detail: string; icon: ReactNode }) {
  return (
    <article className="glass-panel p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
        </div>
        <span className={iconBadge}>{icon}</span>
      </div>
      <p className="mt-3 text-xs text-slate-500">{detail}</p>
    </article>
  )
}

function StatusPill({ children, good }: { children: ReactNode; good: boolean }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] ${
      good ? 'bg-emerald-500/10 text-emerald-200' : 'bg-amber-500/10 text-amber-100'
    }`}>
      {children}
    </span>
  )
}

function SkillVerificationRow({
  skill,
  isLeader,
  busy,
  onVerify,
}: {
  skill: ProjectSkill
  isLeader: boolean
  busy: boolean
  onVerify: (level: string, evidence: string) => void
}) {
  const [level, setLevel] = useState(skill.verified_level ?? skill.self_assessed_level)
  const [evidence, setEvidence] = useState(skill.verified_evidence)
  const proficiencyLevels = ['beginner', 'intermediate', 'advanced', 'expert']

  return (
    <div className="rounded-xl border border-white/5 bg-slate-950/25 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-100">{skill.skill_name} <span className="text-xs text-slate-500">· {skill.category}</span></p>
        <span className="text-xs text-slate-400">Self-assessed: {skill.self_assessed_level}</span>
      </div>
      {skill.self_evidence && (
        <p className="mt-2 text-xs leading-5 text-slate-400">Member evidence: {skill.self_evidence}</p>
      )}
      {skill.verified_level ? (
        <p className="mt-2 text-xs leading-5 text-emerald-200">
          Verified: {skill.verified_level}{skill.verified_at ? ` · ${new Date(skill.verified_at).toLocaleDateString()}` : ''}
          {skill.verified_evidence ? ` · ${skill.verified_evidence}` : ''}
        </p>
      ) : (
        <p className="mt-2 text-xs text-amber-100/70">Not verified</p>
      )}
      {isLeader && (
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]">
          <select
            aria-label={`Verified proficiency for ${skill.skill_name}`}
            className="rounded-xl border border-white/10 bg-slate-950/45 px-3 py-2 text-xs text-slate-200"
            onChange={(event) => setLevel(event.target.value)}
            value={level}
          >
            {proficiencyLevels.map((value) => (
              <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>
            ))}
          </select>
          <input
            className="rounded-xl border border-white/10 bg-slate-950/45 px-3 py-2 text-xs text-white placeholder:text-slate-500"
            onChange={(event) => setEvidence(event.target.value)}
            placeholder="Verification evidence (min 8 characters)"
            value={evidence}
          />
          <button
            className="rounded-xl border border-emerald-300/20 px-3 py-2 text-xs text-emerald-100 hover:bg-emerald-300/10 disabled:opacity-50"
            disabled={busy}
            onClick={() => onVerify(level, evidence)}
            type="button"
          >
            {busy ? 'Saving…' : skill.verified_level ? 'Update verification' : 'Verify skill'}
          </button>
        </div>
      )}
    </div>
  )
}
