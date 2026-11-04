import { useEffect, useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { Check, LoaderCircle, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { requireSupabaseConfig, supabase } from '../../lib/supabase'
import type { MemberProfile, SkillDraft } from './types'

const fieldClass =
  'w-full rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/10'
const categories = [
  'Research',
  'UI/UX',
  'Frontend',
  'Backend',
  'AI/ML',
  'Database',
  'Testing',
  'Documentation',
  'Presentation',
  'Project management',
  'Other',
]
const levels: SkillDraft['proficiency'][] = ['beginner', 'intermediate', 'advanced', 'expert']

type MemberOnboardingProps = {
  projectId: string
  projectName: string
  initialName: string
  onComplete: () => void
}

export default function MemberOnboarding({
  projectId,
  projectName,
  initialName,
  onComplete,
}: MemberOnboardingProps) {
  const [profile, setProfile] = useState<MemberProfile>({
    full_name: initialName,
    interests: [],
    preferred_technologies: [],
    availability: '',
  })
  const [interestText, setInterestText] = useState('')
  const [technologyText, setTechnologyText] = useState('')
  const [skills, setSkills] = useState<SkillDraft[]>([
    { category: 'Frontend', skill_name: '', proficiency: 'beginner', evidence: '' },
  ])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let active = true
    const loadProfile = async () => {
      try {
        requireSupabaseConfig()
        const { data: userData, error: userError } = await supabase.auth.getUser()
        if (userError) throw userError
        if (!userData.user) throw new Error('Sign in again to complete your profile.')

        const [profileResult, skillsResult] = await Promise.all([
          supabase.from('profiles')
            .select('full_name, interests, preferred_technologies, availability')
            .eq('id', userData.user.id)
            .maybeSingle(),
          supabase.from('user_skills')
            .select('category, skill_name, self_assessed_level, self_evidence')
            .eq('project_id', projectId)
            .eq('user_id', userData.user.id),
        ])
        if (profileResult.error) throw profileResult.error
        if (skillsResult.error) throw skillsResult.error
        if (!active) return

        const record = profileResult.data
        if (record) {
          setProfile({
            full_name: record.full_name || initialName,
            interests: record.interests ?? [],
            preferred_technologies: record.preferred_technologies ?? [],
            availability: record.availability ?? '',
          })
          setInterestText((record.interests ?? []).join(', '))
          setTechnologyText((record.preferred_technologies ?? []).join(', '))
        } else {
          setProfile((current) => ({ ...current, full_name: initialName }))
        }
        if (skillsResult.data?.length) {
          setSkills(skillsResult.data.map((skill) => ({
            category: skill.category,
            skill_name: skill.skill_name,
            proficiency: skill.self_assessed_level as SkillDraft['proficiency'],
            evidence: skill.self_evidence ?? '',
          })))
        }
      } catch (error) {
        if (active) setErrorMessage(error instanceof Error ? error.message : 'Could not load your profile.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadProfile()
    return () => { active = false }
  }, [initialName, projectId])

  const updateSkill = (index: number, key: keyof SkillDraft, value: string) => {
    setSkills((current) => current.map((skill, skillIndex) => (
      skillIndex === index ? { ...skill, [key]: value } : skill
    )))
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage('')
    const usableSkills = skills.filter((skill) => skill.skill_name.trim())
    if (profile.full_name.trim().length < 2) {
      setErrorMessage('Enter your full name (at least two characters).')
      return
    }
    if (!usableSkills.length) {
      setErrorMessage('Add at least one skill and choose your self-assessed proficiency.')
      return
    }

    setBusy(true)
    try {
      requireSupabaseConfig()
      const { error } = await supabase.rpc('save_member_onboarding', {
        p_project_id: projectId,
        p_profile: {
          full_name: profile.full_name.trim(),
          interests: interestText.split(',').map((item) => item.trim()).filter(Boolean),
          preferred_technologies: technologyText.split(',').map((item) => item.trim()).filter(Boolean),
          availability: profile.availability.trim(),
        },
        p_skills: usableSkills.map((skill) => ({
          category: skill.category.trim() || 'Other',
          skill_name: skill.skill_name.trim(),
          proficiency: skill.proficiency,
          evidence: skill.evidence.trim(),
        })),
      })
      if (error) throw error
      setSaved(true)
      window.setTimeout(onComplete, 650)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not save your profile.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen px-4 py-10 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <motion.section
          animate={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 12 }}
          className="glass-panel overflow-hidden"
        >
          <div className="border-b border-white/10 bg-gradient-to-r from-cyan-400/[0.08] to-violet-500/[0.08] p-6 sm:p-8">
            <p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Member onboarding · {projectName}</p>
            <h1 className="mt-3 text-3xl font-semibold text-white">Tell your team how you work</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              Confirm your name, add your interests and availability, and describe your skills. Self-assessed skills remain separate from any later team verification.
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-3 p-12 text-sm text-slate-300">
              <LoaderCircle className="h-5 w-5 animate-spin text-cyan-200" />
              Loading your profile…
            </div>
          ) : (
            <form className="space-y-7 p-5 sm:p-8" onSubmit={submit}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm text-slate-300">
                  Confirm your name
                  <input
                    className={fieldClass}
                    minLength={2}
                    onChange={(event) => setProfile((current) => ({ ...current, full_name: event.target.value }))}
                    required
                    value={profile.full_name}
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  Availability
                  <input
                    className={fieldClass}
                    onChange={(event) => setProfile((current) => ({ ...current, availability: event.target.value }))}
                    placeholder="e.g. Evenings, 8 hours/week"
                    value={profile.availability}
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  Interests (comma separated)
                  <input className={fieldClass} onChange={(event) => setInterestText(event.target.value)} value={interestText} />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  Preferred technologies (comma separated)
                  <input className={fieldClass} onChange={(event) => setTechnologyText(event.target.value)} value={technologyText} />
                </label>
              </div>

              <section>
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Skills profile</p>
                    <h2 className="mt-1 text-lg font-semibold text-white">Your strengths and evidence</h2>
                  </div>
                  <button
                    className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-300/10"
                    onClick={() => setSkills((current) => current.concat({
                      category: 'Other',
                      skill_name: '',
                      proficiency: 'beginner',
                      evidence: '',
                    }))}
                    type="button"
                  >
                    <Plus className="h-4 w-4" />
                    Add skill
                  </button>
                </div>

                <div className="space-y-3">
                  {skills.map((skill, index) => (
                    <div className="rounded-2xl border border-white/10 bg-slate-950/25 p-4" key={index}>
                      <div className="grid gap-3 md:grid-cols-[1fr_1.2fr_1fr_auto]">
                        <label className="space-y-2 text-xs text-slate-400">
                          Category
                          <select
                            className={fieldClass}
                            onChange={(event) => updateSkill(index, 'category', event.target.value)}
                            value={categories.includes(skill.category) ? skill.category : 'Other'}
                          >
                            {categories.map((category) => <option key={category}>{category}</option>)}
                          </select>
                        </label>
                        <label className="space-y-2 text-xs text-slate-400">
                          {skill.category === 'Other' ? 'Skill name / custom category' : 'Skill name'}
                          <input className={fieldClass} onChange={(event) => updateSkill(index, 'skill_name', event.target.value)} placeholder="e.g. React, prototyping" value={skill.skill_name} />
                        </label>
                        <label className="space-y-2 text-xs text-slate-400">
                          Self-assessed proficiency
                          <select
                            className={fieldClass}
                            onChange={(event) => updateSkill(index, 'proficiency', event.target.value)}
                            value={skill.proficiency}
                          >
                            {levels.map((level) => <option key={level} value={level}>{level[0].toUpperCase() + level.slice(1)}</option>)}
                          </select>
                        </label>
                        <button
                          aria-label={`Remove skill ${skill.skill_name || index + 1}`}
                          className="self-end rounded-xl border border-white/10 p-3 text-slate-400 hover:border-rose-300/30 hover:text-rose-200"
                          disabled={skills.length === 1}
                          onClick={() => setSkills((current) => current.filter((_, skillIndex) => skillIndex !== index))}
                          type="button"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <label className="space-y-2 text-xs text-slate-400 md:col-span-3">
                          Evidence or example (optional)
                          <input className={fieldClass} onChange={(event) => updateSkill(index, 'evidence', event.target.value)} placeholder="Project, course, or work sample" value={skill.evidence} />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-start gap-3 rounded-2xl border border-violet-300/15 bg-violet-400/[0.05] p-4 text-sm leading-6 text-slate-300">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-violet-200" />
                  <p><strong className="font-medium text-violet-100">Self-declared is not verified.</strong> Your proficiency and evidence are stored separately from any evidence and level a project leader later records. Aithya does not independently validate external work.</p>
                </div>
              </section>

              {errorMessage && (
                <p className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200" role="alert">
                  {errorMessage}
                </p>
              )}
              {saved && (
                <p className="flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100" role="status">
                  <Check className="h-4 w-4" />
                  Profile saved to this project.
                </p>
              )}
              <button
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-cyan-300 to-violet-400 px-5 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50 sm:w-auto"
                disabled={busy || loading || saved}
                type="submit"
              >
                {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Confirm profile
              </button>
            </form>
          )}
        </motion.section>
      </div>
    </main>
  )
}
