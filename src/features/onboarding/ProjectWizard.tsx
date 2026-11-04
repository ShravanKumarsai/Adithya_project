import { useState, type FormEvent, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  LoaderCircle,
  Sparkles,
  Trash2,
  UploadCloud,
  Users,
} from 'lucide-react'
import { buildInvitationLink, callInvitationFunction } from '../../lib/invitations'
import { requireSupabaseConfig, supabase } from '../../lib/supabase'
import type { ProjectSummary } from './types'

type TeammateDraft = {
  full_name: string
  email: string
  role: string
  skills: string
}

type ProjectWizardProps = {
  leaderName: string
  onCancel: () => void
  onCreated: (project: ProjectSummary, invitationLinks: Record<string, string>, warnings: string[]) => void
}

type FileDraft = {
  file: File
  type: 'rulebook' | 'supporting' | 'workflow'
}

const fieldClass =
  'w-full rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/10'
const textAreaClass = `${fieldClass} min-h-28 resize-y`
const stepNames = ['Project brief', 'Rules & AI policy', 'Team setup']

function lines(value: string) {
  return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean)
}

function contentTypeForFile(file: File) {
  if (file.type) return file.type
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension === 'pdf') return 'application/pdf'
  if (extension === 'txt') return 'text/plain'
  if (extension === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  return 'application/octet-stream'
}

function SectionTitle({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-5">
      <p className="text-xs uppercase tracking-[0.22em] text-cyan-200">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
      {children && <div className="mt-2 text-sm leading-6 text-slate-400">{children}</div>}
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  required?: boolean
}) {
  return (
    <label className="block space-y-2 text-sm text-slate-300">
      {label}
      <input
        className={fieldClass}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        type={type}
        value={value}
      />
    </label>
  )
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <label className="block space-y-2 text-sm text-slate-300">
      {label}
      <textarea
        className={textAreaClass}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        value={value}
      />
    </label>
  )
}

function Toggle({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string
  detail: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-slate-950/30 p-4">
      <input
        checked={checked}
        className="mt-1 h-4 w-4 accent-cyan-300"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span>
        <span className="block text-sm font-medium text-slate-100">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-slate-400">{detail}</span>
      </span>
    </label>
  )
}

