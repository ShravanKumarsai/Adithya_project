import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import ReactFlow, { Background, Controls } from 'reactflow'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  Cloud,
  Gauge,
  GraduationCap,
  GripVertical,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from 'lucide-react'
import { z } from 'zod'
import type { TaskCard } from './data/mockData'
import {
  focusAreas,
  learningTracks,
  overviewMetrics,
  performanceData,
  projectSignals,
  taskBoard,
  teamMembers as mockTeamMembers,
  workflowEdges,
  workflowNodes,
} from './data/mockData'
import { logSupabaseSetup } from './lib/supabase'
import 'reactflow/dist/style.css'

const navItems = ['overview', 'workspace', 'team', 'portfolio']

const statusClasses: Record<TaskCard['status'], string> = {
  Ready: 'bg-cyan-500/15 text-cyan-200 ring-1 ring-inset ring-cyan-400/40',
  'In review': 'bg-violet-500/15 text-violet-200 ring-1 ring-inset ring-violet-400/40',
  Blocked: 'bg-amber-500/15 text-amber-200 ring-1 ring-inset ring-amber-400/40',
  Completed: 'bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-400/40',
}

const priorityClasses: Record<TaskCard['priority'], string> = {
  High: 'bg-rose-500/12 text-rose-200 ring-1 ring-inset ring-rose-500/25',
  Medium: 'bg-amber-500/12 text-amber-200 ring-1 ring-inset ring-amber-500/25',
  Low: 'bg-slate-500/12 text-slate-200 ring-1 ring-inset ring-slate-500/25',
}

const formSchema = z.object({
  projectName: z.string().min(2, 'Project name is required'),
  audience: z.string().min(2, 'Choose an audience'),
  goals: z.string().min(12, 'A brief description helps the AI plan better.'),
})

type FormValues = z.infer<typeof formSchema>

type DashboardTeamMember = {
  name: string
  role: string
  focus: string
  score: number
  scoreLabel?: string
  accent: string
}

type AppProps = {
  projectName?: string
  hackathonName?: string
  projectDescription?: string
  projectTheme?: string
  workflowStatus?: 'provided' | 'requires_generation'
  userEmail?: string
  projectTeam?: DashboardTeamMember[]
  onManageTeam?: () => void
  onCreateProject?: () => void
  onSignOut?: () => void
}

