export type ResolveConflictsMode = 'push' | 'shorten' | 'decline'

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6 // 0 = Sunday

export interface WorkWindow {
  startHour: number // 0-23 in local wall clock of provided timezone
  endHour: number // 0-23 in local wall clock of provided timezone
}

export interface PlannerPreferences {
  timeZone: string // IANA timezone, e.g. "America/Los_Angeles"
  workDays: DayOfWeek[] // which days are considered working days
  workWindow: WorkWindow // daily bounds
  breakMinutes?: number // optional preferred break separation between long blocks
  minBlockMinutes?: number // minimum block length when splitting/shortening
  contextSwitchBufferMinutes?: number // default 10
  travelBufferMinutes?: number // default 10
  resolveConflicts?: ResolveConflictsMode // default 'push'
}

export interface PlannerTaskInput {
  id?: string
  title: string
  description?: string
  // Estimated focused effort required to complete the task
  effortMinutes: number
  // Optional explicit window (constraints) the user prefers for this task
  earliestStart?: Date
  latestEnd?: Date
  // Optional due date; proximity increases score
  due?: Date
  // Higher means more important; default 0
  priority?: number
  // Other task ids that should be completed before this one; unmet deps lower score and/or delay scheduling
  dependencies?: string[]
  calendarId?: string
  color?: string
}

export interface ExistingEvent {
  id?: string
  title: string
  start: Date
  end: Date
  busy?: boolean // defaults to true
  calendarId?: string
  color?: string
}

export interface EventDraft {
  title: string
  start: Date
  end: Date
  calendarId?: string
  color?: string
  rationale: string[] // list of applied rules/decisions
  confidence: number // 0..1
  taskId?: string // source task this block represents
}

export interface DailyPlan {
  dateKey: string // YYYY-MM-DD in the planner's timezone
  events: EventDraft[]
}

export interface WeeklyRollup {
  weekStartDateKey: string // YYYY-MM-DD (timezone-aware)
  totalEvents: number
  totalMinutes: number
  byDayMinutes: Record<string, number> // dateKey -> minutes scheduled
}

export interface BuildPlannerArgs {
  now: Date
  tasks: PlannerTaskInput[]
  existingEvents: ExistingEvent[]
  preferences: PlannerPreferences
}

export interface PlannerResult {
  events: EventDraft[]
  dailyPlan: DailyPlan[]
  weeklyRollup: WeeklyRollup
  unscheduledTaskIds: string[] // tasks (or remaining portions) we couldn't place
}

