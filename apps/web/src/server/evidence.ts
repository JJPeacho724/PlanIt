type EvidenceItem = { title: string; url: string; why: string; snippet?: string }

export async function fetchEvidence(q: string, limit = 3): Promise<{ title: string; url: string; why: string }[]> {
  // IMPLEMENTATION DETAIL: use your existing web lookup integration.
  // Replace globalThis.webSearch with actual search fn if available.
  const searchFn = (globalThis as any).webSearch as undefined | ((query: string, limit?: number) => Promise<EvidenceItem[]>)
  let results: EvidenceItem[] = []
  if (typeof searchFn === 'function') {
    try {
      results = await searchFn(q, limit)
    } catch {
      results = []
    }
  }
  // Fallback to empty list; callers will lower confidence if evidence missing
  const seen = new Set<string>()
  const dedup: EvidenceItem[] = []
  for (const r of results) {
    const key = (() => { try { return new URL(r.url).hostname } catch { return r.url } })()
    if (seen.has(key)) continue
    seen.add(key)
    dedup.push(r)
  }
  return dedup.slice(0, limit).map((r) => ({ title: r.title, url: r.url, why: r.snippet ?? 'Relevant source' }))
}


