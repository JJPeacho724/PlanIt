import { TaskInput } from './task'

export function scoreTask(task: TaskInput): number {
  let score = 0
  if (task.priority) score += task.priority * 10
  if (task.start && task.end) {
    const duration = (task.end.getTime() - task.start.getTime()) / 36e5
    score += Math.max(0, 8 - duration)
  }
  if (task.description) score += Math.min(5, Math.floor(task.description.length / 40))
  return score
}

