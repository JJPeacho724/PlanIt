import { buildAnswerMap, maybeClarifier } from '@/utils/ai/RelevanceGuard'

describe('RelevanceGuard', () => {
  test('High relevance when answer covers sub-questions', () => {
    const user = 'How should I plan my year for PM? Focus on skills and portfolio?'
    const answer = `- Skills to build: product sense, analytics, prioritization\n- Portfolio: 3 case studies in 90 days\n- Timeline: monthly milestones`
    const map = buildAnswerMap(user, answer)
    expect(map.relevance).toBeGreaterThanOrEqual(0.6)
    expect(maybeClarifier(user, map.relevance)).toBeNull()
  })

  test('Low relevance triggers clarifier', () => {
    const user = 'Plan my career in PM'
    const answer = `Here are some generic tips about life.`
    const map = buildAnswerMap(user, answer)
    expect(map.relevance).toBeLessThan(0.6)
    expect(maybeClarifier(user, map.relevance)).toContain('Quick clarifier')
  })
})


