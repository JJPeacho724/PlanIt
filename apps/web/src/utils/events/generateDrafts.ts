import crypto from 'crypto'
import type { EventPlanV2 } from '@/lib/types/planning'
import { DateTime } from 'luxon'
import { parseToUserTZ, detectAmbiguity } from './parseTime'
import { scoreEvent } from './scoreEvent'
import { dedupe } from './dedupe'
import { hardGateDrafts } from './gating'
import { validateAndCorrectDate, ensureValidDuration, adjustToBusinessHours } from './dateValidation'
import type { DraftEvent, EventPipelinePayload, SuggestionItem, EventType, EventSource } from './types'

function stableId(title: string, startISO: string) {
  return crypto.createHash('sha256').update(`${title}|${startISO}`).digest('hex').slice(0, 16)
}

function isMarketing(text: string) {
  return /(save up to|limited time|% off|mcafee|sale|coupon|newsletter|digest|back[- ]?to[- ]?school|celebrate|gift card)/i.test(text)
}

function isVagueCTA(text: string) {
  return /(sign up( now)?|user studies|celebrate (?:\w+ )?month|register for .* events|learn how to|the forecast|lab report)/i.test(text)
}

function classifyType(title: string, snippet?: string): EventType {
  const t = `${title} ${snippet || ''}`
  if (/(invite|zoom|meet|call|meeting|interview|google meet|teams|webex)/i.test(t)) return 'meeting'
  if (/(deadline|due|application|submission)/i.test(t)) return 'deadline'
  if (/(follow up|prep|prepare|review|task)/i.test(t)) return 'task'
  if (/(rsvp|conference|career fair|opportunity|hiring event)/i.test(t)) return 'opportunity'
  return 'task'
}

export interface RawCandidate {
  title: string
  snippet?: string
  source: EventSource
  sourceRef?: string
}

export interface GenerateOptions {
  userTZ?: string
  now?: Date
  perDayLimit?: number
  minGapMinutes?: number
  preferences?: {
    allowedDomains?: string[]
    ignoreDomains?: string[]
    ignoreKeywords?: string[]
    requireMeetingLink?: boolean
  }
}

