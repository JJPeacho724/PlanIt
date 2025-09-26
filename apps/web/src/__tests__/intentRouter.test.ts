import { routeIntent, isScheduleAllowed } from '@/utils/ai/IntentRouter'

describe('IntentRouter', () => {
  test('Defaults to mixed on ambiguity/empty', () => {
    const prev = process.env.PLANNER_CONVERSATIONAL
    delete process.env.PLANNER_CONVERSATIONAL
    expect(routeIntent('')).toEqual({ intent: 'mixed', reasons: expect.any(Array) })
    expect(routeIntent('help me think about my career')).toEqual({ intent: 'mixed', reasons: expect.any(Array) })
    process.env.PLANNER_CONVERSATIONAL = prev
  })

  test('Plan request example', () => {
    const r = routeIntent('How should I plan my year for PM?')
    // Conversational scheduler defaults to mixed so scheduling can be proposed
    expect(['plan_request','mixed']).toContain(r.intent)
  })

  test('Schedule request example', () => {
    const r = routeIntent('Please schedule a call tomorrow at 10am and add to calendar')
    expect(r.intent).toBe('schedule_request')
    expect(isScheduleAllowed(r.intent)).toBe(true)
  })

  test('Mixed intent when both planning and scheduling cues', () => {
    const r = routeIntent('Plan my week and schedule two deep work blocks')
    expect(r.intent).toBe('mixed')
    expect(isScheduleAllowed(r.intent)).toBe(true)
  })

  test('Defaults to mixed for ambiguous when PLANNER_CONVERSATIONAL=1', () => {
    const prev = process.env.PLANNER_CONVERSATIONAL
    process.env.PLANNER_CONVERSATIONAL = '1'
    const r = routeIntent('learn guitar')
    expect(r.intent).toBe('mixed')
    process.env.PLANNER_CONVERSATIONAL = prev
  })
})


