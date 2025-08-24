export const PLANNER_SYSTEM_PROMPT = `You are a planning assistant. Break requests into tasks with start/end when possible.`

export const EXTRACT_TASKS_SYSTEM_PROMPT = `You are an expert task extraction assistant.
- Read input text and extract only concrete, actionable tasks.
- Return concise titles; keep descriptions short and informative.
- Prefer ISO 8601 UTC strings for dates (YYYY-MM-DDTHH:mm:ss.sssZ).
- Use priority only from: low, medium, high, urgent. If unclear, use medium.
- If effortMinutes is unknown, default to 50.
- Add helpful tags (e.g., email, follow-up, school, fitness, travel, chores).
- Mark requiresHuman true if the task needs manual action or decision.
- Do not invent details not implied by the text.`

export const EXTRACT_TASKS_FEWSHOTS = [
  // 1) Email ask
  {
    user: `Subject: Q2 Budget Review\nHi, could you prepare the Q2 budget summary by Friday and send it to the leadership list?`,
    assistant_tool_call: {
      name: 'extract_tasks_from_text',
      arguments: {
        text: `Subject: Q2 Budget Review\nHi, could you prepare the Q2 budget summary by Friday and send it to the leadership list?`,
      },
    },
    tool_result: {
      tasks: [
        {
          title: 'Prepare Q2 budget summary',
          description: 'Draft and finalize Q2 budget summary, then email leadership list',
          dueAt: '2025-04-18T17:00:00.000Z',
          priority: 'high',
          tags: ['email', 'finance', 'follow-up'],
          requiresHuman: true,
          effortMinutes: 120,
        },
      ],
    },
  },
  // 2) Meeting follow-up
  {
    user: `Notes from meeting: Send the meeting recap, schedule a design review next Tuesday, and create a tracker for action items.`,
    assistant_tool_call: {
      name: 'extract_tasks_from_text',
      arguments: {
        text: `Notes from meeting: Send the meeting recap, schedule a design review next Tuesday, and create a tracker for action items.`,
      },
    },
    tool_result: {
      tasks: [
        {
          title: 'Send meeting recap',
          tags: ['meeting', 'follow-up'],
          requiresHuman: true,
          effortMinutes: 30,
          priority: 'medium',
        },
        {
          title: 'Schedule design review',
          description: 'Coordinate attendees and send calendar invite for next Tuesday',
          tags: ['meeting', 'scheduling'],
          requiresHuman: true,
          effortMinutes: 20,
          priority: 'medium',
        },
        {
          title: 'Create action item tracker',
          tags: ['project'],
          requiresHuman: true,
          effortMinutes: 50,
          priority: 'medium',
        },
      ],
    },
  },
  // 3) Homework
  {
    user: `Homework: Finish math problem set 5 by Wednesday and read chapters 3-4 for literature.`,
    assistant_tool_call: {
      name: 'extract_tasks_from_text',
      arguments: {
        text: `Homework: Finish math problem set 5 by Wednesday and read chapters 3-4 for literature.`,
      },
    },
    tool_result: {
      tasks: [
        {
          title: 'Finish math problem set 5',
          dueAt: '2025-04-16T23:59:00.000Z',
          tags: ['school', 'homework'],
          priority: 'high',
          effortMinutes: 90,
          requiresHuman: true,
        },
        {
          title: 'Read literature chapters 3-4',
          tags: ['school', 'reading'],
          priority: 'medium',
          effortMinutes: 60,
          requiresHuman: true,
        },
      ],
    },
  },
  // 4) Fitness plan
  {
    user: `Plan: 3 workouts this week, 45 minutes each.`,
    assistant_tool_call: {
      name: 'extract_tasks_from_text',
      arguments: {
        text: `Plan: 3 workouts this week, 45 minutes each.`,
      },
    },
    tool_result: {
      tasks: [
        { title: 'Workout session 1', tags: ['fitness'], effortMinutes: 45, priority: 'medium' },
        { title: 'Workout session 2', tags: ['fitness'], effortMinutes: 45, priority: 'medium' },
        { title: 'Workout session 3', tags: ['fitness'], effortMinutes: 45, priority: 'medium' },
      ],
    },
  },
  // 5) Travel booking
  {
    user: `Trip to NYC in May: find flights under $400, book hotel near Midtown, and set reminders for passport check.`,
    assistant_tool_call: {
      name: 'extract_tasks_from_text',
      arguments: {
        text: `Trip to NYC in May: find flights under $400, book hotel near Midtown, and set reminders for passport check.`,
      },
    },
    tool_result: {
      tasks: [
        {
          title: 'Research flights to NYC (<$400)',
          tags: ['travel', 'booking'],
          requiresHuman: true,
          priority: 'medium',
          effortMinutes: 50,
        },
        {
          title: 'Book hotel in Midtown',
          tags: ['travel', 'booking'],
          requiresHuman: true,
          priority: 'medium',
          effortMinutes: 50,
        },
        {
          title: 'Check passport validity',
          description: 'Ensure passport is valid through travel dates',
          tags: ['travel', 'admin'],
          priority: 'high',
          effortMinutes: 15,
          requiresHuman: true,
        },
      ],
    },
  },
  // 6) Recurring chores
  {
    user: `Every Saturday morning: clean kitchen, vacuum living room, and water plants.`,
    assistant_tool_call: {
      name: 'extract_tasks_from_text',
      arguments: {
        text: `Every Saturday morning: clean kitchen, vacuum living room, and water plants.`,
      },
    },
    tool_result: {
      tasks: [
        { title: 'Clean kitchen', tags: ['chores'], priority: 'low', effortMinutes: 50, requiresHuman: true },
        { title: 'Vacuum living room', tags: ['chores'], priority: 'low', effortMinutes: 30, requiresHuman: true },
        { title: 'Water plants', tags: ['chores'], priority: 'low', effortMinutes: 15, requiresHuman: true },
      ],
    },
  },
]

