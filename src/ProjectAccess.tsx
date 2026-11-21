import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowRight, LoaderCircle, LogOut, Plus, RotateCw, Sparkles } from 'lucide-react'
import App from './App'
import AuthScreen from './features/onboarding/AuthScreen'
import InvitationClaim from './features/onboarding/InvitationClaim'
import MemberOnboarding from './features/onboarding/MemberOnboarding'
import ProjectWizard from './features/onboarding/ProjectWizard'
import TeamOnboarding from './features/onboarding/TeamOnboarding'
import { isSupabaseConfigured, requireSupabaseConfig, supabase } from './lib/supabase'
import type { ProjectMemberRecord, ProjectSummary } from './features/onboarding/types'

type Page = 'loading' | 'auth' | 'reset-password' | 'create' | 'invite' | 'member' | 'team' | 'dashboard' | 'picker' | 'error'
type DashboardMember = {
  name: string
  role: string
  focus: string
  score: number
  scoreLabel: string
  accent: string
}

const accents = [
  'from-cyan-500/30 to-violet-500/20',
  'from-violet-500/30 to-cyan-500/20',
  'from-teal-500/30 to-cyan-500/20',
  'from-amber-500/30 to-violet-500/20',
]

export default function ProjectAccess() {
  const dashboardPreview = import.meta.env.DEV
    && new URLSearchParams(window.location.search).get('preview') === 'dashboard'
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured)
  const [page, setPage] = useState<Page>(isSupabaseConfigured ? 'loading' : 'auth')
  const [errorMessage, setErrorMessage] = useState('')
  const [reloadCounter, setReloadCounter] = useState(0)
  const [projectOptions, setProjectOptions] = useState<ProjectSummary[]>([])
  const [memberOptions, setMemberOptions] = useState<ProjectMemberRecord[]>([])
  const [activeProject, setActiveProject] = useState<ProjectSummary | null>(null)
  const [activeMember, setActiveMember] = useState<ProjectMemberRecord | null>(null)
  const [leaderName, setLeaderName] = useState('')
  const [team, setTeam] = useState<DashboardMember[]>([])
  const [invitationLinks, setInvitationLinks] = useState<Record<string, string>>({})
  const [onboardingWarnings, setOnboardingWarnings] = useState<string[]>([])
  const [preferredProjectId, setPreferredProjectId] = useState('')
  const [confirmedMemberName, setConfirmedMemberName] = useState('')
  const [inviteToken, setInviteToken] = useState(() => {
    const url = new URL(window.location.href)
    const queryToken = url.searchParams.get('invite') ?? ''
    const hashParams = new URLSearchParams(url.hash.slice(1))
    const hashToken = hashParams.get('invite') ?? ''
    const token = queryToken || hashToken || window.sessionStorage.getItem('aithya.pending-invitation') || ''
    if (queryToken || hashToken) {
      window.sessionStorage.setItem('aithya.pending-invitation', token)
      if (queryToken) url.searchParams.delete('invite')
      if (hashToken) {
        hashParams.delete('invite')
        url.hash = hashParams.toString()
      }
      window.history.replaceState({}, '', url.toString())
    }
    return token
  })

  const userId = session?.user.id ?? ''
  const userEmail = session?.user.email ?? ''

  useEffect(() => {
    if (!isSupabaseConfigured || dashboardPreview) return

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPage('reset-password')
      } else if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        setPage(nextSession ? 'loading' : 'auth')
        setErrorMessage('')
      }
      setSession(nextSession)
      setAuthReady(true)
    })
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        setErrorMessage(error.message)
        setPage('error')
      } else {
        setSession(data.session)
        if (!data.session) setPage('auth')
      }
      setAuthReady(true)
    })

    return () => subscription.unsubscribe()
  }, [dashboardPreview])

  const openProject = useCallback(async (project: ProjectSummary, membership: ProjectMemberRecord) => {
    setPage('loading')
    setErrorMessage('')
    try {
      requireSupabaseConfig()
      const { data: profile, error: profileError } = await supabase.from('profiles')
        .select('full_name')
        .eq('id', userId)
        .maybeSingle()
      if (profileError) throw profileError
      if (profile?.full_name) setLeaderName(profile.full_name)
      setActiveProject(project)
      setActiveMember(membership)

      if (!membership.profile_completed_at) {
        setPage('member')
        return
      }

      const [memberResult, skillResult] = await Promise.all([
        supabase.from('project_members')
          .select('id, project_id, user_id, email, full_name, role, preliminary_skills, status, is_leader, profile_completed_at')
          .eq('project_id', project.id)
          .order('created_at', { ascending: true }),
        supabase.from('user_skills')
          .select('user_id, category, skill_name, verified_level')
          .eq('project_id', project.id),
      ])
      if (memberResult.error) throw memberResult.error
      if (skillResult.error) throw skillResult.error
      const skillsByUser = new Map<string, { names: string[]; verified: number }>()
      for (const skill of skillResult.data ?? []) {
        const userSkills = skillsByUser.get(skill.user_id) ?? { names: [], verified: 0 }
        userSkills.names.push(skill.skill_name)
        if (skill.verified_level) userSkills.verified += 1
        skillsByUser.set(skill.user_id, userSkills)
      }
      setTeam((memberResult.data ?? []).map((member, index) => {
        const memberSkills = member.user_id ? skillsByUser.get(member.user_id) : undefined
        return {
          name: member.full_name || member.email || 'Invited member',
          role: member.role,
          focus: memberSkills?.names.join(', ')
            || member.preliminary_skills.join(', ')
            || (member.profile_completed_at ? 'Profile complete · no skills listed' : 'Onboarding pending'),
          score: memberSkills?.verified ?? 0,
          scoreLabel: 'verified',
          accent: accents[index % accents.length],
        }
      }))
      setPage('dashboard')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not load this project.')
      setPage('error')
    }
  }, [userId])

  useEffect(() => {
    if (!authReady || dashboardPreview) return
    if (!userId) {
      return
    }
    if (inviteToken) {
      setPage('invite')
      return
    }

    let active = true
    const loadProjects = async () => {
      try {
        requireSupabaseConfig()
        const { data: membershipRows, error: membershipError } = await supabase.from('project_members')
          .select('id, project_id, user_id, email, full_name, role, preliminary_skills, status, is_leader, profile_completed_at')
          .eq('user_id', userId)
          .eq('status', 'accepted')
          .order('created_at', { ascending: false })
        if (membershipError) throw membershipError
        if (!active) return

        const memberships = membershipRows ?? []
        setMemberOptions(memberships)
        const profileResult = await supabase.from('profiles')
          .select('full_name')
          .eq('id', userId)
          .maybeSingle()
        if (profileResult.error) throw profileResult.error
        if (profileResult.data?.full_name) setLeaderName(profileResult.data.full_name)

        if (!memberships.length) {
          setProjectOptions([])
          setActiveProject(null)
          setActiveMember(null)
          setPage('create')
          return
        }

        const projectIds = [...new Set(memberships.map((member) => member.project_id))]
        const { data: projects, error: projectsError } = await supabase.from('projects')
          .select('id, name, leader_id, onboarding_finalized_at, workflow_status, hackathon_name, description, theme')
          .in('id', projectIds)
          .order('created_at', { ascending: false })
        if (projectsError) throw projectsError
        if (!active) return
        const availableProjects = (projects ?? []) as ProjectSummary[]
        setProjectOptions(availableProjects)

        if (preferredProjectId) {
          const preferred = availableProjects.find((project) => project.id === preferredProjectId)
          const member = memberships.find((candidate) => candidate.project_id === preferredProjectId)
          setPreferredProjectId('')
          if (preferred && member) {
            await openProject(preferred, member)
            return
          }
        }

        if (availableProjects.length === 1) {
          const member = memberships.find((candidate) => candidate.project_id === availableProjects[0].id)
          if (!member) throw new Error('Your project membership could not be loaded.')
          await openProject(availableProjects[0], member)
        } else {
          setPage('picker')
        }
      } catch (error) {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : 'Could not load your workspace.')
          setPage('error')
        }
      }
    }

    void loadProjects()
    return () => { active = false }
  }, [authReady, dashboardPreview, inviteToken, openProject, preferredProjectId, reloadCounter, userId])

  if (dashboardPreview) {
    return (
      <>
        <div className="sticky top-0 z-30 border-b border-amber-300/20 bg-amber-950/90 px-4 py-2 text-center text-xs font-medium text-amber-100 backdrop-blur">
          Local preview · sample data only · not connected to a live account
        </div>
        <App
          hackathonName="Aithya Build Sprint"
          projectDescription="A collaborative AI-driven platform that helps teams learn, coordinate, and ship with confidence."
          projectName="Aithya Build Sprint"
          userEmail="preview@example.com"
          workflowStatus="provided"
        />
      </>
    )
  }

  const chooseProject = (project: ProjectSummary) => {
    const membership = memberOptions.find((member) => member.project_id === project.id)
    if (!membership) {
      setErrorMessage('Your project membership could not be loaded.')
      setPage('error')
      return
    }
    void openProject(project, membership)
  }

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      setErrorMessage(error.message)
      return
    }
    setSession(null)
    setActiveProject(null)
    setActiveMember(null)
    if (!inviteToken) setPage('auth')
  }

  const refreshWorkspace = () => {
    setErrorMessage('')
    setPage('loading')
    setReloadCounter((current) => current + 1)
  }

  if (!authReady || page === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0D1727] text-slate-200">
        <div className="flex items-center gap-3 text-sm">
          <LoaderCircle className="h-5 w-5 animate-spin text-cyan-200" />
          Securing your project workspace…
        </div>
      </main>
    )
  }

  if (page === 'auth') return <AuthScreen invitation={Boolean(inviteToken)} />
  if (page === 'reset-password') {
    return (
      <AuthScreen
        onPasswordUpdated={() => {
          setPage('loading')
          setReloadCounter((current) => current + 1)
        }}
        recovery
      />
    )
  }

  if (page === 'invite' && inviteToken && userId) {
    return (
      <InvitationClaim
        accountEmail={userEmail}
        onAccepted={(invitation, name) => {
          setPage('loading')
          window.sessionStorage.removeItem('aithya.pending-invitation')
          setConfirmedMemberName(name)
          setInviteToken('')
          setPreferredProjectId(invitation.project_id)
          setReloadCounter((current) => current + 1)
        }}
        onCancel={() => void handleSignOut()}
        token={inviteToken}
      />
    )
  }

  if (page === 'create') {
    return (
      <ProjectWizard
        leaderName={leaderName}
        onCancel={() => activeProject ? setPage('dashboard') : void handleSignOut()}
        onCreated={(project, links, warnings) => {
          setActiveProject(project)
          setActiveMember(null)
          setInvitationLinks(links)
          setOnboardingWarnings(warnings)
          setPage('team')
        }}
      />
    )
  }

  if (page === 'member' && activeProject) {
    return (
      <MemberOnboarding
        initialName={confirmedMemberName || activeMember?.full_name || leaderName}
        onComplete={refreshWorkspace}
        projectId={activeProject.id}
        projectName={activeProject.name}
      />
    )
  }

  if (page === 'team' && activeProject) {
    return (
      <TeamOnboarding
        initialLinks={invitationLinks}
        initialWarnings={onboardingWarnings}
        onDashboard={refreshWorkspace}
        project={activeProject}
        userId={userId}
      />
    )
  }

  if (page === 'dashboard' && activeProject) {
    return (
      <App
        onCreateProject={() => setPage('create')}
        onManageTeam={() => setPage('team')}
        onSignOut={() => void handleSignOut()}
        hackathonName={activeProject.hackathon_name}
        projectDescription={activeProject.description}
        projectTheme={activeProject.theme}
        projectName={activeProject.name}
        projectTeam={team}
        workflowStatus={activeProject.workflow_status}
        userEmail={userEmail}
      />
    )
  }

  if (page === 'picker') {
    return (
      <main className="min-h-screen px-4 py-10 text-slate-100 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Aithya · Your workspaces</p>
              <h1 className="mt-2 text-3xl font-semibold text-white">Choose a project</h1>
              <p className="mt-2 text-sm text-slate-400">One account can join and manage multiple projects.</p>
            </div>
            <button className="rounded-full border border-white/10 px-4 py-2.5 text-sm text-slate-200 hover:bg-white/5" onClick={() => void handleSignOut()} type="button">
              <LogOut className="mr-2 inline h-4 w-4" />Sign out
            </button>
          </header>
          <div className="grid gap-4 md:grid-cols-2">
            {projectOptions.map((project) => {
              const membership = memberOptions.find((member) => member.project_id === project.id)
              return (
                <button
                  className="glass-panel group p-5 text-left transition hover:border-cyan-300/30 hover:bg-slate-800/70"
                  key={project.id}
                  onClick={() => chooseProject(project)}
                  type="button"
                >
                  <span className="flex items-center justify-between">
                    <Sparkles className="h-5 w-5 text-cyan-200" />
                    <ArrowRight className="h-4 w-4 text-slate-500 transition group-hover:translate-x-1 group-hover:text-cyan-100" />
                  </span>
                  <span className="mt-5 block text-lg font-semibold text-white">{project.name}</span>
                  <span className="mt-2 block text-sm text-slate-400">{membership?.role ?? 'Project member'}</span>
                  <span className="mt-4 inline-block rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">
                    {membership?.profile_completed_at ? 'Profile complete' : 'Profile setup required'}
                  </span>
                </button>
              )
            })}
            <button
              className="glass-panel flex min-h-44 flex-col items-center justify-center border-dashed p-5 text-center transition hover:border-cyan-300/30 hover:bg-cyan-300/[0.03]"
              onClick={() => setPage('create')}
              type="button"
            >
              <Plus className="h-6 w-6 text-cyan-200" />
              <span className="mt-3 font-medium text-white">Create another project</span>
              <span className="mt-1 text-sm text-slate-400">Use this account with a new team.</span>
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 text-slate-100">
      <section className="glass-panel w-full max-w-xl p-6">
        <p className="text-sm leading-6 text-rose-100" role="alert">{errorMessage || 'This workspace could not be opened.'}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button className="inline-flex items-center gap-2 rounded-full bg-cyan-300 px-4 py-2.5 text-sm font-medium text-slate-950" onClick={refreshWorkspace} type="button">
            <RotateCw className="h-4 w-4" />Retry
          </button>
          <button className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2.5 text-sm text-slate-200" onClick={() => void handleSignOut()} type="button">
            <LogOut className="h-4 w-4" />Sign out
          </button>
        </div>
      </section>
    </main>
  )
}
