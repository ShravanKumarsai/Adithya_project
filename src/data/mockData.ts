import { MarkerType, Position, type Edge, type Node } from 'reactflow'

export type MetricCard = {
  label: string
  value: string
  delta: string
  trend: 'up' | 'neutral' | 'down'
}

export type TaskCard = {
  id: string
  title: string
  owner: string
  status: 'Ready' | 'In review' | 'Blocked' | 'Completed'
  priority: 'High' | 'Medium' | 'Low'
  eta: string
}

export type TeamMember = {
  name: string
  role: string
  focus: string
  score: number
  accent: string
}

export type LearningTrack = {
  title: string
  progress: number
  summary: string
  nextMilestone: string
}

export const overviewMetrics: MetricCard[] = [
  { label: 'Sprint velocity', value: '84%', delta: '+12% vs last sprint', trend: 'up' },
  { label: 'AI workflow coverage', value: '73%', delta: '7 tasks automated', trend: 'up' },
  { label: 'Team learning score', value: '91', delta: '+5 point rise', trend: 'up' },
  { label: 'Blocked risk', value: '4%', delta: '2 dependencies flagged', trend: 'neutral' },
]

export const projectSignals = [
  { name: 'Discovery', value: 89 },
  { name: 'Planning', value: 73 },
  { name: 'Build', value: 84 },
  { name: 'Learn', value: 92 },
  { name: 'Ship', value: 68 },
]

export const performanceData = [
  { month: 'Jan', score: 64 },
  { month: 'Feb', score: 72 },
  { month: 'Mar', score: 78 },
  { month: 'Apr', score: 81 },
  { month: 'May', score: 86 },
  { month: 'Jun', score: 92 },
]

export const workflowNodes: Node[] = [
  {
    id: 'brief',
    position: { x: 50, y: 110 },
    data: { label: 'Project brief' },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: {
      background: '#14263d',
      border: '1px solid rgba(105, 202, 216, 0.6)',
      color: '#edf7ff',
      borderRadius: 18,
      minWidth: 160,
    },
  },
  {
    id: 'research',
    position: { x: 280, y: 40 },
    data: { label: 'Research' },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: {
      background: '#14263d',
      border: '1px solid rgba(167, 152, 245, 0.6)',
      color: '#edf7ff',
      borderRadius: 18,
      minWidth: 160,
    },
  },
  {
    id: 'design',
    position: { x: 280, y: 180 },
    data: { label: 'UX & design' },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: {
      background: '#14263d',
      border: '1px solid rgba(113, 210, 176, 0.6)',
      color: '#edf7ff',
      borderRadius: 18,
      minWidth: 170,
    },
  },
  {
    id: 'build',
    position: { x: 520, y: 110 },
    data: { label: 'Build workflow' },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: {
      background: '#15283f',
      border: '1px solid rgba(105, 202, 216, 0.7)',
      color: '#edf7ff',
      borderRadius: 18,
      minWidth: 180,
    },
  },
  {
    id: 'review',
    position: { x: 760, y: 110 },
    data: { label: 'Review loop' },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: {
      background: '#15283f',
      border: '1px solid rgba(237, 185, 108, 0.7)',
      color: '#edf7ff',
      borderRadius: 18,
      minWidth: 170,
    },
  },
]

export const workflowEdges: Edge[] = [
  {
    id: 'brief-research',
    source: 'brief',
    target: 'research',
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: '#69CAD8', strokeWidth: 2 },
  },
  {
    id: 'brief-design',
    source: 'brief',
    target: 'design',
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: '#A798F5', strokeWidth: 2 },
  },
  {
    id: 'research-build',
    source: 'research',
    target: 'build',
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: '#69CAD8', strokeWidth: 2 },
  },
  {
    id: 'design-build',
    source: 'design',
    target: 'build',
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: '#71D2B0', strokeWidth: 2 },
  },
  {
    id: 'build-review',
    source: 'build',
    target: 'review',
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: '#EDB96C', strokeWidth: 2 },
  },
]

export const teamMembers: TeamMember[] = [
  { name: 'Maya Chen', role: 'Product lead', focus: 'Requirements alignment', score: 95, accent: 'from-cyan-500/30 to-violet-500/20' },
  { name: 'Aarav Singh', role: 'Systems architect', focus: 'AI workflow orchestration', score: 89, accent: 'from-violet-500/30 to-cyan-500/20' },
  { name: 'Leah Gomez', role: 'UX researcher', focus: 'Interaction testing', score: 92, accent: 'from-teal-500/30 to-cyan-500/20' },
  { name: 'Noah Park', role: 'Frontend engineer', focus: 'Interface polish', score: 87, accent: 'from-amber-500/30 to-violet-500/20' },
]

export const learningTracks: LearningTrack[] = [
  {
    title: 'AI task design sprint',
    progress: 82,
    summary: 'Prompt alignment and skill routing for autonomous task creation.',
    nextMilestone: 'Ship edge-function guardrails',
  },
  {
    title: 'System design deep dive',
    progress: 68,
    summary: 'Architecture review for resilient project orchestration and role permissions.',
    nextMilestone: 'Finalize schema for project states',
  },
  {
    title: 'Collaboration rituals',
    progress: 91,
    summary: 'Improve paired review loops and asynchronous decision capture.',
    nextMilestone: 'Run retrospective + sync summary',
  },
]

export const taskBoard: TaskCard[] = [
  { id: 'task-1', title: 'Define onboarding checklist', owner: 'Maya', status: 'Ready', priority: 'High', eta: 'Today' },
  { id: 'task-2', title: 'Prioritize AI review prompts', owner: 'Aarav', status: 'In review', priority: 'High', eta: 'Tomorrow' },
  { id: 'task-3', title: 'QA validation for mobile flows', owner: 'Leah', status: 'Blocked', priority: 'Medium', eta: '2 days' },
  { id: 'task-4', title: 'Portfolio case summary', owner: 'Noah', status: 'Completed', priority: 'Low', eta: 'Done' },
]

export const focusAreas = [
  'Requirements clarity',
  'AI-coached planning',
  'Learning loops',
  'Team coordination',
]