export default function ProjectWizard({ leaderName, onCancel, onCreated }: ProjectWizardProps) {
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [projectName, setProjectName] = useState('')
  const [hackathonName, setHackathonName] = useState('')
  const [description, setDescription] = useState('')
  const [problemStatement, setProblemStatement] = useState('')
  const [startDate, setStartDate] = useState('')
  const [submissionDeadline, setSubmissionDeadline] = useState('')
  const [theme, setTheme] = useState('')
  const [deliverables, setDeliverables] = useState('')
  const [technologyStack, setTechnologyStack] = useState('')
  const [judgingCriteria, setJudgingCriteria] = useState('')
  const [mandatoryRequirements, setMandatoryRequirements] = useState('')
  const [restrictions, setRestrictions] = useState('')
  const [permittedAiTools, setPermittedAiTools] = useState('')
  const [prohibitedAiTools, setProhibitedAiTools] = useState('')
  const [externalAiApisAllowed, setExternalAiApisAllowed] = useState(false)
  const [aiGeneratedCodeAllowed, setAiGeneratedCodeAllowed] = useState(false)
  const [aiGeneratedResearchAllowed, setAiGeneratedResearchAllowed] = useState(false)
  const [privacyRestrictions, setPrivacyRestrictions] = useState('')
  const [otherAiRequirements, setOtherAiRequirements] = useState('')
  const [hasWorkflow, setHasWorkflow] = useState(false)
  const [workflowContent, setWorkflowContent] = useState('')
  const [teamSize, setTeamSize] = useState(3)
  const [members, setMembers] = useState<TeammateDraft[]>([
    { full_name: '', email: '', role: 'Team member', skills: '' },
    { full_name: '', email: '', role: 'Team member', skills: '' },
  ])
  const [files, setFiles] = useState<FileDraft[]>([])

  const changeTeamSize = (value: number) => {
    const count = Math.min(25, Math.max(1, value || 1))
    setTeamSize(count)
    setMembers((current) => {
      const desired = count - 1
      return current.slice(0, desired).concat(
        Array.from({ length: Math.max(0, desired - current.length) }, () => ({
          full_name: '',
          email: '',
          role: 'Team member',
          skills: '',
        })),
      )
    })
  }

  const updateMember = (index: number, key: keyof TeammateDraft, value: string) => {
    setMembers((current) => current.map((member, itemIndex) => (
      itemIndex === index ? { ...member, [key]: value } : member
    )))
  }

  const addFiles = (selectedFiles: FileList | null, type: FileDraft['type']) => {
    if (!selectedFiles) return
    setErrorMessage('')
    const newFiles = Array.from(selectedFiles).map((file) => ({ file, type }))
    const invalid = newFiles.find(({ file }) => file.size > 15 * 1024 * 1024)
    if (invalid) {
      setErrorMessage(`${invalid.file.name} exceeds the 15 MB upload limit.`)
      return
    }
    if (type === 'rulebook' && newFiles.some(({ file }) => !file.name.toLowerCase().endsWith('.pdf'))) {
      setErrorMessage('Rulebooks must be PDF files.')
      return
    }
    setFiles((current) => current.concat(newFiles))
  }

  const goToNextStep = () => {
    setErrorMessage('')
    if (step === 0) {
      if (projectName.trim().length < 2) {
        setErrorMessage('Enter a project name with at least two characters.')
        return
      }
      if (!description.trim() || !problemStatement.trim()) {
        setErrorMessage('Add a project description and problem statement before continuing.')
        return
      }
      if (startDate && submissionDeadline && submissionDeadline < startDate) {
        setErrorMessage('The submission deadline cannot be earlier than the hackathon start date.')
        return
      }
    }
    setStep((current) => Math.min(stepNames.length - 1, current + 1))
  }

  const uploadDocuments = async (projectId: string, userId: string) => {
    const warnings: string[] = []
    for (const { file, type } of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const storagePath = `${projectId}/${crypto.randomUUID()}-${safeName}`
      const contentType = contentTypeForFile(file)
      const { error: uploadError } = await supabase.storage
        .from('project-documents')
        .upload(storagePath, file, { contentType, upsert: false })
      if (uploadError) {
        warnings.push(`${file.name}: ${uploadError.message}`)
        continue
      }

      const { error: metadataError } = await supabase.from('project_documents').insert({
        project_id: projectId,
        uploaded_by: userId,
        document_type: type,
        file_name: file.name,
        storage_path: storagePath,
        content_type: contentType,
        size_bytes: file.size,
      })
      if (metadataError) {
        const { error: cleanupError } = await supabase.storage.from('project-documents').remove([storagePath])
        warnings.push(`${file.name}: ${metadataError.message}${cleanupError ? ` (storage cleanup failed: ${cleanupError.message})` : ''}`)
      }
    }
    return warnings
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage('')
    if (step < 2) {
      goToNextStep()
      return
    }
    const enteredMembers = members.filter((member) => member.full_name.trim())
    if (enteredMembers.length !== members.length) {
      setErrorMessage('Enter a name for every intended team member, or adjust the team size.')
      return
    }
    if (enteredMembers.some((member) => member.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email.trim()))) {
      setErrorMessage('Check the email address format for each team member.')
      return
    }
    const emailAddresses = enteredMembers.map((member) => member.email.trim().toLowerCase()).filter(Boolean)
    if (new Set(emailAddresses).size !== emailAddresses.length) {
      setErrorMessage('Each team member must have a different email address.')
      return
    }

    setBusy(true)
    try {
      requireSupabaseConfig()
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!userData.user) throw new Error('Your session expired. Sign in again to create this project.')
      const leaderEmail = userData.user.email?.toLowerCase()
      if (leaderEmail && emailAddresses.includes(leaderEmail)) {
        throw new Error('Your account is already included as project lead. Use a different email for each teammate.')
      }

      const { data, error } = await supabase.rpc('create_project_with_members', {
        p_project: {
          name: projectName.trim(),
          hackathon_name: hackathonName.trim(),
          description: description.trim(),
          problem_statement: problemStatement.trim(),
          start_date: startDate || null,
          submission_deadline: submissionDeadline || null,
          theme: theme.trim(),
          expected_deliverables: lines(deliverables),
          technology_stack: lines(technologyStack),
          workflow_status: hasWorkflow ? 'provided' : 'requires_generation',
          workflow_content: hasWorkflow ? workflowContent.trim() : '',
        },
        p_requirements: {
          judging_criteria: lines(judgingCriteria),
          mandatory_requirements: lines(mandatoryRequirements),
          restrictions: lines(restrictions),
        },
        p_ai_constraints: {
          permitted_ai_tools: lines(permittedAiTools),
          prohibited_ai_tools: lines(prohibitedAiTools),
          external_ai_apis_allowed: externalAiApisAllowed,
          ai_generated_code_allowed: aiGeneratedCodeAllowed,
          ai_generated_research_allowed: aiGeneratedResearchAllowed,
          privacy_restrictions: privacyRestrictions.trim(),
          other_requirements: otherAiRequirements.trim(),
        },
        p_members: enteredMembers.map((member) => ({
          full_name: member.full_name.trim(),
          email: member.email.trim() || null,
          role: member.role.trim() || 'Team member',
          skills: lines(member.skills),
        })),
      })
      if (error) throw error
      if (!data) throw new Error('The project was not returned after saving.')

      const projectId = data as string
      const warnings = await uploadDocuments(projectId, userData.user.id)
      const { data: projectMembers, error: memberError } = await supabase
        .from('project_members')
        .select('id')
        .eq('project_id', projectId)
        .eq('is_leader', false)
      if (memberError) {
        warnings.push(`The project was saved, but team invitations could not be loaded: ${memberError.message}`)
      }

      const invitationLinks: Record<string, string> = {}
      for (const member of projectMembers ?? []) {
        try {
          const result = await callInvitationFunction('create', { projectMemberId: member.id })
          if (!result.token) throw new Error('The invitation service did not return a token.')
          invitationLinks[member.id] = buildInvitationLink(result.token)
        } catch (invitationError) {
          warnings.push(
            invitationError instanceof Error
              ? `An invitation could not be created: ${invitationError.message}`
              : 'An invitation could not be created.',
          )
        }
      }

      onCreated({
        id: projectId,
        name: projectName.trim(),
        leader_id: userData.user.id,
        onboarding_finalized_at: null,
        workflow_status: hasWorkflow ? 'provided' : 'requires_generation',
        hackathon_name: hackathonName.trim(),
        description: description.trim(),
        theme: theme.trim(),
      }, invitationLinks, warnings)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Project setup failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-cyan-200">Aithya · Project initiation</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Create a team workspace</h1>
          </div>
          <button className="text-sm text-slate-400 transition hover:text-white" onClick={onCancel} type="button">
            Cancel setup
          </button>
        </header>

        <div className="glass-panel mb-6 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            {stepNames.map((name, index) => (
              <button
                aria-current={step === index ? 'step' : undefined}
                className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                  step === index
                    ? 'border-cyan-300/40 bg-cyan-400/10'
                    : step > index
                      ? 'border-emerald-300/20 bg-emerald-400/5'
                      : 'border-white/5 bg-slate-950/20'
                }`}
                key={name}
                onClick={() => step > index && setStep(index)}
                type="button"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-cyan-100">
                  {step > index ? <Check className="h-4 w-4" /> : `0${index + 1}`}
                </span>
                <span className="text-sm font-medium text-slate-200">{name}</span>
              </button>
            ))}
          </div>
        </div>

        <form className="glass-panel p-5 sm:p-8" onSubmit={submit}>
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 8 }}
            key={step}
            transition={{ duration: 0.2 }}
          >
            {step === 0 && (
              <>
                <SectionTitle eyebrow="01 · Define the work" title="Project and hackathon details">
                  Set a shared starting point. The project details will be visible only to authenticated project members.
                </SectionTitle>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Project name" onChange={setProjectName} required value={projectName} />
                  <Field label="Hackathon name" onChange={setHackathonName} value={hackathonName} />
                  <div className="md:col-span-2">
                    <TextArea label="Project description" onChange={setDescription} value={description} />
                  </div>
                  <div className="md:col-span-2">
                    <TextArea label="Problem statement" onChange={setProblemStatement} value={problemStatement} />
                  </div>
                  <Field label="Hackathon start date" onChange={setStartDate} type="date" value={startDate} />
                  <Field label="Submission deadline" onChange={setSubmissionDeadline} type="date" value={submissionDeadline} />
                  <Field label="Project theme" onChange={setTheme} value={theme} />
                  <TextArea label="Technology stack (one per line)" onChange={setTechnologyStack} rows={3} value={technologyStack} />
                  <TextArea label="Expected deliverables (one per line)" onChange={setDeliverables} rows={3} value={deliverables} />
                </div>

                <div className="mt-8 border-t border-white/10 pt-6">
                  <SectionTitle eyebrow="Official rules" title="Competition requirements">
                    Add judging criteria and constraints so your team can refer to the same source of truth.
                  </SectionTitle>
                  <div className="grid gap-4 md:grid-cols-3">
                    <TextArea label="Judging criteria (one per line)" onChange={setJudgingCriteria} rows={5} value={judgingCriteria} />
                    <TextArea label="Mandatory requirements (one per line)" onChange={setMandatoryRequirements} rows={5} value={mandatoryRequirements} />
                    <TextArea label="Project restrictions (one per line)" onChange={setRestrictions} rows={5} value={restrictions} />
                  </div>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <FilePicker label="Rulebook PDFs" onSelect={(list) => addFiles(list, 'rulebook')} accept=".pdf,application/pdf" multiple />
                    <FilePicker label="Supporting documents" onSelect={(list) => addFiles(list, 'supporting')} accept=".pdf,.txt,.docx,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple />
                  </div>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <SectionTitle eyebrow="02 · Set guardrails" title="AI usage and workflow">
                  Record the competition’s AI policy explicitly. Aithya does not analyze rulebooks or fabricate an AI workflow in this stage.
                </SectionTitle>
                <div className="grid gap-4 md:grid-cols-2">
                  <TextArea label="Permitted AI tools (one per line)" onChange={setPermittedAiTools} value={permittedAiTools} />
                  <TextArea label="Prohibited AI tools (one per line)" onChange={setProhibitedAiTools} value={prohibitedAiTools} />
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <Toggle checked={externalAiApisAllowed} detail="The project may send data to third-party AI services." label="External AI APIs allowed" onChange={setExternalAiApisAllowed} />
                  <Toggle checked={aiGeneratedCodeAllowed} detail="Generated code may be included in deliverables." label="AI-generated code allowed" onChange={setAiGeneratedCodeAllowed} />
                  <Toggle checked={aiGeneratedResearchAllowed} detail="AI may assist research and synthesis." label="AI-generated research allowed" onChange={setAiGeneratedResearchAllowed} />
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <TextArea label="Privacy restrictions" onChange={setPrivacyRestrictions} value={privacyRestrictions} />
                  <TextArea label="Other competition-specific AI requirements" onChange={setOtherAiRequirements} value={otherAiRequirements} />
                </div>

                <div className="mt-8 rounded-3xl border border-white/10 bg-slate-950/25 p-5 sm:p-6">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="rounded-2xl border border-violet-300/20 bg-violet-400/10 p-2 text-violet-200">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">Does a project workflow already exist?</h3>
                      <p className="mt-1 text-xs text-slate-400">If not, the project is marked for workflow generation in a later stage.</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {[true, false].map((value) => (
                      <button
                        aria-pressed={hasWorkflow === value}
                        className={`rounded-full border px-4 py-2 text-sm transition ${
                          hasWorkflow === value ? 'border-cyan-300/50 bg-cyan-300/10 text-cyan-100' : 'border-white/10 text-slate-300'
                        }`}
                        key={String(value)}
                        onClick={() => setHasWorkflow(value)}
                        type="button"
                      >
                        {value ? 'Yes, add the current workflow' : 'No, generate it in a later stage'}
                      </button>
                    ))}
                  </div>
                  {hasWorkflow && (
                    <div className="mt-4 space-y-4">
                      <TextArea label="Existing workflow or process" onChange={setWorkflowContent} value={workflowContent} />
                      <FilePicker label="Upload existing workflow file" onSelect={(list) => addFiles(list, 'workflow')} accept=".pdf,.txt,.docx,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
                    </div>
                  )}
                  {!hasWorkflow && (
                    <p className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/5 p-3 text-sm text-amber-100">
                      Workflow status will be saved as “requires generation”. No AI response is generated now.
                    </p>
                  )}
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <SectionTitle eyebrow="03 · Invite collaborators" title="Configure your team">
                  The leader account is added automatically as the project lead. Each listed teammate receives a separate, expiring invitation.
                </SectionTitle>
                <div className="mb-5 grid gap-4 rounded-2xl border border-cyan-300/15 bg-cyan-400/5 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="flex items-center gap-3">
                    <Users className="h-5 w-5 text-cyan-200" />
                    <div>
                      <p className="text-sm font-medium text-white">Project lead</p>
                      <p className="text-xs text-slate-400">{leaderName || 'Your account'}</p>
                    </div>
                  </div>
                  <label className="flex items-center gap-3 text-sm text-slate-300">
                    Total team size
                    <input
                      className={`${fieldClass} w-24`}
                      max={25}
                      min={1}
                      onChange={(event) => changeTeamSize(Number(event.target.value))}
                      type="number"
                      value={teamSize}
                    />
                  </label>
                </div>

                <div className="space-y-4">
                  {members.map((member, index) => (
                    <div className="rounded-2xl border border-white/10 bg-slate-950/25 p-4" key={index}>
                      <p className="mb-4 text-xs uppercase tracking-[0.18em] text-slate-400">Member {index + 1}</p>
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="block space-y-2 text-sm text-slate-300">
                          Name
                          <input className={fieldClass} onChange={(event) => updateMember(index, 'full_name', event.target.value)} value={member.full_name} />
                        </label>
                        <label className="block space-y-2 text-sm text-slate-300">
                          Email address (optional)
                          <input className={fieldClass} onChange={(event) => updateMember(index, 'email', event.target.value)} type="email" value={member.email} />
                        </label>
                        <label className="block space-y-2 text-sm text-slate-300">
                          Preliminary role
                          <select className={fieldClass} onChange={(event) => updateMember(index, 'role', event.target.value)} value={member.role}>
                            {['Team member', 'Product lead', 'Researcher', 'Designer', 'Frontend engineer', 'Backend engineer', 'AI/ML engineer', 'QA engineer', 'Presenter'].map((role) => (
                              <option key={role}>{role}</option>
                            ))}
                          </select>
                        </label>
                        <label className="block space-y-2 text-sm text-slate-300">
                          Preliminary skills (comma separated)
                          <input className={fieldClass} onChange={(event) => updateMember(index, 'skills', event.target.value)} value={member.skills} />
                        </label>
                      </div>
                    </div>
                  ))}
                  {members.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-white/15 p-5 text-sm text-slate-400">
                      The leader will be the only project member.
                    </div>
                  )}
                </div>
              </>
            )}
          </motion.div>

          {files.length > 0 && (
            <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/30 p-4">
              <p className="mb-3 text-sm font-medium text-white">Files queued for private upload</p>
              <ul className="space-y-2">
                {files.map(({ file, type }, index) => (
                  <li className="flex items-center justify-between gap-3 text-sm" key={`${file.name}-${index}`}>
                    <span className="flex min-w-0 items-center gap-2 text-slate-300">
                      <FileText className="h-4 w-4 shrink-0 text-cyan-200" />
                      <span className="truncate">{file.name}</span>
                      <span className="shrink-0 text-xs text-slate-500">{type}</span>
                    </span>
                    <button
                      aria-label={`Remove ${file.name}`}
                      className="rounded-lg p-2 text-slate-500 hover:bg-rose-500/10 hover:text-rose-200"
                      onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {errorMessage && (
            <p className="mt-5 rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200" role="alert">
              {errorMessage}
            </p>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
            {step > 0 ? (
              <button className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2.5 text-sm text-slate-200 hover:bg-white/5" onClick={() => setStep((current) => current - 1)} type="button">
                <ArrowLeft className="h-4 w-4" />
                Previous
              </button>
            ) : <span />}
            {step < 2 ? (
              <button className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-300 to-violet-400 px-5 py-2.5 text-sm font-semibold text-slate-950" onClick={goToNextStep} type="button">
                Continue
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-300 to-violet-400 px-5 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50" disabled={busy} type="submit">
                {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {busy ? 'Saving project and preparing invites…' : 'Create project and invitations'}
              </button>
            )}
          </div>
          <p className="mt-4 text-right text-xs text-slate-500">Aithya member · {leaderName || 'Project leader'}</p>
        </form>
      </div>
    </main>
  )
}

function FilePicker({
  label,
  accept,
  multiple = false,
  onSelect,
}: {
  label: string
  accept: string
  multiple?: boolean
  onSelect: (files: FileList | null) => void
}) {
  return (
    <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-cyan-300/25 bg-cyan-300/[0.03] p-5 text-center transition hover:border-cyan-200/50 hover:bg-cyan-300/[0.06]">
      <UploadCloud className="h-6 w-6 text-cyan-200" />
      <span className="mt-2 text-sm font-medium text-slate-200">{label}</span>
      <span className="mt-1 text-xs text-slate-500">Private storage · 15 MB max per file</span>
      <input
        accept={accept}
        className="sr-only"
        multiple={multiple}
        onChange={(event) => {
          onSelect(event.target.files)
          event.target.value = ''
        }}
        type="file"
      />
    </label>
  )
}
