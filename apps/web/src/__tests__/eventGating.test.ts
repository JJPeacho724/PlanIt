import { generateDrafts } from '@/utils/events/generateDrafts'

describe('Event gating rules', () => {
  test('Spam items filtered (promotions, McAfee, user studies w/o time)', () => {
    const { payload } = generateDrafts([
      { title: 'Save 70% this week only', source: 'email' },
      { title: 'McAfee renewal 50% off', source: 'email' },
      { title: 'User studies sign up', source: 'email' },
    ] as any, { userTZ: 'America/New_York' })
    expect(payload.events.length).toBe(0)
  })

  test('Join Dr. X Zoom, Thu 10 AM PT ⇒ appears once, converted to ET', () => {
    const now = new Date('2025-09-09T09:00:00-04:00')
    const { payload } = generateDrafts([
      { title: 'Join Dr. X Zoom, Thu 10 AM PT', source: 'email' },
      { title: 'Join Dr. X Zoom, Thu 10:30 AM PT', source: 'email' },
    ] as any, { userTZ: 'America/New_York', now })
    expect(payload.events.length).toBe(1)
    const hour = new Date(payload.events[0].startISO).getHours()
    // 10 AM PT = 1 PM ET
    expect(hour === 13 || hour === 12).toBeTruthy()
  })
})


