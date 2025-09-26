import type { DraftEvent } from './types'

export function scoreEvent(e: Omit<DraftEvent, 'priority' | 'confidence'>): DraftEvent {
  const baseByType: Record<string, number> = { meeting: 60, deadline: 55, task: 45, opportunity: 35 }
  let score = baseByType[e.type] ?? 35
  const reasons: string[] = [...(e.reasons || [])]

  if (/zoom\.us|meet\.google\.com|teams\.microsoft\.com/i.test(e.title)) {
    score += 10
    reasons.push('has meeting link')
  }
  if (/(\bdr\b|\bprof\b|ceo|cto|founder)/i.test(e.title)) {
    score += 8
    reasons.push('named person')
  }
  if (/(save up to|% off|sale|coupon|newsletter|mcafee)/i.test(e.title)) {
    score -= 50
    reasons.push('marketing')
  }
  if (/(sign up|user studies)/i.test(e.title)) {
    score -= 25
    reasons.push('generic CTA')
  }

  const soon = Date.now() + 7 * 24 * 3600e3
  if (new Date(e.startISO).getTime() < soon) {
    score += 10
    reasons.push('within 7 days')
  }

  score = Math.max(0, Math.min(100, score))
  const priority = (score >= 75 ? 1 : score >= 60 ? 2 : 3) as 1 | 2 | 3
  return { ...e, reasons: Array.from(new Set(reasons)), confidence: score, priority }
}



