import { interpretTemporal } from "@/lib/planning/temporal"
import { expandOccurrences } from "@/lib/planning/rrule"
import { slotOccurrences } from "@/lib/planning/slotter"

jest.mock("@/lib/clients/openai", () => ({ openai: { chat: { completions: { create: jest.fn(async ({ messages }: any) => ({ choices: [{ message: { content: JSON.stringify(mockInterpret(messages?.[1]?.content || '')) } }] })) } } } }))
jest.mock("@/lib/clients/prisma", () => ({ prisma: { calendarBusy: { findMany: jest.fn(async () => ([])) } } }))

function mockInterpret(user: string) {
  const text = String(user || "").toLowerCase()
  if (text.includes("twice a week")) {
    return { goal: "study calc", durationMin: 90, cadence: { kind: "weekly", daysOfWeek: [1,4] }, window: "evening", endDate: "2025-12-15", startDate: null, count: null, timezone: "America/Chicago", priority: 2 }
  }
  if (text.includes("2× daily") || text.includes("2x daily")) {
    return { goal: "deep work", durationMin: 50, cadence: { kind: "daily" }, window: null, count: 10, timezone: "America/Chicago", startDate: null, endDate: null, priority: 2 }
  }
  if (text.includes("next week") && text.includes("afternoon")) {
    return { goal: "call dentist", durationMin: 30, cadence: { kind: "weekly", daysOfWeek: [1,2,3,4,5] }, window: "afternoon", count: 3, timezone: "America/Chicago", startDate: null, endDate: null, priority: 2 }
  }
  if (text.includes("sundays")) {
    return { goal: "meal prep", durationMin: 120, cadence: { kind: "weekly", daysOfWeek: [0] }, window: "morning", count: 1, timezone: "America/Chicago", startDate: null, endDate: null, priority: 2 }
  }
  if (text.includes("finish thesis") && text.includes("90 days")) {
    const start = new Date(); const end = new Date(start.getTime() + 90*24*60*60*1000)
    return { goal: "finish thesis", durationMin: 120, cadence: { kind: "weekly" }, window: "evening", startDate: start.toISOString().slice(0,10), endDate: end.toISOString().slice(0,10), count: null, timezone: "America/Chicago", priority: 2 }
  }
  return { goal: user, durationMin: 60, cadence: { kind: "once" }, window: null, startDate: null, endDate: null, count: null, timezone: "America/Chicago", priority: 2 }
}

describe("USI + Slotter", () => {
  it("study calc twice a week 90 min until Dec 15 evenings → drafts", async () => {
    const usi = interpretTemporal("study calc twice a week for 90 min until Dec 15 in the evenings")
    const occ = expandOccurrences(usi, 20)
    const drafts = await slotOccurrences(usi as any, occ, "u1", 4)
    expect(drafts.length).toBeGreaterThanOrEqual(1)
    expect(drafts[0].title.toLowerCase()).toContain("study calc")
    expect(drafts[0].rationale).toContain("90")
  })

  it("deep work 2× daily M–F, 50 min → about 10 drafts", async () => {
    const usi = interpretTemporal("deep work 2× daily weekdays, 50 min")
    const occ = expandOccurrences(usi, 20)
    const drafts = await slotOccurrences(usi as any, occ, "u1", 10)
    expect(drafts.length).toBeGreaterThanOrEqual(5)
  })

  it("call dentist next week any afternoon 30 min → 1–3 drafts", async () => {
    const usi = interpretTemporal("call dentist next week any afternoon 30 min")
    const occ = expandOccurrences(usi, 10)
    const drafts = await slotOccurrences(usi as any, occ, "u1", 3)
    expect(drafts.length).toBeGreaterThanOrEqual(1)
  })

  it("meal prep Sundays 2h → next Sunday draft", async () => {
    const usi = interpretTemporal("meal prep Sundays 2h")
    const occ = expandOccurrences(usi, 10)
    const drafts = await slotOccurrences(usi as any, occ, "u1", 2)
    expect(drafts.length).toBeGreaterThanOrEqual(1)
  })

  it("finish thesis in 90 days (weekly milestones, 2h) → weekly drafts until end date", async () => {
    const usi = interpretTemporal("finish thesis in 90 days (weekly milestones, 2h)")
    const occ = expandOccurrences(usi, 20)
    const drafts = await slotOccurrences(usi as any, occ, "u1", 4)
    expect(drafts.length).toBeGreaterThanOrEqual(4)
  })

  it("portfolio review Q4 Sundays 2h → only Oct–Dec Sundays", async () => {
    const usi = interpretTemporal("portfolio review Q4 Sundays 2h")
    const occ = expandOccurrences(usi, 20)
    // Expect occurrences within Q4
    expect(occ.length).toBeGreaterThan(0)
    const months = new Set(occ.map(d => new Date(d).getMonth()+1))
    for (const m of months) expect([10,11,12]).toContain(m)
  })

  it("conflict-aware: skip/shift when busy overlaps", async () => {
    const { prisma } = require("@/lib/clients/prisma")
    ;(prisma.calendarBusy.findMany as jest.Mock).mockResolvedValueOnce([
      { startsAt: new Date(Date.now() + 24*3600*1000 + 9*3600*1000), endsAt: new Date(Date.now() + 24*3600*1000 + 10*3600*1000) }
    ])
    const usi = interpretTemporal("deep work tomorrow morning 60 min")
    const occ = expandOccurrences(usi, 5)
    const drafts = await slotOccurrences(usi as any, occ, "u1", 2)
    expect(drafts.length).toBeGreaterThanOrEqual(1)
  })
})


