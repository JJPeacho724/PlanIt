export type ThreadMetadata = { replyCount: number; userReplied: boolean; participants: number }
export type FocusEval = { score: number; reason: string; forceAllow: boolean }

export function evalFocusedEmail(params: {
  headers: Record<string, string>
  subject: string
  plain: string
  fromEmail: string
  fromDomain: string
  threadMetadata?: ThreadMetadata
}): FocusEval {
  const { headers, subject, plain, fromDomain, threadMetadata } = params
  const h = Object.fromEntries(Object.entries(headers || {}).map(([k, v]) => [k.toLowerCase(), String(v || '')])) as Record<string, string>
  const s = (subject || '').toLowerCase()
  const body = (plain || '').toLowerCase()

  // 0) Hard allow: calendar-ish
  const isCalendar = (h['content-type'] || '').includes('text/calendar')
    || /BEGIN:VCALENDAR|BEGIN:VEVENT|invite|ics/i.test(body)
    || /\b(reschedule|calendar|meeting|interview|call|zoom|google meet|teams)\b/.test(`${s} ${body}`)

  if (isCalendar) return { score: 1.0, reason: 'calendar_invite', forceAllow: true }

  // 1) Hard deny signals typical for bulk/newsletters
  const hasListId = Boolean(h['list-id'])
  const hasListUnsub = /<.*@.*>|http/i.test(h['list-unsubscribe'] || '')
  const isBulkPrecedence = /bulk|list|auto|junk/i.test(h['precedence'] || '')
  const hasMarketingCues = /\bunsubscribe\b|\bview in browser\b|\bno-reply\b|\bnewsletter\b|\b% off\b/.test(`${body} ${s}`)
  const manyImagesOnly = /<img/i.test(h['content-type'] || '') && body.length < 200

  let score = 0

  // 2) Positive: person-to-person thread & engagement
  if (threadMetadata?.participants && threadMetadata.participants <= 6) score += 0.25
  if (threadMetadata?.userReplied) score += 0.3
  if (threadMetadata?.replyCount && threadMetadata.replyCount >= 2) score += 0.2

  // 3) Positive: known correspondents / allowlist domains (placeholder - extend via nightly distill)
  const allowDomains = new Set<string>([
    'uchicago.edu', 'google.com', 'mckinsey.com', 'bcg.com', 'bain.com'
  ])
  if (fromDomain && allowDomains.has(fromDomain.toLowerCase())) score += 0.25

  // 4) Positive: scheduling/decision/action language
  if (/\b(schedule|next week|availability|follow up|deadline|offer|invoice|contract|paper|assignment|deliverable)\b/.test(`${body} ${s}`)) {
    score += 0.2
  }

  // 5) Negative: bulk/newsletter vibes
  if (hasListId) score -= 0.5
  if (hasListUnsub) score -= 0.3
  if (isBulkPrecedence) score -= 0.3
  if (hasMarketingCues) score -= 0.25
  if (manyImagesOnly) score -= 0.15

  // Clamp
  score = Math.max(0, Math.min(1, score))
  return { score, reason: score >= 0.6 ? 'p2p_thread' : 'low_confidence', forceAllow: false }
}


