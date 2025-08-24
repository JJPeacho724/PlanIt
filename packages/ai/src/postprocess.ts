import { TaskDraft } from './schemas'

const PRIORITY_ORDER = ['low', 'medium', 'high', 'urgent'] as const
type Priority = typeof PRIORITY_ORDER[number]

export function postProcessTaskDrafts(
  drafts: TaskDraft[],
  now: Date = new Date()
): TaskDraft[] {
  return drafts.map((draft) => normalizeTaskDraft(draft, now))
}

export function normalizeTaskDraft(draft: TaskDraft, now: Date): TaskDraft {
  const normalizedPriority = clampPriority(draft.priority)
  const normalizedDueAt = normalizeDateLike(draft.dueAt, now)
  const normalizedHardDeadline = normalizeDateLike(draft.hardDeadline, now)
  const normalizedEffort = inferEffortMinutes(draft.effortMinutes)
  const normalizedTags = normalizeTags(draft.tags)

  return {
    ...draft,
    priority: normalizedPriority,
    dueAt: normalizedDueAt ?? undefined,
    hardDeadline: normalizedHardDeadline ?? undefined,
    effortMinutes: normalizedEffort,
    tags: normalizedTags,
  }
}

export function clampPriority(priority?: string): Priority | undefined {
  if (!priority) return undefined
  const value = priority.toLowerCase().trim()
  const direct = PRIORITY_ORDER.find((p) => p === value)
  if (direct) return direct
  // Map common synonyms
  if (['lowest', 'minor', 'trivial'].includes(value)) return 'low'
  if (['normal', 'standard', 'default'].includes(value)) return 'medium'
  if (['important', 'major'].includes(value)) return 'high'
  if (['critical', 'blocker', 'immediate'].includes(value)) return 'urgent'
  return 'medium'
}

export function inferEffortMinutes(value?: number): number {
  if (!value || !Number.isFinite(value) || value <= 0) return 50
  const rounded = Math.round(value)
  return Math.max(5, Math.min(rounded, 8 * 60))
}

export function normalizeTags(tags?: string[]): string[] | undefined {
  if (!tags || tags.length === 0) return undefined
  const cleaned = Array.from(
    new Set(
      tags
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0)
    )
  )
  return cleaned.length > 0 ? cleaned : undefined
}

export function normalizeDateLike(
  value?: string,
  now: Date = new Date()
): string | null {
  if (!value) return null
  // If already ISO 8601
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(.\d{3})?Z$/.test(value)) {
    return value
  }
  // Very light heuristics for common terms
  const lc = value.trim().toLowerCase()
  const base = new Date(now)
  if (lc === 'today') {
    return new Date(base).toISOString()
  }
  if (lc === 'tomorrow') {
    base.setDate(base.getDate() + 1)
    return base.toISOString()
  }
  const nextWeekdayMatch = lc.match(/^next (monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/)
  if (nextWeekdayMatch) {
    const weekday = nextWeekdayMatch[1]!
    const target = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(
      weekday
    )
    const current = base.getDay()
    let delta = target - current
    if (delta <= 0) delta += 7
    base.setDate(base.getDate() + delta)
    return base.toISOString()
  }
  // Fallback: Date parse
  const parsed = new Date(value)
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString()
  }
  return null
}