export function generateDrafts(raw: RawCandidate[], opts: GenerateOptions = {}): { payload: EventPipelinePayload; text: string } {
  const userTZ = opts.userTZ || 'America/New_York'
  const now = opts.now || new Date()
  const perDayLimit = Math.max(1, opts.perDayLimit || 5)
  const minGapMinutes = Math.max(10, opts.minGapMinutes || 10)

  const suggestions: SuggestionItem[] = []
  const drafts: DraftEvent[] = []

  for (const r of raw) {
    const text = `${r.title} ${r.snippet || ''}`
    if (isMarketing(text)) {
      continue
    }
    if (isVagueCTA(text)) {
      suggestions.push({ title: r.title, reason: 'vague CTA', source: r.source, sourceRef: r.sourceRef })
      continue
    }

    const parsed = parseToUserTZ(text, userTZ)
    if (!parsed) {
      suggestions.push({ title: r.title, reason: 'needs time', source: r.source, sourceRef: r.sourceRef })
      continue
    }

    const { startISO, endISO, timezone, hasExplicitTime } = parsed
    if (new Date(endISO).getTime() < now.getTime()) {
      continue
    }

    const type = classifyType(r.title, r.snippet)
    const reasons: string[] = []
    if (detectAmbiguity(text)) reasons.push('ambiguous time')

    const base: Omit<DraftEvent, 'priority' | 'confidence'> = {
      id: 'tmp',
      title: r.title.trim(),
      startISO,
      endISO,
      timezone,
      source: r.source,
      sourceRef: r.sourceRef,
      type,
      reasons,
      createdAtISO: DateTime.fromJSDate(now).setZone(userTZ).toISO()!
    }

    let scored = scoreEvent(base)
    // Penalize items without explicit times (e.g., newsletters with vague “today”)
    if (!hasExplicitTime) {
      const reduced = Math.max(0, scored.confidence - 25)
      const priority = (reduced >= 75 ? 1 : reduced >= 60 ? 2 : 3) as 1 | 2 | 3
      scored = { ...scored, confidence: reduced, priority, reasons: [...(scored.reasons || []), 'no explicit time'] }
    }
    if (reasons.includes('ambiguous time')) {
      const reduced = Math.max(0, scored.confidence - 20)
      const priority = (reduced >= 75 ? 1 : reduced >= 60 ? 2 : 3) as 1 | 2 | 3
      scored = { ...scored, confidence: reduced, priority }
    }

    // Exclude plain tasks from draft events per quality rules; allow only meeting/deadline/opportunity
    if (scored.type === 'task') {
      suggestions.push({ title: scored.title, reason: 'not meeting/deadline/opportunity', source: r.source, sourceRef: r.sourceRef })
      continue
    }
    const final: DraftEvent = { ...scored, id: stableId(scored.title, scored.startISO) }
    drafts.push(final)
  }

  // Dedupe
  let unique = dedupe(drafts)

  // Enforce ≥minGapMinutes buffer and collect conflicts
  unique = unique
    .sort((a, b) => new Date(a.startISO).getTime() - new Date(b.startISO).getTime())
  const kept: DraftEvent[] = []
  const conflictTitles: string[] = []
  for (const e of unique) {
    const prev = kept[kept.length - 1]
    if (!prev) {
      kept.push(e)
      continue
    }
    const gap = new Date(e.startISO).getTime() - new Date(prev.endISO).getTime()
    if (gap < minGapMinutes * 60 * 1000) {
      // conflict → keep higher confidence
      if (e.confidence > prev.confidence) {
        conflictTitles.push(prev.title)
        // move losing prev to suggestions
        suggestions.push({ title: prev.title, reason: 'conflicts', source: prev.source, sourceRef: prev.sourceRef })
        kept.pop()
        kept.push({ ...e, conflicts: [...(e.conflicts || []), prev.title] })
      } else {
        conflictTitles.push(e.title)
        // move losing current to suggestions
        suggestions.push({ title: e.title, reason: 'conflicts', source: e.source, sourceRef: e.sourceRef })
        kept[kept.length - 1] = { ...prev, conflicts: [...(prev.conflicts || []), e.title] }
      }
    } else {
      kept.push(e)
    }
  }

  // Ensure we don't accidentally reduce kept size below 2 due to suggestions side-effects
  // Re-sort and re-check minimal gap constraint without pushing to suggestions this time
  const validated: DraftEvent[] = []
  for (const e of kept.sort((a, b) => new Date(a.startISO).getTime() - new Date(b.startISO).getTime())) {
    const prev = validated[validated.length - 1]
    if (!prev) { validated.push(e); continue }
    const gap = new Date(e.startISO).getTime() - new Date(prev.endISO).getTime()
    if (gap >= minGapMinutes * 60 * 1000) {
      validated.push(e)
    } else if (e.confidence > prev.confidence) {
      validated[validated.length - 1] = e
    }
  }

  // Apply hard gating (allowed sources, domain allowlist, etc.)
  const gated = hardGateDrafts(unique, suggestions, { now, preferences: opts.preferences })
  unique = gated.keep
  for (const s of gated.drop) suggestions.push(s)

  // Cap per-day and split excess to suggestions
  const byDay = new Map<string, DraftEvent[]>()
  for (const e of validated) {
    const dayKey = DateTime.fromISO(e.startISO).setZone(userTZ).toISODate()
    if (!byDay.has(dayKey)) byDay.set(dayKey, [])
    byDay.get(dayKey)!.push(e)
  }
  const selected: DraftEvent[] = []
  for (const [, list] of byDay) {
    list.sort((a, b) => a.priority - b.priority || b.confidence - a.confidence)
    const top = list.slice(0, Math.min(5, perDayLimit))
    const extra = list.slice(Math.min(5, perDayLimit))
    selected.push(...top)
    for (const ex of extra) {
      suggestions.push({ title: ex.title, reason: 'overflow', source: ex.source, sourceRef: ex.sourceRef })
    }
  }

  // Rank globally: P1 then P2 then P3
  selected.sort((a, b) => a.priority - b.priority || b.confidence - a.confidence)

  const payload: EventPipelinePayload = {
    timezone: userTZ,
    summary: { drafts: selected.length, conflicts: conflictTitles.length },
    events: selected,
    suggestions
  }

  const tzLabel = DateTime.local().setZone(userTZ).toFormat('ZZZ') // e.g., EDT
  const header = `Found ${selected.length} draft events (all ${tzLabel}). ${conflictTitles.length > 0 ? `${conflictTitles.length} conflicts.` : 'No conflicts.'}`

  const lines = selected.slice(0, 3).map(e => {
    const s = DateTime.fromISO(e.startISO).setZone(userTZ)
    const t = DateTime.fromISO(e.endISO).setZone(userTZ)
    const time = `${s.toFormat('t')}–${t.toFormat('t')} ${tzLabel}`
    const why = e.reasons.slice(0, 3).join('; ')
    return `* **${e.title}** — *${time}* (${e.source})\n  Why: ${why}.\n  [Accept] [Skip] [Open]`
  })

  const suggLine = suggestions.length > 0
    ? `\n\nSuggestions: ${suggestions.slice(0, 5).map(s => `“${s.title} – ${s.reason}”`).join(', ')}`
    : ''

  const text = `${header}\n\n${lines.join('\n\n')}${suggLine}`
  return { payload, text }
}


