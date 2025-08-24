import {
  BuildPlannerArgs,
  DailyPlan,
  EventDraft,
  ExistingEvent,
  PlannerPreferences,
  PlannerResult,
  PlannerTaskInput,
  ResolveConflictsMode,
} from './types'
import { addMinutes, clampToDayWindow, compareAsc, isWorkDay, minutesBetween, overlaps, toDateKey } from './time'
import { scoreTask } from './scoring'

type FreeBlock = { start: Date; end: Date }

function sortEventsByStart(events: ExistingEvent[]): ExistingEvent[] {
  return [...events].sort((a, b) => compareAsc(a.start, b.start))
}

function getDailyBusyBlocks(date: Date, events: ExistingEvent[], prefs: PlannerPreferences): ExistingEvent[] {
  const dayKey = toDateKey(date)
  const filtered = events.filter((e) => toDateKey(e.start) === dayKey || toDateKey(e.end) === dayKey)
  const { windowStart, windowEnd } = clampToDayWindow(date, prefs)
  const dayBusy = filtered
    .filter((e) => e.busy !== false)
    .map((e) => ({ ...e, start: e.start < windowStart ? windowStart : e.start, end: e.end > windowEnd ? windowEnd : e.end }))
    .filter((e) => e.start < e.end)
  return sortEventsByStart(dayBusy)
}

function computeFreeBlocks(date: Date, events: ExistingEvent[], prefs: PlannerPreferences): FreeBlock[] {
  const { windowStart, windowEnd } = clampToDayWindow(date, prefs)
  const busy = getDailyBusyBlocks(date, events, prefs)
  const free: FreeBlock[] = []
  let cursor = new Date(windowStart)
  for (const b of busy) {
    if (cursor < b.start) free.push({ start: new Date(cursor), end: new Date(b.start) })
    if (b.end > cursor) cursor = new Date(b.end)
  }
  if (cursor < windowEnd) free.push({ start: new Date(cursor), end: new Date(windowEnd) })
  return free
}

function insertBuffers(start: Date, end: Date, prefs: PlannerPreferences): { start: Date; end: Date; rationale: string[] } {
  const context = prefs.contextSwitchBufferMinutes ?? 10
  const travel = prefs.travelBufferMinutes ?? 10
  const startWithBuffer = addMinutes(start, context)
  const endWithBuffer = addMinutes(end, -travel)
  const rationale: string[] = []
  if (context) rationale.push(`applied_context_switch_buffer_${context}m`)
  if (travel) rationale.push(`applied_travel_buffer_${travel}m`)
  return { start: startWithBuffer, end: endWithBuffer, rationale }
}

function allocateInBlock(
  task: PlannerTaskInput,
  block: FreeBlock,
  prefs: PlannerPreferences,
  mode: ResolveConflictsMode,
): { event?: EventDraft; remainingEffort?: number } {
  const minBlock = prefs.minBlockMinutes ?? 30
  const blockMinutes = minutesBetween(block.start, block.end)
  if (blockMinutes < Math.max(minBlock, 5)) return {}

  const desired = task.effortMinutes
  const { start, end, rationale } = insertBuffers(block.start, block.end, prefs)
  let usable = Math.max(0, minutesBetween(start, end))
  if (usable < Math.max(minBlock, 5)) return {}

  let plannedMinutes = 0
  if (mode === 'shorten') {
    plannedMinutes = Math.min(usable, Math.max(minBlock, Math.min(desired, usable)))
  } else {
    plannedMinutes = Math.min(usable, desired)
  }

  if (plannedMinutes < Math.max(minBlock, 5)) return {}

  const event: EventDraft = {
    title: task.title,
    start,
    end: addMinutes(start, plannedMinutes),
    calendarId: task.calendarId,
    color: task.color,
    rationale: [
      'placed_within_free_block',
      ...rationale,
      ...(task.due ? ['due_considered'] : []),
      ...(task.priority ? [`priority_${task.priority}`] : []),
    ],
    confidence: 0.7,
    taskId: task.id,
  }

  return { event, remainingEffort: Math.max(0, desired - plannedMinutes) }
}

function respectsTaskWindow(task: PlannerTaskInput, candidateStart: Date, candidateEnd: Date): boolean {
  if (task.earliestStart && candidateEnd < task.earliestStart) return false
  if (task.latestEnd && candidateStart > task.latestEnd) return false
  return true
}

