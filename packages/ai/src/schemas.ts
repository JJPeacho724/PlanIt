import { z } from 'zod'

export const taskDraftSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  dueAt: z.string().datetime().optional(),
  hardDeadline: z.string().datetime().optional(),
  effortMinutes: z.number().int().positive().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  tags: z.array(z.string()).optional(),
  requiresHuman: z.boolean().optional(),
})

export type TaskDraft = z.infer<typeof taskDraftSchema>

export const createTaskSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  priority: z.number().int().optional(),
})

export type CreateTask = z.infer<typeof createTaskSchema>

export const planResponseSchema = z.object({
  title: z.string().optional(),
  summary: z.string().optional(),
  tasks: z.array(createTaskSchema).optional(),
  reply: z.string(),
})

export type PlanResponse = z.infer<typeof planResponseSchema>

