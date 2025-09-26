export type IntentLabel = 'plan_request' | 'schedule_request' | 'mixed'

export interface RoutedIntent {
  intent: IntentLabel
  reasons: string[]
}

function includesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(text))
}

const SCHEDULE_POSITIVE = [
  /\b(schedule|reschedule|book|add to (?:my )?calendar|create (?:an? )?event|make events?|generate events?|time block|block time|slot|calendar events?)\b/i,
  /\b(plan.*events?)\b/i, // allow explicit event planning, but not generic "plan my day/week"
  // everyday phrasing implying scheduling
  /\b(today|this (?:afternoon|evening|morning)|tonight)\b/i,
  /\bafter\s+(?:my\s+)?(call|meeting|video call|zoom|appointment)\b/i,
  /\bbefore\s+(?:i\s+)?(go|head)\b/i,
  /\blunch\b/i,
  /\bshopping|store|groceries\b/i,
]

const SCHEDULE_NEGATIVE = [
  /\b(just|only)\b\s+(?:tell|explain|show|list|summarize)/i,
  /\b(what|how|why|when)\b(?!.*(schedule|calendar))/i,
  /\bunderstand|learn|remember\b/i,
]

const PLAN_CUES = [
  /\bplan|planning|roadmap|framework|strategy|approach|how should I plan\b/i,
  /\bgoals?|steps?|milestones?|priorities?|next actions?\b/i,
]

// Long-horizon cues implying the user wants a scheduled timeline/roadmap
const LONG_HORIZON_CUES = [
  /\bnext\s+(?:\d+|one|two|three|four|five)\s+(?:months?|years?)\b/i,
  /\bover\s+(?:the\s+)?(?:\d+|next)\s+(?:months?|years?)\b/i,
  /\bby\s+(?:end of|EOY|EOQ|Q[1-4]|\d{4}|year'?s end|the end of the year)\b/i,
  /\b12[-\s]?month\b/i,
  /\b90[-\s]?day\b/i,
  /\btimeline|roadmap\b/i,
]

// Career/Internship cues that imply scheduling timeline would be helpful
const CAREER_PM_CUES = [
  /\b(internship|intern|offer|application|apply|resume|portfolio)\b/i,
  /\b(product management|product manager|\bpm\b)\b/i,
  /\b(end of (?:the )?year|EOY|by (?:December|Nov|Nov\.|Dec|Dec\.)\b)/i,
]

export function routeIntent(userMessage: string): RoutedIntent {
  const text = (userMessage || '').trim()
  if (text.length === 0) {
    const conversational = process.env.PLANNER_CONVERSATIONAL === '1'
    return conversational
      ? { intent: 'mixed', reasons: ['empty → conversational on → default to mixed'] }
      : { intent: 'mixed', reasons: ['empty → default to mixed'] }
  }

  const hasSchedule = includesAny(text, SCHEDULE_POSITIVE)
  const hasNegation = includesAny(text, SCHEDULE_NEGATIVE)
  const hasPlan = includesAny(text, PLAN_CUES)
  const longHorizon = includesAny(text, LONG_HORIZON_CUES)

  if (hasSchedule && !hasNegation && !hasPlan) {
    return { intent: 'schedule_request', reasons: ['explicit scheduling verbs', 'no QA-only negation detected'] }
  }
  if (hasSchedule && hasPlan && !hasNegation) {
    return { intent: 'mixed', reasons: ['both planning and scheduling cues present'] }
  }

  // If the user is asking for a long-term timeline/roadmap, allow scheduling
  if (longHorizon && !hasNegation) {
    return { intent: hasPlan ? 'mixed' : 'schedule_request', reasons: ['long-term timeline/roadmap cues detected'] }
  }

  // If career PM cues present with time-bounded language, lean towards mixed to allow scheduling drafts
  if (includesAny(text, CAREER_PM_CUES) && !hasNegation) {
    return { intent: hasPlan ? 'mixed' : 'schedule_request', reasons: ['career/internship PM cues detected'] }
  }

  // Default routing: if conversational planner rollout is enabled, default to mixed for opportunistic scheduling
  const conversational = process.env.PLANNER_CONVERSATIONAL === '1'
  if (conversational) {
    return {
      intent: 'mixed',
      reasons: hasPlan
        ? ['planning cues detected → defaulting to mixed for opportunistic scheduling']
        : ['ambiguous → default to mixed']
    }
  }

  // Default to mixed so we can opportunistically propose events
  return { intent: 'mixed', reasons: hasPlan ? ['planning cues detected → default mixed'] : ['ambiguous → default mixed'] }
}

export function isScheduleAllowed(intent: IntentLabel): boolean {
  return intent === 'schedule_request' || intent === 'mixed'
}