function App({
  projectName,
  hackathonName,
  projectDescription,
  projectTheme,
  workflowStatus,
  userEmail,
  projectTeam,
  onManageTeam,
  onCreateProject,
  onSignOut,
}: AppProps) {
  const [activeTab, setActiveTab] = useState('workspace')
  const [taskItems, setTaskItems] = useState(taskBoard)
  const visibleTeam = projectTeam ?? mockTeamMembers

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  )

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      projectName: 'Aithya Build Sprint',
      audience: 'Hackathon teams',
      goals: 'Build a collaborative AI-driven project platform that helps teams learn, coordinate, and ship with confidence.',
    },
  })

  const onSubmit = (values: FormValues) => {
    console.log('AI brief ready', values)
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) {
      return
    }

    setTaskItems((items) => {
      const oldIndex = items.findIndex((item) => item.id === active.id)
      const newIndex = items.findIndex((item) => item.id === over.id)

      return arrayMove(items, oldIndex, newIndex)
    })
  }

  return (
    <div className="min-h-screen bg-[#0D1727] text-slate-100">
      <div className="mx-auto max-w-7xl px-4 pb-12 pt-6 sm:px-6 lg:px-8">
        <header className="glass-panel sticky top-4 z-20 flex items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400/30 to-violet-500/30 ring-1 ring-white/10">
              <Sparkles className="h-5 w-5 text-cyan-200" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Aithya</p>
              <h1 className="max-w-48 truncate text-lg font-semibold text-slate-50">
                {projectName ?? 'Project Studio'}
              </h1>
            </div>
          </div>

          <nav className="hidden items-center gap-2 rounded-full bg-slate-950/30 p-1 md:flex">
            {navItems.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setActiveTab(item)}
                className={`rounded-full px-4 py-2 text-sm capitalize transition ${
                  activeTab === item
                    ? 'bg-white/10 text-cyan-100 ring-1 ring-white/10'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                {item}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-200 sm:flex sm:items-center sm:gap-2">
              <Cloud className="h-3.5 w-3.5" />
              {logSupabaseSetup()}
            </div>
            <button
              type="button"
              onClick={onManageTeam}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-100 transition hover:bg-white/10 sm:px-4 sm:text-sm"
            >
              Team onboarding
            </button>
            <button
              type="button"
              onClick={onSignOut}
              title={userEmail}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              Sign out
            </button>
            <button
              type="button"
              onClick={onCreateProject}
              className="rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:brightness-110"
            >
              New project
            </button>
          </div>
        </header>

        <main className="mt-8 space-y-6">
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="glass-panel overflow-hidden p-5 sm:p-8"
          >
            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <div>
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1.5 text-xs uppercase tracking-[0.25em] text-cyan-200">
                  <BrainCircuit className="h-3.5 w-3.5" />
                  AI-powered collaboration
                </div>

                <h2 className="max-w-xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                  Build smarter. Learn from every mistake.
                </h2>

                <p className="mt-4 max-w-xl text-base text-slate-300">
                  {projectDescription || 'Turn standout ideas into structured project momentum with AI coaching, live team coordination, and learning loops that improve every sprint.'}
                </p>
                {(hackathonName || projectTheme) && (
                  <p className="mt-3 text-xs text-cyan-100/80">
                    {[hackathonName, projectTheme].filter(Boolean).join(' · ')}
                  </p>
                )}

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={onCreateProject}
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 px-5 py-2.5 text-sm font-medium text-slate-950"
                  >
                    Create project
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-100 hover:bg-white/10"
                  >
                    View roadmap
                  </button>
                </div>

                <div className="mt-8 flex flex-wrap gap-3 text-sm text-slate-300">
                  {focusAreas.map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-white/10 bg-slate-950/40 px-3 py-1.5"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid-sheen rounded-[28px] border border-white/10 bg-gradient-to-br from-[#17263A] via-[#101d2f] to-[#13273c] p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Project health</p>
                    <h3 className="mt-2 text-2xl font-semibold text-white">92 / 100</h3>
                  </div>
                  <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-emerald-200">
                    <Gauge className="h-5 w-5" />
                  </div>
                </div>

                <div className="space-y-4">
                  {[
                    { label: 'Discovery', value: 89 },
                    { label: 'Velocity', value: 84 },
                    { label: 'Learning', value: 92 },
                  ].map((item) => (
                    <div key={item.label}>
                      <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
                        <span>{item.label}</span>
                        <span>{item.value}%</span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-violet-400 to-emerald-400"
                          style={{ width: `${item.value}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 rounded-2xl border border-cyan-400/15 bg-cyan-500/5 p-4">
                  <div className="flex items-center gap-2 text-cyan-200">
                    <ShieldCheck className="h-4 w-4" />
                    <span className="text-sm font-medium">AI workflow ready</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-300">
                    7 tasks automatically routed based on skills, blockers, and learning goals.
                  </p>
                </div>
              </div>
            </div>
          </motion.section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {overviewMetrics.map((metric, index) => (
              <motion.article
                key={metric.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: index * 0.08 }}
                className="glass-panel p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-slate-400">{metric.label}</p>
                    <p className="mt-3 text-3xl font-semibold text-white">{metric.value}</p>
                  </div>
                  <div
                    className={`rounded-full px-2.5 py-1 text-xs ${
                      metric.trend === 'up'
                        ? 'bg-emerald-500/10 text-emerald-200'
                        : metric.trend === 'down'
                          ? 'bg-rose-500/10 text-rose-200'
                          : 'bg-amber-500/10 text-amber-200'
                    }`}
                  >
                    {metric.delta}
                  </div>
                </div>
              </motion.article>
            ))}
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.45fr_0.85fr]">
            <div className="glass-panel p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Workflow map</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">Project lifecycle</h3>
                </div>
                <div className="rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-200">
                  {workflowStatus === 'provided'
                    ? 'Workflow details saved'
                    : workflowStatus === 'requires_generation'
                      ? 'Workflow generation pending'
                      : 'Example lifecycle view'}
                </div>
              </div>

              <div className="h-[320px] rounded-2xl border border-white/5 bg-[#0f1a2b] p-2">
                <ReactFlow
                  nodes={workflowNodes}
                  edges={workflowEdges}
                  fitView
                  fitViewOptions={{ padding: 0.35 }}
                  nodesDraggable={false}
                  nodesConnectable={false}
                  elementsSelectable={false}
                  panOnDrag={false}
                  zoomOnScroll={false}
                  className="bg-[#0f1a2b]"
                >
                  <Background color="#8bb6ff22" gap={16} size={1} />
                  <Controls showInteractive={false} />
                </ReactFlow>
              </div>
            </div>

            <div className="glass-panel p-5 sm:p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Prompt builder</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">AI brief</h3>
                </div>
                <div className="rounded-full border border-cyan-400/30 bg-cyan-500/10 p-2 text-cyan-200">
                  <MessageSquareText className="h-4 w-4" />
                </div>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm text-slate-300">Project name</label>
                  <input
                    {...register('projectName')}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400/60 focus:outline-none"
                  />
                  {errors.projectName && (
                    <p className="mt-1 text-xs text-rose-300">{errors.projectName.message}</p>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block text-sm text-slate-300">Audience</label>
                  <select
                    {...register('audience')}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-2.5 text-sm text-white focus:border-cyan-400/60 focus:outline-none"
                  >
                    <option>Hackathon teams</option>
                    <option>Research groups</option>
                    <option>Student builders</option>
                    <option>Startup squads</option>
                  </select>
                  {errors.audience && (
                    <p className="mt-1 text-xs text-rose-300">{errors.audience.message}</p>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block text-sm text-slate-300">Project goals</label>
                  <textarea
                    rows={4}
                    {...register('goals')}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400/60 focus:outline-none"
                  />
                  {errors.goals && <p className="mt-1 text-xs text-rose-300">{errors.goals.message}</p>}
                </div>

                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-3 text-sm font-medium text-slate-950"
                >
                  Generate AI brief
                  <Sparkles className="h-4 w-4" />
                </button>
              </form>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
            <div className="glass-panel p-5 sm:p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Sprint board</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">Task allocation</h3>
                </div>
                <div className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200">
                  4 live tasks
                </div>
              </div>

              <DndContext collisionDetection={closestCenter} sensors={sensors} onDragEnd={handleDragEnd}>
                <SortableContext items={taskItems.map((task) => task.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {taskItems.map((task) => (
                      <SortableTaskCard key={task.id} task={task} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>

            <div className="space-y-6">
              <div className="glass-panel p-5 sm:p-6">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Learning</p>
                    <h3 className="mt-2 text-xl font-semibold text-white">Growth loops</h3>
                  </div>
                  <div className="rounded-full border border-violet-400/30 bg-violet-500/10 p-2 text-violet-200">
                    <GraduationCap className="h-4 w-4" />
                  </div>
                </div>

                <div className="space-y-4">
                  {learningTracks.map((track) => (
                    <div key={track.title} className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-white">{track.title}</p>
                        <span className="text-xs text-cyan-200">{track.progress}%</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-300">{track.summary}</p>
                      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500"
                          style={{ width: `${track.progress}%` }}
                        />
                      </div>
                      <p className="mt-3 text-xs text-slate-400">Next: {track.nextMilestone}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-panel p-5 sm:p-6">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Team</p>
                    <h3 className="mt-2 text-xl font-semibold text-white">Roles & focus</h3>
                  </div>
                  <div className="rounded-full border border-cyan-400/30 bg-cyan-500/10 p-2 text-cyan-200">
                    <Users className="h-4 w-4" />
                  </div>
                </div>

                <div className="space-y-4">
                  {visibleTeam.map((member) => (
                    <div key={member.name} className="rounded-2xl border border-white/10 bg-slate-950/30 p-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${member.accent} text-sm font-semibold text-slate-50`}>
                          {member.name
                            .split(' ')
                            .map((part) => part[0])
                            .join('')}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-medium text-white">{member.name}</p>
                            <span className="text-xs text-cyan-200">
                              {member.score}{'scoreLabel' in member && member.scoreLabel ? ` ${member.scoreLabel}` : ''}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400">{member.role}</p>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-slate-300">{member.focus}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="glass-panel p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Performance</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">Collaboration trends</h3>
                </div>
                <div className="rounded-full border border-amber-400/30 bg-amber-500/10 p-2 text-amber-200">
                  <BarChart3 className="h-4 w-4" />
                </div>
              </div>

              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={performanceData}>
                    <defs>
                      <linearGradient id="performanceFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="5%" stopColor="#69CAD8" stopOpacity={0.75} />
                        <stop offset="95%" stopColor="#69CAD8" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#334155" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="month" stroke="#94a3b8" tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: '#0f172a',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 12,
                      }}
                    />
                    <Area type="monotone" dataKey="score" stroke="#69CAD8" strokeWidth={3} fill="url(#performanceFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="glass-panel p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Signals</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">Delivery mix</h3>
                </div>
                <div className="rounded-full border border-cyan-400/30 bg-cyan-500/10 p-2 text-cyan-200">
                  <Target className="h-4 w-4" />
                </div>
              </div>

              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={projectSignals} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={5}>
                      {projectSignals.map((entry, index) => (
                        <Cell key={entry.name} fill={['#69CAD8', '#A798F5', '#71D2B0', '#EDB96C', '#EF7F89'][index % 5]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: '#0f172a',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-300">
                {projectSignals.map((signal, index) => (
                  <div key={signal.name} className="flex items-center gap-2 rounded-xl border border-white/5 bg-slate-950/30 px-2 py-1.5">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: ['#69CAD8', '#A798F5', '#71D2B0', '#EDB96C', '#EF7F89'][index % 5] }}
                    />
                    {signal.name}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

type SortableTaskCardProps = {
  task: TaskCard
}

function SortableTaskCard({ task }: SortableTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: task.id })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className="rounded-2xl border border-white/10 bg-slate-950/30 p-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-base font-medium text-white">{task.title}</p>
          <p className="mt-1 text-xs text-slate-400">Owner: {task.owner}</p>
        </div>

        <button
          type="button"
          aria-label={`Drag task ${task.title}`}
          className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-300 hover:text-white"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${statusClasses[task.status]}`}>
          {task.status}
        </span>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${priorityClasses[task.priority]}`}>
          {task.priority}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
          Delivery
        </div>
        <span>{task.eta}</span>
      </div>
    </div>
  )
}

export default App
