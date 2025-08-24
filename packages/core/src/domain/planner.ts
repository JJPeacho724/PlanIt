import { TaskInput } from './task'

export interface PlanResult {
  title?: string
  summary?: string
  tasks?: TaskInput[]
  reply: string
}

export interface BuildPlanArgs {
  message: string
  now: Date
}

export function naivePlanner({ message }: BuildPlanArgs): PlanResult {
  return {
    title: `Plan: ${message}`,
    summary: `Generated a simple plan for: ${message}`,
    tasks: [{ title: message }],
    reply: `I created a task for: ${message}`,
  }
}

