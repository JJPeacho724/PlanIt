import stringSimilarity from 'string-similarity'
import type { DraftEvent } from './types'

function norm(s: string) {
  return s
    .toLowerCase()
    // remove timezone abbreviations and am/pm
    .replace(/\b(et|est|edt|pt|pst|pdt|ct|cst|cdt|mt|mst|mdt|am|pm)\b/g, ' ')
    // remove time-like tokens and digits
    .replace(/\b\d{1,2}(:\d{2})?\b/g, ' ')
    .replace(/\d+/g, ' ')
    // keep letters and spaces only
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function dedupe(events: DraftEvent[]): DraftEvent[] {
  const out: DraftEvent[] = []
  for (const e of events.sort((a, b) => b.confidence - a.confidence)) {
    const dup = out.find(x => {
      const sim = stringSimilarity.compareTwoStrings(norm(x.title), norm(e.title))
      const close = Math.abs(new Date(x.startISO).getTime() - new Date(e.startISO).getTime()) <= 60 * 60 * 1000
      return close && sim >= 0.8
    })
    if (dup) {
      dup.reasons = Array.from(new Set([...(dup.reasons || []), ...(e.reasons || []), 'merged-dup']))
    } else out.push(e)
  }
  return out
}


