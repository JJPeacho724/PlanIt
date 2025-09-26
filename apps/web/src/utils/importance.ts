export type ImportanceInputs = {
  timestampMs: number
  isKnownContact?: boolean
  category?: 'people' | 'recruiters' | 'receipts' | 'promotions' | 'other'
  hasKeywords?: boolean
}

// Simple heuristic: recency + contact + category + keywords
export function computeImportanceScore({ timestampMs, isKnownContact, category, hasKeywords }: ImportanceInputs): number {
  const now = Date.now()
  const ageDays = Math.max(0, (now - timestampMs) / (24 * 3600 * 1000))

  let score = 0
  // Recency: 0..50
  const recency = Math.max(0, 50 - ageDays)
  score += recency

  // Known contact: +20
  if (isKnownContact) score += 20

  // Category boost
  if (category === 'people') score += 15
  if (category === 'receipts') score += 5
  if (category === 'promotions') score -= 10

  // Keywords: +10
  if (hasKeywords) score += 10

  // Clamp 0..100
  return Math.max(0, Math.min(100, Math.round(score)))
}

export function importanceBadge(score: number): 'High' | 'Medium' | 'Low' {
  if (score >= 70) return 'High'
  if (score >= 40) return 'Medium'
  return 'Low'
}


