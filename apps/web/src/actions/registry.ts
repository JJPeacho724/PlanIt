import { Mail, CalendarClock, BrainCog, Sparkles } from 'lucide-react'

export type Placement = 'header' | 'rail' | 'sheet' | 'fab'
export type ActionId =
  | 'plan-day'
  | 'plan-from-emails'
  | 'schedule-tasks'
  | 'learn-patterns'

export type PlannerAction = {
  id: ActionId
  label: string
  icon?: any
  run: () => Promise<void> | void
  placements: Placement[]
  primary: Placement
  secondary?: Placement[]
}

export const actions: PlannerAction[] = [
  {
    id: 'plan-day',
    label: 'Plan my day',
    icon: Sparkles,
    run: () => fetch('/api/plan', { method: 'POST', body: JSON.stringify({ userId: 'demo-user' }) }),
    placements: ['rail', 'sheet', 'fab'],
    primary: 'fab',
    secondary: ['rail'],
  },
  {
    id: 'plan-from-emails',
    label: 'Plan from emails',
    icon: Mail,
    run: () => {},
    placements: ['rail', 'sheet'],
    primary: 'rail',
  },
  {
    id: 'schedule-tasks',
    label: 'Schedule tasks',
    icon: CalendarClock,
    run: () => {},
    placements: ['rail', 'sheet'],
    primary: 'rail',
  },
  {
    id: 'learn-patterns',
    label: 'Learn my patterns',
    icon: BrainCog,
    run: () => {},
    placements: ['rail', 'sheet'],
    primary: 'rail',
  },
]


