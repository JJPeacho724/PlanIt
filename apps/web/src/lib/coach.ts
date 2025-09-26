import OpenAI from 'openai'
import { openai } from '@/lib/clients/openai'

type ToolCall = {
  id: string
  function: { name: string; arguments?: string }
}

export type WebSearchResult = {
  results: Array<{ url: string; title: string; snippet?: string; published?: string | null }>
  query: string
}

export type WebFetchResult = {
  url: string
  title: string
  text: string
  published?: string | null
}

export type PlanJson = {
  events: any[]
  sources: any[]
  assumptions: string[]
  notes: string
}

export async function web_search_impl(query: string, maxResults: number = 5): Promise<WebSearchResult> {
  // Minimal placeholder using DuckDuckGo Instant Answer API as a fallback
  try {
    const q = encodeURIComponent(query)
    const res = await fetch(`https://api.duckduckgo.com/?q=${q}&format=json&no_redirect=1&no_html=1`)
    const data = await res.json()
    const results: Array<{ url: string; title: string; snippet?: string; published?: string | null }> = []
    const seen = new Set<string>()
    function push(url?: string, title?: string, snippet?: string) {
      if (!url || !title) return
      if (seen.has(url)) return
      results.push({ url, title, snippet, published: null })
      seen.add(url)
    }
    if (Array.isArray(data.RelatedTopics)) {
      for (const t of data.RelatedTopics) {
        if (t && t.FirstURL && t.Text) push(t.FirstURL, t.Text)
        if (t && Array.isArray(t.Topics)) {
          for (const tt of t.Topics) if (tt && tt.FirstURL && tt.Text) push(tt.FirstURL, tt.Text)
        }
      }
    }
    if (data.AbstractURL && data.AbstractText) push(data.AbstractURL, data.Heading || data.AbstractText, data.AbstractText)
    return { results: results.slice(0, Math.max(1, Math.min(maxResults, 10))), query }
  } catch {
    return { results: [], query }
  }
}

export async function web_fetch_impl(url: string, maxChars: number = 10000): Promise<WebFetchResult> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'PlanitCoach/1.0 (+https://planit.local)' } })
    const html = await res.text()
    const titleMatch = html.match(/<title>([^<]{1,200})<\/title>/i)
    const title = titleMatch ? titleMatch[1].trim() : url
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxChars)
    return { url, title, text, published: null }
  } catch {
    return { url, title: url, text: '', published: null }
  }
}

function isSpecific(e: any): boolean {
  return Boolean(
    e?.title?.match(/^[A-Z][a-z]+/i) &&
    e?.deliverable && e.deliverable.length >= 8 &&
    e?.definitionOfDone && e.definitionOfDone.length >= 12 &&
    Array.isArray(e?.steps) && e.steps.length >= 3 &&
    (e?.durationMin || (e?.startAt && e?.endAt))
  )
}

export function filterAndAnnotate(planJson: any) {
  planJson.events = (planJson.events || []).filter(isSpecific).map((e: any) => ({
    reminderMinsBefore: [60, 10],
    priority: e.priority ?? 'medium',
    ...e
  }))
  return planJson
}

export const PLANIT_COACH_SYSTEM_PROMPT = `You are Planit Coach. Your job is to turn user goals into concrete, calendar-ready events with web-backed evidence.

## Output contract (JSON only)
Return a single JSON object:
{
  "events": [EventDraft, ... up to 6],
  "sources": [Source, ...],
  "assumptions": [string, ...],
  "notes": string
}

### EventDraft
- id: string (cuid-like)
- title: string (Verb + Object + Context)
- description: string (3–6 sentences; include WHY it matters)
- deliverable: string (measurable output or artifact)
- steps: string[] (3–7 atomic checklist items; each 1 action)
- startAt: string (ISO 8601 with timezone or "suggested")
- endAt: string (ISO 8601 with timezone or "suggested")
- durationMin: number (if start/end unknown, give duration)
- location: string | null
- priority: "high" | "medium" | "low"
- definitionOfDone: string (clear acceptance criteria)
- dependencies: string[] (ids or plain text)
- effortPoints: number (1–5)
- reminderMinsBefore: number[] (e.g., [60, 10])
- confidence: number 0–1 (how likely this is right)
- evidence: string[] (source ids)

### Source
- id: string
- url: string
- title: string
- summary: string (1–3 sentences)
- published: string | null

## Rules (must follow)
1) SPECIFICITY: No vague tasks. Every event must include a concrete deliverable and definitionOfDone. If the user’s goal is broad or casual (e.g., “what should I cook”, “learn X”, “clean room”), decompose into 2–4 tight events with realistic durations (25/50/90), buffers, and a why.
2) TIMEBOXING: Suggest realistic start/end OR duration. Default 25/50/90 mins. Include 5–10 min transition buffers and reminderMinsBefore.
3) RESEARCH: If recommendations require facts (e.g., study plan, recipe, training), attach 2–4 credible sources; otherwise skip.
4) SAFETY/FACTUALITY: Don’t invent facts. Prefer official docs, universities, major publishers. Mark uncertainty in assumptions and reduce confidence.
5) USER CONTEXT: Use provided user profile, tasks, events, and availability if present. Fit events into near-term schedule when possible; otherwise mark as "suggested".
6) FORMAT: Return valid JSON only, no prose outside JSON.
7) IF INFO IS MISSING: List explicit assumptions and proceed; do not ask follow-ups unless absolutely required to create any plan at all.

## Specificity checklist (apply to every event)
- Clear verb/object? ✅
- Single owner action? ✅
- Measurable deliverable? ✅
- DoD stated? ✅
- Timeboxed? ✅
- Cited evidence if recommendations are made? ✅`

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web and return top results for a query.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          maxResults: { type: 'integer', default: 5, minimum: 1, maximum: 10 }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: 'Fetch a single URL and return cleaned text content plus metadata.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Absolute URL' },
          maxChars: { type: 'integer', default: 10000 }
        },
        required: ['url']
      }
    }
  }
]

export async function planWithResearch(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): Promise<PlanJson> {
  const msgs: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = messages
  // Loop until the model returns final content (JSON) with no tool calls
  for (let i = 0; i < 6; i++) {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: msgs,
      tools,
      tool_choice: 'auto',
      temperature: 0.2,
      max_tokens: 1800
    })
    const msg = resp.choices?.[0]?.message
    const calls = (msg as any)?.tool_calls as ToolCall[] | undefined
    if (!calls || calls.length === 0) {
      const content = msg?.content || '{}'
      try {
        const json = JSON.parse(content)
        return filterAndAnnotate(json)
      } catch {
        // If parsing fails, return an empty plan annotated with the raw text
        return filterAndAnnotate({ events: [], sources: [], assumptions: ['Model returned non-JSON'], notes: content || '' })
      }
    }
    for (const call of calls) {
      try {
        const args = JSON.parse(call.function.arguments || '{}')
        if (call.function.name === 'web_search') {
          const results = await web_search_impl(args.query, args.maxResults ?? 5)
          msgs.push({ role: 'tool', tool_call_id: (call as any).id, content: JSON.stringify(results) })
        } else if (call.function.name === 'web_fetch') {
          const page = await web_fetch_impl(args.url, args.maxChars ?? 10000)
          msgs.push({ role: 'tool', tool_call_id: (call as any).id, content: JSON.stringify(page) })
        }
      } catch {
        msgs.push({ role: 'tool', tool_call_id: (call as any).id, content: JSON.stringify({ error: 'tool_failed' }) })
      }
    }
  }
  return filterAndAnnotate({ events: [], sources: [], assumptions: ['tool loop exceeded'], notes: '' })
}


