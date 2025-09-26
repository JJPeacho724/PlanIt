import { routeIntent } from '../../ai/IntentRouter'

describe('IntentRouter', () => {
  const OLD_ENV = process.env
  beforeEach(() => {
    jest.resetModules()
    process.env = { ...OLD_ENV }
  })
  afterAll(() => {
    process.env = OLD_ENV
  })

  it('defaults to mixed for ambiguous when PLANNER_CONVERSATIONAL=1', () => {
    process.env.PLANNER_CONVERSATIONAL = '1'
    expect(routeIntent('learn guitar')).toMatchObject({ intent: 'mixed' })
  })
  it('defaults to mixed even without flag (new default)', () => {
    delete process.env.PLANNER_CONVERSATIONAL
    expect(routeIntent('learn guitar')).toMatchObject({ intent: 'mixed' })
  })
})


