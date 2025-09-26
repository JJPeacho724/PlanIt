import { z } from 'zod'
import { taskDraftSchema } from './schemas.js'

// JSON Schema for TaskDraft to embed into tool return docs (for reference)
const taskDraftJsonSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    dueAt: { type: 'string', format: 'date-time' },
    hardDeadline: { type: 'string', format: 'date-time' },
    effortMinutes: { type: 'integer', minimum: 1 },
    priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
    tags: { type: 'array', items: { type: 'string' } },
    requiresHuman: { type: 'boolean' },
  },
  required: ['title'],
  additionalProperties: false,
} as const

export const extractTasksFromTextTool = {
  name: 'extract_tasks_from_text',
  description:
    'Extract actionable tasks from free-form text (emails, chats, notes). Return an array of TaskDraft objects capturing title, description, dueAt, hardDeadline, effortMinutes, priority, tags, requiresHuman.',
  parameters: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description:
          'The raw text to analyze. Include the full content (subject + body for emails).',
      },
    },
    required: ['text'],
    additionalProperties: false,
  },
  // Note: Tool return is expected to be { tasks: TaskDraft[] }
  returns: {
    type: 'object',
    properties: {
      tasks: { type: 'array', items: taskDraftJsonSchema },
    },
    required: ['tasks'],
    additionalProperties: false,
  },
} as const

export const extractTasksResponseSchema = z.object({
  tasks: z.array(taskDraftSchema),
})

export type ExtractTasksResponse = z.infer<typeof extractTasksResponseSchema>