// Normalize and convert EventPlanV2 actions into event drafts for the UI/event pipeline
export function fromEventPlanV2(plan: EventPlanV2, userTZ = 'America/New_York') {
  const drafts: any[] = []
  const suggestions: { title: string; reason: string }[] = []

  function normalizeTitle(t: string) {
    return t
      .replace(/^daily practice\s*—\s*/i, '')
      .replace(/^pm week\s*\d+\s*—\s*/i, '')
      .trim()
  }


  const actions = Array.isArray(plan?.actions) ? plan.actions : []
  for (const a of actions as any[]) {
    const spec = typeof a?.specificityScore === 'number' ? a.specificityScore : 0
    // Lower the bar to allow a broader range of actions/goals
    if (spec < 0.4) {
      suggestions.push({ title: a?.title || 'Untitled', reason: 'low specificity' })
      continue
    }
    const rawTitle = String(a?.title || '').trim()
    const title = normalizeTitle(rawTitle)
    const startISO = a?.startISO
    const endISO = a?.endISO
    if (!startISO || !endISO) {
      suggestions.push({ title, reason: 'missing time' })
      continue
    }

    // Validate and correct dates
    const startValidation = validateAndCorrectDate(startISO, userTZ, false)
    const endValidation = validateAndCorrectDate(endISO, userTZ, true)
    
    // Ensure end is after start with reasonable duration
    let finalEnd = ensureValidDuration(startValidation.date, endValidation.date, 30, 8)
    
    // Adjust to business hours if needed
    const adjustedStart = adjustToBusinessHours(startValidation.date, userTZ)
    const adjustedEnd = adjustToBusinessHours(finalEnd, userTZ)

    // Track if dates were corrected
    const wasCorrected = startValidation.corrected || endValidation.corrected || 
                        adjustedStart.getTime() !== startValidation.date.getTime() ||
                        adjustedEnd.getTime() !== finalEnd.getTime()
    const correctionReasons = [startValidation.reason, endValidation.reason].filter(Boolean)
    if (adjustedStart.getTime() !== startValidation.date.getTime()) {
      correctionReasons.push('adjusted to business hours')
    }

    // Make deliverables/resources optional – include when present
    const rationaleLines: string[] = []
    if (a?.summary) rationaleLines.push(a.summary)
    if (a?.deliverable) {
      const d = a.deliverable
      rationaleLines.push(
        `Deliverable: ${d.kind}${d.pathHint ? ` → ${d.pathHint}` : ''}`
      )
      if (Array.isArray(d.acceptanceCriteria) && d.acceptanceCriteria.length > 0) {
        rationaleLines.push('Acceptance: ' + d.acceptanceCriteria.join('; '))
      }
    }
    if (Array.isArray(a?.resources) && a.resources.length > 0) {
      const res = a.resources
        .slice(0, 3)
        .map((r: any) => `${r.title} (${r.url})`)
        .join(' | ')
      rationaleLines.push('Resources: ' + res)
    }

    // Add correction info to rationale if dates were corrected
    if (wasCorrected) {
      rationaleLines.push(`Date correction: ${correctionReasons.join(', ')}`)
    }

    drafts.push({
      id: a?.id || stableId(title, adjustedStart.toISOString()),
      title,
      startsAt: adjustedStart,
      endsAt: adjustedEnd,
      rationale: rationaleLines.join('\n'),
      confidence: typeof a?.confidence === 'number' ? a.confidence : 0.7,
      meta: {
        tags: a?.tags,
        dependsOn: a?.dependsOn,
        checklist: a?.checklist,
        specificityScore: a?.specificityScore,
        deliverable: a?.deliverable,
        resources: a?.resources,
        dateCorrected: wasCorrected,
        originalStartISO: startISO,
        originalEndISO: endISO,
        correctionReasons: correctionReasons
      }
    })
  }

  return { drafts, suggestions }
}