function planTaskOverDays(
  task: PlannerTaskInput,
  startDate: Date,
  events: ExistingEvent[],
  prefs: PlannerPreferences,
  mode: ResolveConflictsMode,
): { events: EventDraft[]; remainingEffort: number } {
  let remaining = task.effortMinutes
  const planned: EventDraft[] = []

  const dayCursor = new Date(startDate)
  const maxDays = 14 // safety horizon

  for (let i = 0; i < maxDays && remaining > 0; i++) {
    if (!isWorkDay(dayCursor, prefs.workDays)) {
      dayCursor.setDate(dayCursor.getDate() + 1)
      continue
    }

    const freeBlocks = computeFreeBlocks(dayCursor, events, prefs)
    for (const block of freeBlocks) {
      if (remaining <= 0) break
      // respect task window
      if (!respectsTaskWindow(task, block.start, block.end)) continue

      const { event, remainingEffort } = allocateInBlock({ ...task, effortMinutes: remaining }, block, prefs, mode)
      if (event) {
        planned.push(event)
        remaining = remainingEffort ?? 0
        // extend events with this newly planned event as busy for future iterations in the same day
        events.push({ title: event.title, start: event.start, end: event.end, busy: true })
        // optional break after long focus
        const breakMinutes = prefs.breakMinutes ?? 0
        if (breakMinutes && remaining > 0) {
          const breakStart = event.end
          const breakEnd = addMinutes(breakStart, breakMinutes)
          events.push({ title: 'Break', start: breakStart, end: breakEnd, busy: true })
        }
      }
    }

    dayCursor.setDate(dayCursor.getDate() + 1)
  }

  return { events: planned, remainingEffort: remaining }
}

function resolveConflictPolicy(prefs: PlannerPreferences): ResolveConflictsMode {
  return prefs.resolveConflicts ?? 'push'
}

export function buildPlan(args: BuildPlannerArgs): PlannerResult {
  const { now, tasks, existingEvents, preferences } = args
  const prefs: PlannerPreferences = {
    breakMinutes: 0,
    minBlockMinutes: 30,
    contextSwitchBufferMinutes: 10,
    travelBufferMinutes: 10,
    resolveConflicts: 'push',
    ...preferences,
  }

  const mode = resolveConflictPolicy(prefs)

  // Filter out tasks with unmet dependencies (simple heuristic)
  const tasksReady = tasks.filter((t) => !t.dependencies || t.dependencies.length === 0)

  // Score and sort
  const scored = tasksReady
    .map((t) => ({ task: t, score: scoreTask(t, now) }))
    .sort((a, b) => b.score - a.score)

  const workingEvents: ExistingEvent[] = [...existingEvents]
  const allDrafts: EventDraft[] = []
  const unscheduled: string[] = []

  for (const { task } of scored) {
    const startDate = new Date(now)
    const { events: drafts, remainingEffort } = planTaskOverDays(task, startDate, workingEvents, prefs, mode)
    if (drafts.length > 0) allDrafts.push(...drafts)
    if (remainingEffort > 0) {
      if (mode === 'decline') {
        // Drop low-priority/long remainder under decline policy
        unscheduled.push(task.id ?? task.title)
      } else {
        // push remainder to future beyond horizon by recording as unscheduled remainder
        unscheduled.push(task.id ?? task.title)
      }
    }
  }

  // Build daily plan aggregation
  const byDay = new Map<string, EventDraft[]>()
  for (const e of allDrafts) {
    const key = toDateKey(e.start)
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key)!.push(e)
  }
  const dailyPlan: DailyPlan[] = [...byDay.entries()].map(([dateKey, events]) => ({ dateKey, events: events.sort((a, b) => compareAsc(a.start, b.start)) }))

  // Weekly rollup: from week start of the earliest event
  let totalMinutes = 0
  const byDayMinutes: Record<string, number> = {}
  for (const d of dailyPlan) {
    const minutes = d.events.reduce((acc, e) => acc + minutesBetween(e.start, e.end), 0)
    byDayMinutes[d.dateKey] = minutes
    totalMinutes += minutes
  }
  let weekStart: Date
  if (dailyPlan.length > 0) {
    const firstDay = dailyPlan[0]
    if (firstDay && firstDay.events && firstDay.events.length > 0) {
      const firstEvent = firstDay.events[0]
      weekStart = new Date(firstEvent.start)
    } else {
      weekStart = new Date(now)
    }
  } else {
    weekStart = new Date(now)
  }
  // Align to Monday
  const day = weekStart.getDay()
  const diff = (day + 6) % 7 // 0->6, 1->0, ...; days since Monday
  weekStart.setDate(weekStart.getDate() - diff)
  const weeklyRollup = {
    weekStartDateKey: toDateKey(weekStart),
    totalEvents: allDrafts.length,
    totalMinutes,
    byDayMinutes,
  }

  return { events: allDrafts.sort((a, b) => compareAsc(a.start, b.start)), dailyPlan, weeklyRollup, unscheduledTaskIds: unscheduled }
}

