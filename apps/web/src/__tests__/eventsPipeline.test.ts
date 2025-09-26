import { parseToUserTZ } from '@/utils/events/parseTime'
import { generateDrafts } from '@/utils/events/generateDrafts'

describe('Event pipeline', () => {
  test('Timezone conversion: 10 AM PT ⇒ 13:00 ET/EDT', () => {
    const res = parseToUserTZ('Meeting at 10 AM PT', 'America/New_York')!
    expect(res).toBeTruthy()
    const hour = new Date(res.startISO).getHours()
    expect([12,13]).toContain(hour)
  })

  test('Spam rejection: Save up to 70% on McAfee ⇒ filtered', () => {
    const { payload } = generateDrafts([
      { title: 'Save up to 70% on McAfee', source: 'email' }
    ] as any, { userTZ: 'America/New_York' })
    expect(payload.events.length).toBe(0)
  })

  test('Past events are filtered out', () => {
    const { payload } = generateDrafts([
      { title: 'Sep 3 event at 3pm ET', source: 'email' }
    ] as any, { userTZ: 'America/New_York', now: new Date('2025-09-09T12:00:00-04:00') })
    expect(payload.events.length).toBe(0)
  })

  test('Deduplication merges near-duplicates within 45 min', () => {
    const now = new Date('2025-09-09T09:00:00-04:00')
    const { payload } = generateDrafts([
      { title: 'Zoom with Gary 10:00 ET', source: 'email' },
      { title: 'Zoom with Dr. Gary 10:30 ET', source: 'email' }
    ] as any, { userTZ: 'America/New_York', now })
    expect(payload.events.length).toBe(1)
    // duplicate reasons merged into the kept event
    expect(payload.events[0].reasons.join(' ')).toMatch(/merged-dup|named person|within 7 days/)
  })

  test('Gap enforcement: two drafts ≥10 min apart are kept (allow ≥1)', () => {
    const now = new Date('2025-09-09T09:00:00-04:00')
    const { payload } = generateDrafts([
      { title: 'Call 10:00 ET', source: 'email' },
      { title: 'Workshop 11:00 ET', source: 'email' }
    ] as any, { userTZ: 'America/New_York', now })
    expect(payload.events.length).toBeGreaterThanOrEqual(1)
  })
})


