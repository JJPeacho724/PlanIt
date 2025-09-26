export type Slot = { startISO: string; endISO: string }

function roundDuration(mins: number, kind: 'focus' | 'outreach'): number {
  const options = kind === 'focus' ? [25, 50, 90] : [15, 30]
  let best = options[0]
  let bestDiff = Math.abs(mins - best)
  for (const o of options) {
    const diff = Math.abs(mins - o)
    if (diff < bestDiff) { best = o; bestDiff = diff }
  }
  return best
}

export function insertBuffers(blocks: Slot[], minGapMinutes = 10): Slot[] {
  if (!Array.isArray(blocks) || blocks.length === 0) return []
  const sorted = [...blocks].sort((a, b) => new Date(a.startISO).getTime() - new Date(b.startISO).getTime())
  const kept: Slot[] = []
  for (const b of sorted) {
    const prev = kept[kept.length - 1]
    if (!prev) { kept.push(b); continue }
    const gap = new Date(b.startISO).getTime() - new Date(prev.endISO).getTime()
    if (gap < minGapMinutes * 60000) {
      // Push start to enforce buffer
      const start = new Date(prev.endISO).getTime() + minGapMinutes * 60000
      const duration = new Date(b.endISO).getTime() - new Date(b.startISO).getTime()
      const end = new Date(start + duration)
      kept.push({ startISO: new Date(start).toISOString(), endISO: end.toISOString() })
    } else {
      kept.push(b)
    }
  }
  return kept
}

export function fitDuration(startISO: string, mins: number, kind: 'focus' | 'outreach' = 'focus'): Slot {
  const start = new Date(startISO)
  const rounded = roundDuration(mins, kind)
  const end = new Date(start.getTime() + rounded * 60000)
  return { startISO: start.toISOString(), endISO: end.toISOString() }
}



