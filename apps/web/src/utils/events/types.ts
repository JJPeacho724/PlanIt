export type EventSource = 'email' | 'calendar' | 'link' | 'model'
export type EventType = 'meeting' | 'deadline' | 'task' | 'opportunity'

export interface DraftEvent {
  id: string
  title: string
  startISO: string
  endISO: string
  timezone: string
  source: EventSource
  sourceRef?: string
  type: EventType
  priority: 1 | 2 | 3
  confidence: number
  reasons: string[]
  conflicts?: string[]
  createdAtISO: string
  sourceTrust?: 'high' | 'medium' | 'low'
}

export interface SuggestionItem {
  title: string
  reason: string
  source?: EventSource
  sourceRef?: string
}

export interface EventPipelinePayload {
  timezone: string
  summary: { drafts: number; conflicts: number }
  events: DraftEvent[]
  suggestions: SuggestionItem[]
}

export interface EmailCandidate {
  subject: string
  bodySnippet?: string
  from?: string
  receivedAt?: string
  url?: string
}



