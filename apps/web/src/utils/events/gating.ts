import type { DraftEvent, SuggestionItem, EventSource } from './types'

export const allowedDomains = new Set<string>([
  'uchicago.edu',
  'google.com',
  'zoom.us',
  'microsoft.com',
  'meet.google.com',
  'mit.edu',
  'harvard.edu',
  'nyu.edu',
])

function domainFromRef(ref?: string): string | null {
  if (!ref) return null
  try {
    const u = new URL(ref)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

function looksLikeMeeting(title: string): boolean {
  return /(zoom|meet\.google|teams\.microsoft|webex|invite|calendar)/i.test(title)
}

function hasIcsOrMeetingLink(text: string): boolean {
  return /(\.ics\b|zoom\.us|meet\.google\.com|teams\.microsoft\.com)/i.test(text)
}

function isPast(startISO: string, now: Date): boolean {
  return new Date(startISO).getTime() < now.getTime()
}

export function hardGateDrafts(
  drafts: DraftEvent[],
  suggestions: SuggestionItem[],
  params: { now?: Date; preferences?: { allowedDomains?: string[]; ignoreDomains?: string[]; ignoreKeywords?: string[]; requireMeetingLink?: boolean } }
): { keep: DraftEvent[]; drop: SuggestionItem[] } {
  const now = params.now || new Date()
  const prefs = params.preferences || {}
  const allowed = new Set([...(prefs.allowedDomains || []), ...allowedDomains])
  const ignoreDomains = new Set(prefs.ignoreDomains || [])
  const ignoreKeywords = (prefs.ignoreKeywords || []).map(k => k.toLowerCase())
  const requireLink = prefs.requireMeetingLink ?? false
  const keep: DraftEvent[] = []
  const drop: SuggestionItem[] = []

  for (const d of drafts) {
    const text = `${d.title}`
    const isMarketing = /(save up to|limited time|% off|mcafee|sale|coupon|newsletter|digest|gift card|back[- ]?to[- ]?school|celebrate)/i.test(text)
    const vague = /(sign up|user studies|webinar|learn how to|the forecast|lab report)/i.test(text) && !/\b\d{1,2}(:\d{2})?\s?(am|pm)\b/i.test(text)
    const ambiguous = !/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(d.startISO)
    const past = isPast(d.endISO || d.startISO, now)

    const refDomain = domainFromRef(d.sourceRef)
    const allowedRef = refDomain ? allowed.has(refDomain) : false
    const isIgnoredDomain = refDomain ? ignoreDomains.has(refDomain) : false
    const hasIgnoredKeyword = ignoreKeywords.some(k => text.toLowerCase().includes(k))

    // Allowed sources only
    let sourceAllowed = false
    if (d.source === 'calendar') sourceAllowed = true // invites not yet accepted would be upstream filtered
    if (d.source === 'email' && (looksLikeMeeting(text) || hasIcsOrMeetingLink(text))) sourceAllowed = true
    if (d.source === 'link' && allowedRef) sourceAllowed = true

    if (requireLink && d.source === 'email' && !hasIcsOrMeetingLink(text)) {
      drop.push({ title: d.title, reason: 'no meeting link', source: d.source as EventSource, sourceRef: d.sourceRef })
      continue
    }

    if (!sourceAllowed || isMarketing || vague || ambiguous || past || isIgnoredDomain || hasIgnoredKeyword) {
      const reason = !sourceAllowed ? 'disallowed source' : isMarketing ? 'marketing' : vague ? 'vague' : past ? 'past' : ambiguous ? 'ambiguous' : isIgnoredDomain ? 'ignored domain' : 'ignored keyword'
      drop.push({ title: d.title, reason, source: d.source as EventSource, sourceRef: d.sourceRef })
      continue
    }
    keep.push(d)
  }

  return { keep, drop }
}


