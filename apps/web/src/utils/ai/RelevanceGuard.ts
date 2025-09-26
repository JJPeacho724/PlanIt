import stringSimilarity from 'string-similarity'

export interface QAItem {
  question: string
  answer: string
}

export interface AnswerMap {
  items: QAItem[]
  coverage: number
  relevance: number // 0..1
}

function splitIntoSubQuestions(message: string): string[] {
  const text = (message || '').trim()
  if (!text) return []
  // Split by question marks, bullets, or conjunctions; keep concise chunks
  const parts = text
    .split(/[?•\n]|(?:\band\b|\bor\b)/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  // Deduplicate similar sub-questions
  const uniq: string[] = []
  for (const p of parts) {
    if (!uniq.some((u) => stringSimilarity.compareTwoStrings(u.toLowerCase(), p.toLowerCase()) > 0.85)) {
      uniq.push(p)
    }
  }
  return uniq.slice(0, 8) // limit
}

export function buildAnswerMap(userMessage: string, answerText: string): AnswerMap {
  const subs = splitIntoSubQuestions(userMessage)
  if (subs.length === 0) {
    return { items: [], coverage: 0, relevance: 0 }
  }
  const lines = (answerText || '').split(/\n|\r/).map((l) => l.trim()).filter(Boolean)
  const fullAnswerLower = (answerText || '').toLowerCase()

  const items: QAItem[] = []
  let covered = 0
  for (const q of subs) {
    // Find best matching line or short span
    let best = ''
    let bestScore = 0
    for (let i = 0; i < lines.length; i++) {
      const score = stringSimilarity.compareTwoStrings(q.toLowerCase(), lines[i].toLowerCase())
      if (score > bestScore) {
        best = lines[i]
        bestScore = score
      }
    }
    // Heuristic: if key content words from the question appear anywhere in the answer, ensure a minimum coverage
    const contentWords = q.toLowerCase().split(/[^a-z0-9]+/i).filter(w => w.length >= 5)
    const hasContentHit = contentWords.some(w => fullAnswerLower.includes(w))
    if (hasContentHit) {
      if (bestScore < 0.65) {
        bestScore = 0.65
        if (!best) best = '[covered implicitly]'
      }
    }
    if (best || bestScore > 0) covered += bestScore
    items.push({ question: q, answer: best || '' })
  }

  const avgCoverage = covered / subs.length
  // Combine heading/QA similarity and coverage (heuristic)
  const relevance = Math.max(0, Math.min(1, avgCoverage))
  return { items, coverage: avgCoverage, relevance }
}

export function maybeClarifier(userMessage: string, relevance: number): string | null {
  if (relevance >= 0.6) return null
  // Single clarifying question
  return `Quick clarifier: What outcome matters most for "${userMessage.slice(0, 80)}"?`
}


