import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { prisma } from '@/lib/clients/prisma'
import { openai } from '@/lib/clients/openai'
import { buildPlan, type PlannerTaskInput, type ExistingEvent, type PlannerPreferences } from '@acme/core'

// AI-powered event generation from tasks and Google Calendar data
export function keepEventByTypeAndDuration(title: string, start: Date | string, end: Date | string): boolean {
  const t = (title || '').toLowerCase()
  const durationMin = (new Date(end as any).getTime() - new Date(start as any).getTime()) / 60000
  const isMeeting = /(invite|zoom|meet|call|meeting|interview|calendar)/i.test(t)
  const isDeadline = /(deadline|due|submission)/i.test(t)
  const isWorkBlock = /(write|draft|study|review|read|research|code|design|practice|workout|clean|grocer|shop|cook|prep|file|apply|plan)/i.test(t)
  return durationMin >= 25 && (isMeeting || isDeadline || isWorkBlock)
}

export function filterDrafts(
  events: Array<{ title: string; start: Date | string; end: Date | string }>,
  preferences?: { planning?: { eventCapPerDay?: number } }
) {
  const dailyCap = Math.max(1, preferences?.planning?.eventCapPerDay || 4)
  const kept = events.filter(e => keepEventByTypeAndDuration(e.title as any, e.start as any, e.end as any))
  const byDay = new Map<string, typeof kept>()
  for (const e of kept) {
    const key = new Date(e.start as any).toISOString().slice(0, 10)
    if (!byDay.has(key)) byDay.set(key, [])
    const arr = byDay.get(key)!
    if (arr.length < dailyCap) arr.push(e)
  }
  return Array.from(byDay.values()).flat()
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const body = await req.json()
  const { preferences = {}, includeGoogleData = true, localMode = false, goal, scheduleTemplate = [] } = body
  
  // Allow local mode without authentication for planning purposes
  if (!session?.user?.email && !localMode) {
    console.log('Events generation: No authenticated user, but local mode not enabled')
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  
  const userId = session?.user ? (session.user as any).id as string : 'local-user'
  const isLocalMode = !session?.user?.email || localMode
  
  console.log('Events generation started:', { 
    userId, 
    preferences, 
    includeGoogleData: includeGoogleData && !isLocalMode, // Don't use Google data in local mode
    userEmail: session?.user?.email || 'local-mode',
    isLocalMode
  })

  try {
    // 1. Get all tasks for the user (or create sample tasks in local mode)
    let tasks: any[] = []
    
    if (isLocalMode) {
      // In local mode, use a curated set of high-priority sample tasks
      console.log('🏠 Local mode: Using curated sample tasks')
      tasks = [
        {
          id: 'local-1',
          title: 'Meeting with Dr. Levin',
          description: 'Attend scheduled meeting with Dr. Levin at 3 PM CT',
          priority: 3,
          effortMinutes: 60,
          tags: ['meeting', 'appointment'],
          source: 'MANUAL',
          userId: 'local-user',
          createdAt: new Date()
        },
        {
          id: 'local-2',
          title: 'Climate Briefing - Sept 2 at 9 AM CT',
          description: 'Time-sensitive commitment scheduled for September 2 at 9 AM CT',
          priority: 3,
          effortMinutes: 60,
          tags: ['meeting', 'important'],
          source: 'MANUAL',
          userId: 'local-user',
          createdAt: new Date()
        },
        {
          id: 'local-3',
          title: 'Plan Fall Travel',
          description: 'Research Southwest Airlines $49 sale - time-sensitive opportunity',
          priority: 2,
          effortMinutes: 90, // Reduced from 120
          tags: ['travel', 'planning', 'deadline'],
          source: 'MANUAL',
          userId: 'local-user',
          createdAt: new Date()
        },
        {
          id: 'local-4',
          title: 'Follow up on Databricks internship',
          description: 'Follow up on internship application if no response received',
          priority: 2,
          effortMinutes: 30,
          tags: ['job', 'follow-up'],
          source: 'MANUAL',
          userId: 'local-user',
          createdAt: new Date()
        }
      ]
    } else {
      // Authenticated mode: Get tasks from database
      tasks = await prisma.task.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50 // Limit to recent tasks
      })
    }

    // If no tasks exist in authenticated mode, create sample tasks automatically
    if (!isLocalMode && tasks.length === 0) {
      try {
        const sampleTasks = [
          { title: 'Review morning emails', description: 'Check and respond to important emails', priority: 2, effortMinutes: 30 },
          { title: 'Team standup meeting', description: 'Daily team sync and updates', priority: 3, effortMinutes: 30 },
          { title: 'Work on quarterly report', description: 'Continue drafting Q4 report', priority: 1, effortMinutes: 120 },
          { title: 'Call with client', description: 'Scheduled client check-in call', priority: 3, effortMinutes: 60 },
          { title: 'Code review', description: 'Review pending pull requests', priority: 2, effortMinutes: 45 }
        ]
        
        // Create sample tasks
        for (const taskData of sampleTasks) {
          await prisma.task.create({
            data: {
              userId,
              source: 'MANUAL',
              title: taskData.title,
              description: taskData.description,
              priority: taskData.priority,
              effortMinutes: taskData.effortMinutes
            }
          })
        }
        
        // Fetch the newly created tasks
        const newTasks = await prisma.task.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 50
        })
        
        // Update the tasks variable to use the newly created tasks
        tasks = newTasks as any[]
        
      } catch (error) {
        console.error('Failed to create sample tasks:', error)
        return NextResponse.json({
          success: false,
          error: 'Failed to create sample tasks for event generation',
          eventDrafts: [],
          metadata: {
            totalTasks: 0,
            scheduledEvents: 0,
            unscheduledTasks: 0,
            googleCalendarEvents: 0,
            timeRange: null,
            message: 'Error creating sample tasks. Please try again.'
          }
        })
      }
    }

    // Normalize tasks into a consistent shape for planning
    const normalizeTask = (t: any) => ({
      ...t,
      description: t.description || '',
      priority: t.priority ?? 0,
      effortMinutes: t.effortMinutes ?? 60,
      tags: Array.isArray(t.tags) ? t.tags : [],
    })
    tasks = tasks.map(normalizeTask)

    // 2a. Hard-filter promotional/vague CTA tasks (email-derived or otherwise)
    try {
      const promoPattern = /(save up to|% off|sale|deal|offer|last chance|limited time|coupon|newsletter|mcafee)/i
      const ctaPattern = /(webinar|register|sign up|user stud(y|ies)|paid study|haptic toolkit|spinning displays|amazon gift card)/i
      const looksPromotional = (t: any) => {
        const text = `${t.title || ''} ${t.description || ''}`
        return promoPattern.test(text) || ctaPattern.test(text)
      }
      const beforeCount = tasks.length
      tasks = tasks.filter(t => !looksPromotional(t))
      const removed = beforeCount - tasks.length
      if (removed > 0) {
        console.log(`🧹 Filtered ${removed} promotional/CTA tasks from scheduling candidates`)
      }
    } catch (gerr) {
      console.warn('Task promo/CTA gating failed (continuing):', gerr)
    }

    // 2. Optional goal relevance filtering (keep tasks aligned with the user's goal)
    if (goal && tasks.length > 0) {
      try {
        const classification = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You select which tasks DIRECTLY support the user's stated goal. Return ONLY task IDs, one per line. Max 12. Be strict: include only tasks that materially help the goal.`
            },
            {
              role: 'user',
              content: `Goal: ${goal}\n\nTasks:\n${tasks.map(t => `ID: ${t.id}\nTitle: ${t.title}\nDescription: ${t.description || ''}`).join('\n---\n')}\n\nReturn only the IDs of tasks that directly support the goal.`
            }
          ],
          temperature: 0,
          max_tokens: 200
        })
        const text = classification.choices?.[0]?.message?.content?.trim() || ''
        const ids = text.split('\n').map(s => s.trim()).filter(Boolean)
        if (ids.length > 0) {
          const before = tasks.length
          tasks = tasks.filter(t => ids.includes(t.id))
          console.log(`🎯 Goal relevance filter kept ${tasks.length}/${before} tasks for goal.`)
        }
      } catch (grErr) {
        console.warn('Goal relevance filtering failed (continuing without it):', grErr)
      }
    }

    // 3. Get existing calendar events (from Google Calendar cache or local mock)
    // Also treat scheduleTemplate blocks as busy anchors so we mimic the assistant's proposed structure
    let calendarBusy = []
    
    if (isLocalMode) {
      // In local mode, use sample busy times
      console.log('🏠 Local mode: Using sample calendar busy times')
      const now = new Date()
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
      
      calendarBusy = [
        {
          id: 'busy-1',
          title: 'Existing Meeting',
          startsAt: new Date(tomorrow.setHours(10, 0, 0, 0)),
          endsAt: new Date(tomorrow.setHours(11, 0, 0, 0)),
          userId: 'local-user'
        },
        {
          id: 'busy-2', 
          title: 'Lunch Break',
          startsAt: new Date(tomorrow.setHours(12, 0, 0, 0)),
          endsAt: new Date(tomorrow.setHours(13, 0, 0, 0)),
          userId: 'local-user'
        }
      ]
    } else {
      // Authenticated mode: Get from database
      calendarBusy = await prisma.calendarBusy.findMany({
        where: { 
          userId,
          startsAt: { gte: new Date() }, // Only future events
          endsAt: { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } // Next 30 days
        },
        orderBy: { startsAt: 'asc' }
      })
    }

    // Normalize and append schedule template blocks into busy map (so planning respects them)
    try {
      if (Array.isArray(scheduleTemplate) && scheduleTemplate.length > 0) {
        const anchors = scheduleTemplate
          .map((b: any, i: number) => ({
            id: `template-${i}`,
            title: b.title || 'Proposed Block',
            startsAt: new Date(b.start),
            endsAt: new Date(b.end),
            userId
          }))
          .filter(a => Number.isFinite(a.startsAt.getTime()) && Number.isFinite(a.endsAt.getTime()))
        calendarBusy = [...calendarBusy, ...anchors]
      }
    } catch (templErr) {
      console.warn('Failed to merge scheduleTemplate anchors:', templErr)
    }

    // 4. Use AI to filter tasks that deserve calendar events
    let filteredTasks = tasks
    
    if (tasks.length > 8) { // Only filter if we have many tasks
      try {
        console.log('🤖 Using AI to filter important tasks for calendar events...')
        
        const taskFilterCompletion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are an expert at determining which tasks deserve dedicated calendar events vs which should be done ad-hoc.

CALENDAR EVENT CRITERIA - Only select tasks that meet at least 2 of these:
1. Has a specific deadline or time constraint
2. Requires focused, uninterrupted time (30+ minutes)
3. Involves other people (meetings, calls, appointments)
4. Is high priority or important for goals
5. Has dependencies or affects other work
6. Requires preparation or specific resources

AVOID CALENDAR EVENTS FOR:
- Quick tasks under 15 minutes
- Routine maintenance tasks
- Generic "check email" or "browse social media"
- Vague or low-priority tasks
- Tasks that can be done between other activities

Return ONLY the task IDs that deserve calendar events, maximum 8 tasks.`
            },
            {
              role: 'user',
              content: `Filter these tasks to find which ones deserve calendar events:

${tasks.map(task => `
ID: ${task.id}
Title: ${task.title}
Description: ${task.description || 'No description'}
Priority: ${task.priority} (1=low, 3=high)
Effort: ${task.effortMinutes} minutes
Tags: ${task.tags?.join(', ') || 'None'}
`).join('\n---\n')}

Return only task IDs that deserve calendar events, one per line.`
            }
          ],
          temperature: 0.3,
          max_tokens: 200
        })

        const aiResponse = taskFilterCompletion.choices?.[0]?.message?.content?.trim()
        if (aiResponse) {
          const selectedIds = aiResponse.split('\n').map(line => line.trim()).filter(id => id)
          filteredTasks = tasks.filter(task => selectedIds.includes(task.id))
          console.log(`🎯 AI filtered ${tasks.length} tasks down to ${filteredTasks.length} calendar-worthy events`)
        }
      } catch (error) {
        console.warn('AI task filtering failed, using priority-based fallback:', error)
        // Fallback: Filter by priority and effort
        filteredTasks = tasks
          .filter(task => task.priority >= 2 || task.effortMinutes >= 30)
          .slice(0, 8)
      }
    }

    // 5. Convert to planner format
    const plannerTasks: PlannerTaskInput[] = filteredTasks.map((task: any) => ({
      id: task.id,
      title: task.title,
      description: task.description || undefined,
      effortMinutes: task.effortMinutes || 60, // Default 1 hour if not specified
      priority: task.priority || 0,
      due: task.dueAt || undefined,
      dependencies: task.blockingTaskId ? [task.blockingTaskId] : undefined
    }))

    const existingEvents: ExistingEvent[] = (calendarBusy as any[]).map((event: any) => ({
      title: event.title || 'Busy',
      start: event.startsAt,
      end: event.endsAt,
      busy: true,
      calendarId: event.calendarId || undefined
    }))

    // 6. Use AI to enhance task analysis before planning
    let enhancedTasks = plannerTasks
    if (includeGoogleData && plannerTasks.length > 0) {
      try {
        // Get AI insights about the tasks based on their Google origins
        const tasksWithGoogleContext = tasks.filter((t: any) => t.source === 'EMAIL' || t.createdFromMessageId)
        
        if (tasksWithGoogleContext.length > 0) {
          const taskAnalysis = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: `You are an expert at analyzing tasks derived from emails and calendar events to optimize scheduling.
                
                For each task, consider:
                - Email context and urgency indicators
                - Time-sensitive keywords (urgent, ASAP, deadline, meeting, etc.)
                - Effort estimation based on task complexity
                - Optimal scheduling preferences (morning vs afternoon, before/after meetings)
                - Dependencies and sequencing
                
                Return updated task metadata as JSON with enhanced effort estimates, priorities, and scheduling preferences.`
              },
              {
                role: 'user',
                content: `Analyze these Google-derived tasks and provide enhanced scheduling metadata:
                
                ${tasksWithGoogleContext.map((t: any) => `
                Task: ${t.title}
                Description: ${t.description || 'No description'}
                Source: ${t.source}
                Current Priority: ${t.priority}
                Current Effort: ${t.effortMinutes} minutes
                Tags: ${(Array.isArray(t.tags) ? t.tags : []).join(', ')}
                `).join('\n---\n')}`
              }
            ],
            temperature: 0.3,
            max_tokens: 1500
          })

          const aiAnalysis = taskAnalysis.choices?.[0]?.message?.content
          if (aiAnalysis) {
            try {
              const analysisData = JSON.parse(aiAnalysis as string)
              // Apply AI insights to enhance task data
              enhancedTasks = plannerTasks.map(task => {
                const enhancement = analysisData.tasks?.find((t: any) => t.id === task.id || t.title === task.title)
                if (enhancement) {
                  return {
                    ...task,
                    effortMinutes: enhancement.effortMinutes || task.effortMinutes,
                    priority: enhancement.priority !== undefined ? enhancement.priority : task.priority,
                    preferredTimeOfDay: enhancement.preferredTimeOfDay,
                    urgencyScore: enhancement.urgencyScore
                  }
                }
                return task
              })
            } catch (parseError) {
              console.warn('Failed to parse AI task analysis, using original tasks:', parseError)
            }
          }
        }
      } catch (aiError) {
        console.warn('AI task enhancement failed, proceeding with original tasks:', aiError)
      }
    }

    // 7. Generate plan using the planner algorithm with smart limits
    // Determine user's preferred timezone when available
    let userTimeZone = 'America/Chicago'
    try {
      if (!isLocalMode) {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { timeZone: true } })
        if (user?.timeZone) userTimeZone = user.timeZone
      }
    } catch (tzErr) {
      console.warn('Could not load user timeZone, using default:', tzErr)
    }

    const plannerPrefs: PlannerPreferences = {
      timeZone: userTimeZone,
      workDays: [1, 2, 3, 4, 5], // Monday-Friday
      workWindow: {
        startHour: 8, // 8 AM
        endHour: 18  // 6 PM
      },
      breakMinutes: 0, // Reduced to prevent too many break events
      minBlockMinutes: 45, // Increased to prevent tiny blocks
      contextSwitchBufferMinutes: 5, // Reduced buffer time
      travelBufferMinutes: 10, // Reduced buffer time
      resolveConflicts: 'shorten', // Prefer shortening over pushing to prevent cascade
      ...preferences
    }

    const plan = buildPlan({
      now: new Date(),
      tasks: enhancedTasks,
      existingEvents,
      preferences: plannerPrefs
    })

    // 8. Apply intelligent selectivity filters to prevent event overgeneration
    console.log(`Generated ${plan.events.length} initial event drafts`)
    
    const conversational = process.env.PLANNER_CONVERSATIONAL === '1'

    // Legacy conservative pre-filter (meetings/deadlines only, >=30min)
    const meetingOrDeadline = plan.events.filter(event => {
      const t = (event.title || '').toLowerCase()
      const looksMeeting = /(invite|zoom|meet|call|meeting|interview|calendar)/i.test(t)
      const looksDeadline = /(deadline|due|submission)/i.test(t)
      return looksMeeting || looksDeadline
    })
    const filteredByDurationLegacy = meetingOrDeadline.filter(event => {
      const duration = (new Date(event.end).getTime() - new Date(event.start).getTime()) / (1000 * 60)
      return duration >= 30
    })

    // Conversational mode: keep meetings/deadlines AND realistic work blocks; enforce a 25min floor
    // Ensure we preserve the assistant's anchors and expand around them: protect events that overlap template blocks
    const templateWindows = Array.isArray(scheduleTemplate) ? scheduleTemplate.map((b: any) => ({ start: new Date(b.start), end: new Date(b.end) })) : []
    const overlapsTemplate = (e: any) => templateWindows.some(w => !(new Date(e.end) <= w.start || new Date(e.start) >= w.end))
    const filteredByTypeAndDuration = plan.events.filter(event => keepEventByTypeAndDuration(event.title, event.start, event.end) || overlapsTemplate(event))
    let baseFiltered = conversational ? filteredByTypeAndDuration : filteredByDurationLegacy

    // Apply simple per-day cap early if conversational mode is on, to align with user preferences
    if (conversational) {
      baseFiltered = filterDrafts(
        baseFiltered.map(e => ({ title: e.title, start: e.start, end: e.end })),
        { planning: { eventCapPerDay: (preferences as any)?.eventCapPerDay || 4 } }
      ).map(e => baseFiltered.find(x => x.title === e.title && new Date(x.start).getTime() === new Date(e.start).getTime())!).filter(Boolean)
    }
    
    // Filter 2: Remove events on weekends unless explicitly work-related
    const filteredByWeekend = baseFiltered.filter(event => {
      const eventDate = new Date(event.start)
      const dayOfWeek = eventDate.getDay()
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
      
      if (!isWeekend) return true
      
      // Only keep weekend events if they're high priority or work-related
      const isWorkRelated = /\b(work|meeting|call|presentation|deadline|urgent|important)\b/i.test(event.title)
      const isHighPriority = event.confidence && event.confidence > 0.8
      
      return isWorkRelated || isHighPriority
    })
    
    // Filter 3: Remove events during typical non-work hours (before 7 AM, after 8 PM)
    const filteredByWorkHours = filteredByWeekend.filter(event => {
      const eventStart = new Date(event.start)
      const hour = eventStart.getHours()
      
      // Allow flexible work hours: 7 AM to 8 PM
      if (hour >= 7 && hour <= 20) return true
      
      // Only keep early/late events if they're explicitly time-sensitive
      const isTimeSensitive = /\b(urgent|deadline|important|critical|emergency)\b/i.test(event.title)
      return isTimeSensitive
    })
    
    // Filter 4: Prioritize by confidence and remove low-confidence events
    // Keep template-aligned items first
    const sortedByConfidence = filteredByWorkHours.sort((a, b) => {
      const aT = overlapsTemplate(a) ? 1 : 0
      const bT = overlapsTemplate(b) ? 1 : 0
      if (aT !== bT) return bT - aT
      return (b.confidence || 0) - (a.confidence || 0)
    })
    
    // Filter 5: Apply smart limits based on user's existing calendar density
    const existingEventsToday = existingEvents.filter(event => {
      const today = new Date()
      const eventDate = new Date(event.start)
      return eventDate.toDateString() === today.toDateString()
    })
    
    // Adaptive limits based on calendar density
    let maxEventsToday = 6 // Base limit
    if (existingEventsToday.length > 4) {
      maxEventsToday = 3 // Reduce if calendar already busy
    } else if (existingEventsToday.length < 2) {
      maxEventsToday = 8 // Allow more if calendar is light
    }
    
    // Apply daily limits while preserving high-priority events
    let limitedEvents = []
    const eventsByDay = new Map<string, typeof sortedByConfidence>()
    
    // Group events by day
    for (const event of sortedByConfidence) {
      const dayKey = new Date(event.start).toDateString()
      if (!eventsByDay.has(dayKey)) {
        eventsByDay.set(dayKey, [])
      }
      eventsByDay.get(dayKey)!.push(event)
    }
    
    // Apply limits per day
    const prefDailyCap = Math.max(1, (preferences as any)?.eventCapPerDay || 4)
    for (const [dayKey, dayEvents] of eventsByDay) {
      const isToday = dayKey === new Date().toDateString()
      // Cap per preferences; if today is very busy, respect the lower of pref cap and maxEventsToday
      const dailyLimit = isToday ? Math.min(prefDailyCap, maxEventsToday) : prefDailyCap
      
      // Always include high-confidence events first
      const highConfidence = dayEvents.filter(e => (e.confidence || 0) >= 0.7)
      const mediumConfidence = dayEvents.filter(e => (e.confidence || 0) >= 0.5 && (e.confidence || 0) < 0.7)
      const lowConfidence = dayEvents.filter(e => (e.confidence || 0) < 0.5)
      
      const selectedEvents = []
      
      // Add high-confidence events (up to limit)
      selectedEvents.push(...highConfidence.slice(0, dailyLimit))
      
      // Add medium-confidence events if space remains
      if (selectedEvents.length < dailyLimit) {
        const remaining = dailyLimit - selectedEvents.length
        selectedEvents.push(...mediumConfidence.slice(0, remaining))
      }
      
      // Only add low-confidence events if we have very few events
      if (selectedEvents.length < Math.floor(dailyLimit / 2)) {
        const remaining = dailyLimit - selectedEvents.length
        selectedEvents.push(...lowConfidence.slice(0, remaining))
      }
      
      limitedEvents.push(...selectedEvents)
    }
    
    // Additional gating: drop obvious promotional/marketing and vague CTA events
    const promoPattern = /(save up to|% off|sale|deal|offer|last chance|limited time|coupon|newsletter|mcafee|back-to-school|celebrate|gift card)/i
    const ctaPattern = /(webinar|register|sign up|user stud(y|ies)|paid study|haptic toolkit|spinning displays|amazon gift card|learn how to|the forecast|lab report|digest)/i
    limitedEvents = limitedEvents.filter(e => {
      const t = (e.title || '').toLowerCase()
      return !promoPattern.test(t) && !ctaPattern.test(t)
    })

    // Dedupe: merge very similar titles within 60 minutes
    try {
      const { default: stringSimilarity } = await import('string-similarity')
      function normTitle(s: string) {
        return (s || '')
          .toLowerCase()
          .replace(/\b(et|est|edt|pt|pst|pdt|ct|cst|cdt|mt|mst|mdt|am|pm)\b/g, ' ')
          .replace(/\b\d{1,2}(:\d{2})?\b/g, ' ')
          .replace(/\d+/g, ' ')
          .replace(/[^a-z ]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      }
      const deduped: typeof limitedEvents = []
      for (const e of limitedEvents.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))) {
        const dup = deduped.find(x => {
          const sim = stringSimilarity.compareTwoStrings(normTitle(x.title || ''), normTitle(e.title || ''))
          const close = Math.abs(new Date(x.start).getTime() - new Date(e.start).getTime()) <= 60 * 60 * 1000
          return close && sim >= 0.8
        })
        if (!dup) deduped.push(e)
      }
      limitedEvents = deduped
    } catch (err) {
      console.warn('Event dedupe failed (continuing without dedupe):', err)
    }

    console.log(`Applied selectivity filters: ${plan.events.length} → ${(conversational ? filteredByTypeAndDuration.length : filteredByDurationLegacy.length)} → ${filteredByWeekend.length} → ${filteredByWorkHours.length} → ${limitedEvents.length} final events (after gating+dedupe)`)    
    
    // 7. Apply hard limits to prevent event overgeneration (fallback)
    const MAX_EVENTS = 10 // Hard limit on number of events (increased since we have better filtering now)
    
    if (limitedEvents.length > MAX_EVENTS) {
      console.log(`⚠️ Event count ${limitedEvents.length} exceeds limit ${MAX_EVENTS}, applying final cap...`)
      
      // Sort by priority and confidence, keep top events
      const finalEvents = limitedEvents
        .sort((a, b) => {
          // Prioritize by confidence first, then by original task priority
          const confidenceDiff = (b.confidence || 0) - (a.confidence || 0)
          if (Math.abs(confidenceDiff) > 0.1) return confidenceDiff
          
          // If confidence is similar, prefer higher priority tasks
          const aTask = enhancedTasks.find(t => t.id === a.taskId)
          const bTask = enhancedTasks.find(t => t.id === b.taskId)
          return (bTask?.priority || 0) - (aTask?.priority || 0)
        })
        .slice(0, MAX_EVENTS)
      
      console.log(`✂️ Filtered down to ${finalEvents.length} highest-priority events`)
      limitedEvents = finalEvents
    }
    
    // Update the plan with limited events
    const filteredPlan = {
      ...plan,
      events: limitedEvents
    }

    // Prevent duplicate drafts for the same user/title/start time within 24h window
    async function upsertEventDraft(e: any) {
      if (isLocalMode) return null
      const windowStart = new Date(new Date(e.start).getTime() - 12 * 60 * 60 * 1000)
      const windowEnd = new Date(new Date(e.start).getTime() + 12 * 60 * 60 * 1000)
      const existing = await prisma.eventDraft.findFirst({
        where: {
          userId,
          title: e.title,
          startsAt: { gte: windowStart, lte: windowEnd }
        }
      })
      if (existing) return existing
      const rationale = Array.isArray(e.rationale) ? e.rationale.join('; ') : (e.rationale || 'AI-generated scheduling')
      return prisma.eventDraft.create({
        data: {
          userId,
          taskId: e.taskId || null,
          title: e.title,
          startsAt: e.start,
          endsAt: e.end,
          rationale,
          confidence: e.confidence
        }
      })
    }

    // 7. Create EventDraft records for the generated events (or return directly in local mode)
    let eventDrafts = []
    
    if (isLocalMode) {
      // In local mode, return event drafts directly without saving to database
      console.log('🏠 Local mode: Returning event drafts directly')
      eventDrafts = limitedEvents.map((event) => {
        const rationale = Array.isArray(event.rationale) ? event.rationale.join('; ') : (event.rationale || 'AI-generated scheduling')
        
        return {
          id: `local-draft-${Date.now()}-${Math.random()}`,
          userId: 'local-user',
          taskId: event.taskId || null,
          title: event.title,
          startsAt: event.start,
          endsAt: event.end,
          rationale,
          confidence: event.confidence,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      })
    } else {
      // Authenticated mode: Save to database
      eventDrafts = await Promise.all(limitedEvents.map(upsertEventDraft))
      eventDrafts = eventDrafts.filter(Boolean) as any
    }

    // Post-generation temporal clamp (safety net): enforce horizon and drop past
    try {
      const tz = userTimeZone
      const startBound = new Date(((plannerPrefs?.startDate as any) || toISODateLocal(new Date(), tz)) + 'T00:00:00')
      const endBound   = new Date(((plannerPrefs as any)?.endDate || toISODateLocal(new Date(Date.now()+7*24*3600*1000), tz)) + 'T23:59:59')
      const nowLocal   = new Date()
      eventDrafts = (eventDrafts as any[]).filter(d => {
        const s = new Date((d.start as any) || (d.startsAt as any))
        return Number.isFinite(s.getTime()) && s >= startBound && s <= endBound && s >= nowLocal
      })
    } catch {}

    // 8. Generate AI insights about the generated plan
    let planInsights = null
    try {
      const insightsCompletion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a scheduling expert providing insights about an AI-generated calendar plan.
            
            Analyze the generated schedule and provide:
            - Key scheduling decisions and rationale
            - Potential conflicts or concerns to watch for
            - Optimization suggestions
            - Best practices being followed
            
            Be concise and actionable.`
          },
          {
            role: 'user',
            content: `Generated schedule summary:
            - ${limitedEvents.length} events planned (filtered from ${plan.events.length} initial events)
            - ${plan.unscheduledTaskIds.length} tasks couldn't be scheduled
            - Time range: ${limitedEvents.length > 0 ? `${limitedEvents[0]?.start.toLocaleDateString()} to ${limitedEvents[limitedEvents.length - 1]?.end.toLocaleDateString()}` : 'No events'}
            - Filtering applied: ${plan.events.length > limitedEvents.length ? 'Yes, prioritized by importance' : 'No filtering needed'}
            
            Top Events: ${limitedEvents.slice(0, 3).map(e => `${e.title} (${e.start.toLocaleString()} - ${e.end.toLocaleString()})`).join(', ')}`
          }
        ],
        temperature: 0.4,
        max_tokens: 300
      })
      
      planInsights = insightsCompletion.choices?.[0]?.message?.content
    } catch (insightsError) {
      console.warn('Failed to generate plan insights:', insightsError)
    }

    return NextResponse.json({
      success: true,
      eventDrafts,
      plan: {
        events: limitedEvents,
        dailyPlan: filteredPlan.dailyPlan,
        weeklyRollup: filteredPlan.weeklyRollup,
        unscheduledTasks: plan.unscheduledTaskIds
      },
      insights: planInsights,
      metadata: {
        totalTasks: tasks.length,
        filteredTasks: filteredTasks.length,
        originalEvents: plan.events.length,
        scheduledEvents: limitedEvents.length,
        unscheduledTasks: plan.unscheduledTaskIds.length,
        googleCalendarEvents: calendarBusy.length,
        timeRange: limitedEvents.length > 0 ? {
          start: limitedEvents[0]?.start,
          end: limitedEvents[limitedEvents.length - 1]?.end
        } : null,
        isLocalMode,
        eventsLimited: plan.events.length > limitedEvents.length,
        message: isLocalMode 
          ? `Created ${limitedEvents.length} focused calendar events locally. Sign in with Google to sync to your calendar.`
          : `Created ${limitedEvents.length} events and ready to sync to Google Calendar.`
      }
    })

  } catch (error) {
    console.error('Event generation error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to generate events',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Get existing event drafts
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  
  const userId = (session.user as any).id as string
  
  try {
    const eventDrafts = await prisma.eventDraft.findMany({
      where: { userId },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            description: true,
            source: true,
            tags: true
          }
        }
      },
      orderBy: { startsAt: 'asc' }
    })

    return NextResponse.json({
      success: true,
      eventDrafts
    })
  } catch (error) {
    console.error('Failed to fetch event drafts:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch event drafts'
    }, { status: 500 })
  }
}
