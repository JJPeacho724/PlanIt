import { openai } from "@/lib/clients/openai"

export type USI = {
  goal: string
  durationMin: number | null
  cadence: { kind: "once" | "daily" | "weekly" | "every_other_day" | "custom"; daysOfWeek?: number[]; interval?: number }
  window?: "morning" | "afternoon" | "evening" | "night" | null
  startDate?: string | null
  endDate?: string | null
  count?: number | null
  timezone?: string | null
  priority?: 1|2|3 | null
}

export async function interpret(message: string, tz = "America/Chicago"): Promise<USI> {
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: 350,
    messages: [
      { role: "system", content:
        `Extract scheduling intent from user text with explicit temporal bounds.
         Return JSON only matching:
         {"goal":string,"durationMin":number|null,
          "cadence":{"kind":"once|daily|weekly|every_other_day|custom","daysOfWeek":number[]|null,"interval":number|null},
          "window":"morning|afternoon|evening|night"|null,
          "startDate":string|null,"endDate":string|null,"count":number|null,
          "timezone":string|null,"priority":1|2|3|null}
         Notes:
         - Clamp to the stated timeframe (e.g., "this week", "next 2 weeks", "until Dec 15").
         - If timeframe is missing, set startDate=today (local tz) and endDate=today+7d.
         - daysOfWeek: 0=Sun..6=Sat.
         - If text says "Mon/Wed/Fri" map to daysOfWeek.
         - "every other day" → kind=every_other_day.
         - “this week” → startDate=today, endDate=upcoming Sunday (local tz).
         - Default duration 60 if missing; min 25.
         - Default timezone to input tz if missing.`},
      { role: "user", content: message + `\nUserTZ: ${tz}` }
    ]
  })
  let out: USI = { goal: message, durationMin: 60, cadence: { kind: "once" }, window: null, startDate: null, endDate: null, count: null, timezone: tz, priority: 2 }
  try { Object.assign(out, JSON.parse(res.choices?.[0]?.message?.content ?? "{}")) } catch {}
  if (!out.durationMin || out.durationMin < 25) out.durationMin = 25
  if (!out.timezone) out.timezone = tz
  return out
}


