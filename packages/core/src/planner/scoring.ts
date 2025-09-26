import { PlannerTaskInput } from './types.js'

// Heuristic score function v1
// Score = f(priority, proximity to due, effort, dependency)
export function scoreTask(task: PlannerTaskInput, now: Date): number {
  let score = 0

  // priority (0..n) weighted
  const priority = task.priority ?? 0
  score += priority * 100

  // proximity to due: nearer is higher; if overdue, boost strongly
  if (task.due) {
    const msUntilDue = task.due.getTime() - now.getTime()
    const daysUntilDue = msUntilDue / 86400000
    if (daysUntilDue <= 0) score += 500
    else score += Math.max(0, 300 - Math.floor(daysUntilDue * 20)) // within ~15 days contributes meaningfully
  }

  // effort: shorter tasks get small boost to fill gaps; very long tasks get slight penalty
  const effort = Math.max(0, task.effortMinutes)
  if (effort <= 30) score += 40
  else if (effort <= 60) score += 25
  else if (effort <= 120) score += 10
  else score -= Math.min(60, Math.floor((effort - 120) / 30))

  // dependencies: if unmet, lower score
  const depCount = task.dependencies?.length ?? 0
  if (depCount > 0) score -= depCount * 50

  // soft constraints: prefers tasks with earlier earliestStart
  if (task.earliestStart) {
    const delta = task.earliestStart.getTime() - now.getTime()
    if (delta <= 0) score += 30
    else if (delta < 86400000) score += 10
  }

  return score
}

