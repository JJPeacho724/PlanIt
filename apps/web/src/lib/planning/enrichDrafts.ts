type Draft = {
  id: string
  title: string
  startsAt: string
  endsAt: string
  rationale?: string
  confidence?: number
  description?: string
  acceptanceCriteria?: string[]
  checklist?: string[]
  reminders?: Array<{ offsetMin: number; channel: "push"|"email" }>
}

export async function enrichDrafts(drafts: Draft[], usi?: { goal?: string }) {
  const goal = (usi?.goal || drafts[0]?.title || "").toLowerCase()
  const baseChecklist = goal.includes("run") ? ["Warm up 5 min", "Maintain form", "Cool down 5 min"]
    : goal.includes("deep work") ? ["Set objective", "Silence notifications", "50 min focus", "5–10 min break"]
    : ["Prepare", "Execute", "Wrap up"]
  return drafts.map(d => ({
    ...d,
    description: d.description || `Time-block for: ${d.title}`,
    acceptanceCriteria: d.acceptanceCriteria || ["Completed on time", "No major interruptions"],
    checklist: d.checklist || baseChecklist,
    reminders: d.reminders || [
      { offsetMin: 30, channel: "push" },
      { offsetMin: 5, channel: "push" }
    ]
  }))
}


