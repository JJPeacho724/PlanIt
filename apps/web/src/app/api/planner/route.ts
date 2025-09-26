import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { openai } from '@/lib/clients/openai'
import { COMPREHENSIVE_PLANNING_KNOWLEDGE } from '@acme/ai'
import { prisma } from '@/lib/clients/prisma'
import { personalizedLLM, buildPlannerContext } from '@/lib/llm'
import { interpretTemporal } from '@/lib/planning/temporal'
import { expandOccurrences } from '@/lib/planning/rrule'
import { slotOccurrences } from '@/lib/planning/slotter'
import { selectVariant, recordSignal } from '@/lib/bandit'
import { setConversationContext } from '@/lib/redis'
import { generateDrafts, fromEventPlanV2 } from '@/utils/events/generateDrafts'
import type { EventPlanV2 } from '@/lib/types/planning'
import { fetchEvidence } from '@/server/evidence'
import { routeIntent, isScheduleAllowed } from '@/utils/ai/IntentRouter'
import { buildAnswerMap, maybeClarifier } from '@/utils/ai/RelevanceGuard'
import type { EventPipelinePayload } from '@/utils/events/types'
import type OpenAI from 'openai'

type PlannerPlan = {
  title: string
  summary: string
  reply: string
  metadata?: any
  eventDrafts?: any[]
  eventsPayload?: any
  eventsText?: any
}

// Simple timeout helper to prevent long-hanging external calls
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms)
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (err) => { clearTimeout(timer); reject(err) }
    )
  })
}

// AI-powered planner using comprehensive knowledge
async function aiPlanner(message: string): Promise<PlannerPlan> {
  try {
    const completion = await withTimeout(openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `${COMPREHENSIVE_PLANNING_KNOWLEDGE}

You are now helping a user with their planning needs. Apply your comprehensive knowledge to:
1. Understand their specific situation and goals
2. Suggest appropriate planning frameworks and strategies
3. Help them avoid common pitfalls
4. Provide actionable advice and next steps
5. Break down complex goals into manageable tasks
6. Offer personalized recommendations based on their context

FORMATTING REQUIREMENTS:
- Use markdown formatting for better readability
- Use headings (##) for main sections
- Use bullet points (-) for lists and action items
- Use **bold** for emphasis on key points
- Keep paragraphs short and scannable
- Use numbered lists for step-by-step processes
- Add line breaks between sections for better spacing

HARD RULES:
- Stay strictly relevant to the user's request.
- Do NOT recommend promotions, webinars, generic "sign up" CTAs, or "user studies" unless the user explicitly asks for them with a concrete time.
- Avoid external marketing content (e.g., "Register for webinar", "Earn Amazon gift card", "paid study").
- For career goals like becoming a Product Manager, focus on concrete actions (portfolio/case studies, targeted outreach, practice drills, interview prep, time-blocked focus) and avoid unrelated events.

Be encouraging, practical, and evidence-based in your responses. Format your response like ChatGPT would - well-structured, easy to read, and visually appealing.`
        },
        {
          role: 'user',
          content: message
        }
      ],
      temperature: 0.7,
      max_tokens: 1000,
    }), 10000)

    const reply = completion.choices?.[0]?.message?.content?.trim() || 'I understand. Let me help you plan that.'
    
    return {
      title: `AI Planning Response`,
      summary: `Generated comprehensive planning guidance for: ${message}`,
      reply: reply
    }
  } catch (error) {
    console.error('OpenAI API error:', error)
    // Fallback to basic response if AI fails
    return {
      title: `Plan: ${message}`,
      summary: `Generated a basic plan for: ${message}`,
      reply: `## I understand! 💡

You'd like help with: **"${message}"**

Let me break this down into actionable steps:

1. **Clarify your specific goals** - What exactly do you want to achieve?
2. **Set a timeline** - When would you like to complete this?
3. **Identify resources** - What do you need to make this happen?
4. **Create milestones** - Break it into smaller, manageable tasks
5. **Track progress** - Monitor your advancement regularly

**Next Steps:**
- Could you provide more details about your specific situation?
- What's your timeline for this goal?
- Are there any constraints I should know about?

I'm here to help you create a detailed, actionable plan! 🎯`
    }
  }
}

// Personalized learning-enabled planner with timeout
async function personalizedPlanner(message: string, userId: string, variantKey?: string): Promise<PlannerPlan> {
  try {
    console.log('🧠 Starting personalized planner for user:', userId)
    
    // Set a timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Personalized planner timeout')), 10000)
    })
    
    const plannerPromise = async () => {
      // Build comprehensive context for the user
      console.log('📊 Building planner context...')
      const context = await buildPlannerContext(userId, message)
      console.log('✅ Context built, generating plan...')
      
      // Generate personalized plan
      const result = await personalizedLLM.generatePersonalizedPlan(message, context)
      console.log('✅ Plan generated')
      
      // Try to store conversation context (non-blocking)
      try {
        await setConversationContext(userId, {
          messages: [
            { role: 'user', content: message },
            { role: 'assistant', content: result.reply }
          ],
          planningState: {
            confidence: result.confidence,
            usedSources: result.usedSources,
            variant: variantKey
          },
          lastPlanRequest: message
        })
      } catch (redisError) {
        console.log('Redis storage failed, continuing without it')
      }
      
      return {
        title: `Personalized Plan (${Math.round(result.confidence * 100)}% confidence)`,
        summary: `Generated personalized plan using ${result.usedSources.join(', ')}`,
        reply: result.reply,
        metadata: {
          confidence: result.confidence,
          usedSources: result.usedSources,
          variant: variantKey,
          personalized: true
        }
      }
    }
    
    // Race between planner and timeout
    return await Promise.race([plannerPromise(), timeoutPromise]) as PlannerPlan
  } catch (error) {
    console.error('Personalized planner error:', error)
    console.log('🔄 Falling back to basic planner')
    // Fallback to basic planner
    const fallback = await aiPlanner(message)
    return {
      ...fallback,
      metadata: {
        ...(fallback.metadata || {}),
        variant: variantKey,
        personalized: false,
        fallback: true
      }
    }
  }
}

// Email-context-aware planner
async function emailContextPlanner(message: string, req: NextRequest): Promise<PlannerPlan> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return await aiPlanner(message) // Fallback to general planner
    }
    
    const userId = (session.user as any).id as string
    
    // Get last 5 days of email context
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
    const emailIngests = await prisma.messageIngest.findMany({
      where: {
        userId,
        source: 'EMAIL',
        receivedAt: { gte: fiveDaysAgo }
      },
      orderBy: { receivedAt: 'desc' },
      take: 20 // Limit for context
    })

    // Get current tasks for context
    const tasks = await prisma.task.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10
    })

    // Prepare email context
    const emailContext = emailIngests.map(email => {
      const metadata = email.metadata as any
      return {
        date: email.receivedAt.toISOString().split('T')[0],
        from: metadata?.from || 'Unknown',
        subject: metadata?.subject || 'No subject',
        bodySnippet: metadata?.bodyText?.slice(0, 200) || 'No content',
        receivedAt: email.receivedAt.toISOString()
      }
    })

    // Route intent: schedule allowed only for schedule_request or mixed
    const { routeIntent, isScheduleAllowed } = await import('@/utils/ai/IntentRouter')
    const routed = routeIntent(message)
    const requestsEventCreation = isScheduleAllowed(routed.intent)
    
    const completion = await withTimeout(openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `${COMPREHENSIVE_PLANNING_KNOWLEDGE}

You are an AI day planning assistant with access to the user's recent email context and tasks.

Your goal is to analyze their emails and provide intelligent, actionable day planning advice.

IMPORTANT: Use the email context to understand:
- Meeting requests and calendar invites
- Deadlines and time-sensitive items  
- Project updates and collaboration needs
- Travel or location requirements
- Email urgency patterns and sender importance

Provide practical day planning advice including:
1. Key priorities based on email context
2. Time blocking suggestions
3. Meeting scheduling recommendations
4. Action items derived from emails
5. Energy management tips

${requestsEventCreation ? `
SPECIAL INSTRUCTION: The user is asking for event creation/scheduling. After providing your advice, you should also suggest specific calendar events that could be created based on the email context and tasks. Think about:
- Time blocks for important tasks
- Follow-ups needed based on emails
- Preparation time for meetings mentioned in emails
- Dedicated time for responding to urgent emails
- Buffer time for unexpected items

However, do NOT include actual event creation in your response - just the planning advice. The system will handle event creation separately.
` : ''}

FORMATTING REQUIREMENTS:
- Use markdown formatting for better readability
- Use headings (##) for main sections
- Use bullet points (-) for lists and action items
- Use **bold** for emphasis on key points
- Keep paragraphs short and scannable
- Use numbered lists for step-by-step processes

Be specific about the emails you're referencing and how they inform your planning advice.`
        },
        {
          role: 'user',
          content: `Planning Request: "${message}"

RECENT EMAIL CONTEXT (last 5 days):
${emailContext.map(email => 
  `• **${email.subject}** from ${email.from} (${email.date})\n  ${email.bodySnippet}`
).join('\n\n')}

CURRENT TASKS:
${tasks.map(task => `• ${task.title}${task.dueAt ? ` (due: ${task.dueAt.toLocaleDateString()})` : ''}`).join('\n')}

Please analyze this email context and provide specific day planning advice for: "${message}"`
        }
      ],
      temperature: 0.7,
      max_tokens: 1500,
    }), 12000)

    let reply = completion.choices?.[0]?.message?.content?.trim() || 'I understand. Let me help you plan that based on your emails.'
    
    // If user requested event creation, generate event drafts
    let eventDrafts: any[] = []
    let pipelinePayload: EventPipelinePayload | null = null
    let pipelineText: string | null = null
    if (requestsEventCreation) {
      try {
        const eventGenResponse = await fetch(new URL('/api/events/generate', req.nextUrl.origin), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': req.headers.get('cookie') || ''
          },
          body: JSON.stringify({
            includeGoogleData: true,
            preferences: {
              breakMinutes: 15,
              minBlockMinutes: 30,
              resolveConflicts: 'push'
            }
          })
        })
        
        if (eventGenResponse.ok) {
          const eventData = await eventGenResponse.json()
          eventDrafts = eventData.eventDrafts || []
        }
      } catch (error) {
        console.warn('Failed to generate events during planning:', error)
      }

      // Build deterministic pipeline from recent emails
      try {
        const rawCandidates = emailContext.map(e => ({
          title: e.subject,
          snippet: e.bodySnippet,
          source: 'email' as const,
          sourceRef: undefined
        }))
        // Pull user preferences for gating and caps
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { timeZone: true, preferences: true } })
        const userTZ = user?.timeZone || 'America/New_York'
        const p = (user?.preferences as any) || {}
        const { payload, text } = generateDrafts(rawCandidates, {
          userTZ: userTZ,
          perDayLimit: Math.max(1, p?.planning?.eventCapPerDay || 3),
          minGapMinutes: Math.max(10, p?.planning?.minGapMinutes || 10),
          preferences: p?.gating || {}
        })
        pipelinePayload = payload
        pipelineText = text

        if (payload.events.length > 0) {
          // Do not replace the main reply here; UI can render events separately
        } else {
          const suggPreview = payload.suggestions.slice(0, 2).map(s => `"${s.title} – ${s.reason}"`).join(', ')
          reply = `No high-confidence drafts found. Here are ${payload.suggestions.length} suggestions…${suggPreview ? `\n\n${suggPreview}` : ''}`
        }
      } catch (err) {
        console.warn('Pipeline generation failed:', err)
      }
    }
    
    return {
      title: `Email-Based Day Planning`,
      summary: `Generated day planning advice based on recent emails for: ${message}`,
      reply: reply,
      eventDrafts: eventDrafts,
      eventsPayload: pipelinePayload,
      eventsText: pipelineText
    }
  } catch (error) {
    console.error('Email context planner error:', error)
    // Fallback to general planner if email context fails
    return await aiPlanner(message)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const body = await req.json()
    const message = body?.message || 'No message provided'
    const { autoGenerateEvents = false, includeGoogleData = true, goalTemplateOverride, goalLabelOverride, timeWindowOverride, allowTemplateTimeline = false } = body
    
    console.log('Planner API called:', { 
      message, 
      autoGenerateEvents, 
      includeGoogleData, 
      authenticated: !!session?.user?.email,
      userId: session?.user ? (session.user as any).id : null
    })
    
    // Route intent first
    const routed = routeIntent(message)
    // Only treat as email-based when the user explicitly references email/inbox
    const isEmailBasedRequest = /\b(email|emails|inbox|from (?:my )?emails?)\b/i.test(message)
    const isCareerPMGoal = /\b(get into|become|break into|transition to|pivot to)\b[\s\S]*\b(product management|product manager|pm)\b/i.test(message)
    
    // Note: some signals referenced below (wantsLongHorizon, isGoalRequest, canSchedule)
    // are computed later. Log only what is already available to avoid ReferenceErrors.
    console.log('Planning routing (pre-compute):', {
      isEmailBasedRequest,
      autoGenerateEvents,
      // user prefs are computed below
      authenticated: !!session?.user?.email,
      routedIntent: routed.intent
    })
    
    // Load user preferences
    const userIdForPrefs = session?.user ? (session.user as any).id as string : undefined
    const userPrefs = userIdForPrefs ? await prisma.user.findUnique({ where: { id: userIdForPrefs }, select: { timeZone: true, preferences: true } }) : null
    const tz = userPrefs?.timeZone || 'America/Chicago'
    const prefs = (userPrefs?.preferences as any) || {}

    // Check user preference for auto-generating events (respect user's choice)
    const userAutoGeneratePref = prefs?.planning?.autoGenerateEvents
    // Generate events automatically when:
    // - the user asks to schedule (schedule/mixed intent), or
    // - explicitly requested via flag and not disabled by prefs, or
    // - the message is a clear goal request (e.g., marathon, investment banking, backflip)
    const goalRequestCue = /(become|get into|learn|build|start|launch|write|publish|find a job|get a job|change careers|switch careers|prepare for|pass|finish|complete|lose weight|get fit|train for|run a|marathon|portfolio|case study|investment banking|backflip)/i
    const isGoalishRequest = goalRequestCue.test(message)
    const shouldAutoGenerateEvents = (isScheduleAllowed(routed.intent)) || (autoGenerateEvents && (userAutoGeneratePref !== false)) || isGoalishRequest

    // Now that we have prefs and auth, we can safely extend logging
    console.log('Planning routing (post-compute):', {
      isEmailBasedRequest,
      autoGenerateEvents,
      userAutoGeneratePref,
      shouldAutoGenerateEvents,
      authenticated: !!session?.user?.email
    })

    // Check if user is asking to create sample tasks
    const wantsCreateSampleTask = /\b(create.*sample.*task|add.*example.*task|make.*demo.*task|need.*tasks?)\b/i.test(message)
    
    // If user wants to create sample tasks, do that first
    if (session?.user?.email && wantsCreateSampleTask) {
      try {
        const userId = (session.user as any).id as string
        const sampleTasks = [
          { title: 'Review morning emails', description: 'Check and respond to important emails', priority: 2, effortMinutes: 30 },
          { title: 'Team standup meeting', description: 'Daily team sync and updates', priority: 3, effortMinutes: 30 },
          { title: 'Work on quarterly report', description: 'Continue drafting Q4 report', priority: 1, effortMinutes: 120 },
          { title: 'Call with client', description: 'Scheduled client check-in call', priority: 3, effortMinutes: 60 },
          { title: 'Code review', description: 'Review pending pull requests', priority: 2, effortMinutes: 45 }
        ]
        
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
        
        return NextResponse.json({
          success: true,
          reply: `✅ Sample tasks added. Ask me to schedule time for any of them, and I’ll propose drafts you can review and add.`,
          eventDrafts: []
        })
      } catch (error) {
        console.error('Failed to create sample tasks:', error)
        return NextResponse.json({
          success: false,
          reply: '❌ **Error Creating Sample Tasks**\n\nSomething went wrong while creating sample tasks. Please try again.',
          eventDrafts: []
        })
      }
    }
    
    let plan: PlannerPlan
    let planV2: EventPlanV2 | null = null
    let planV2Drafts: any[] = []
    let selectedVariant: string | undefined
    
    if (session?.user?.email) {
      const userId = (session.user as any).id as string
      
      // Select planner variant using bandit policy
      selectedVariant = await selectVariant(userId, 'planner:variant')
      
      console.log('🎯 Selected planner variant:', selectedVariant, 'for user:', userId)
      
      // Route to appropriate planner based on variant and request type
      // For now, use basic planner for reliability, add personalization gradually
      if (isEmailBasedRequest && (selectedVariant === 'email' || selectedVariant === 'B')) {
        // Use email-context planning
        console.log('📧 Using email-context planner')
        plan = await emailContextPlanner(message, req)
      } else if (selectedVariant === 'personalized' || selectedVariant === 'A') {
        // Try personalized learning planner
        console.log('🧠 Attempting personalized planner')
        plan = await personalizedPlanner(message, userId, selectedVariant)
      } else {
        // Use basic AI planner (variant C or fallback)
        console.log('🤖 Using basic AI planner')
        plan = await aiPlanner(message)
        plan.metadata = { ...(plan.metadata || {}), variant: selectedVariant }
      }
      
      // Record signal that plan was generated (non-fatal)
      try {
        await recordSignal(
          userId,
          'plan_generated',
          JSON.stringify({
            message: message.slice(0, 200),
            variant: selectedVariant,
            timestamp: new Date().toISOString()
          }),
          0.1, // Small positive signal for generating a plan
          `planner:variant:${selectedVariant}`,
          undefined, // Success will be determined by user feedback
          {
            planType: plan.metadata?.personalized ? 'personalized' : 'basic',
            confidence: plan.metadata?.confidence
          }
        )
      } catch (signalErr) {
        console.warn('recordSignal failed (continuing):', signalErr)
      }
    } else {
      // Use general planning for unauthenticated users
      plan = await aiPlanner(message)
    }
    
    // Attempt strict EventPlanV2 generation with evidence and free/busy for specificity + sync
    try {
      const needsEvidence = /pm|product manager|investment banking|data science|portfolio|interview/i.test(message)
      let evidence: any[] = []
      if (needsEvidence) {
        const queries = [
          'core PM frameworks one-pager',
          'PRD templates best practices',
          'PM interview product sense practice',
        ]
        const chunks = await Promise.all(queries.map(q => fetchEvidence(q)))
        evidence = chunks.flat()
      }

      // Free/busy (next 7 days)
      let freeBusy: any = []
      if (session?.user?.email) {
        const now = new Date()
        const seven = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
        const busy = await prisma.calendarBusy.findMany({
          where: { userId: (session.user as any).id as string, startsAt: { gte: now }, endsAt: { lte: seven } },
          orderBy: { startsAt: 'asc' }
        })
        freeBusy = busy.map((b: any) => ({ start: b.startsAt, end: b.endsAt, title: b.title || '' }))
      }

      const profile = { tz, planning: { minGapMinutes: Math.max(10, prefs?.planning?.minGapMinutes || 10), eventCapPerDay: Math.max(1, prefs?.planning?.eventCapPerDay || 4) } }

      const SYSTEM = `
You are a planning engine. Produce ONLY JSON matching the EventPlanV2 schema.
Rules:
- Every action MUST have: specific title (verb + concrete noun), summary, deliverable with acceptanceCriteria, 1–3 resources with title+url+why, checklist, realistic start/end, tags.
- Prefer 25/50/90-min blocks for work; add a 5–10 min buffer between blocks.
- Never output vague titles like "Daily Practice" or "Deep dive".
- If goal is broad ("get into PM/IB/data science"), include at least one portfolio/actionable deliverable and one networking action with named targets (if provided) or concrete search strategy.
- specificityScore: 0..1 based on nouns, artifacts, and external references; reject below 0.6 upstream.
- confidence: 0..1 based on source quality and feasibility this week.
- Use user's timezone windows and avoid conflicts (free/busy provided).

CRITICAL DATE FORMATTING RULES:
- startISO and endISO MUST be valid ISO 8601 strings in the user's timezone
- Format: "YYYY-MM-DDTHH:mm:ss.sssZ" for UTC or "YYYY-MM-DDTHH:mm:ss.sss±HH:mm" for timezone
- All dates must be in the future (not today or past)
- Use the user's timezone provided in UserTZ field
- If scheduling for "today", use tomorrow instead
- If scheduling for "this week", use specific days (Mon-Fri) next week
- Ensure endISO is after startISO with reasonable duration (25-90 minutes)

Return ONLY valid JSON (no prose).
`

      // Optional: normalize ANY user message into a schedulable goal when conversational mode is on
      let normalized: { goal: string; durationMin?: number | null; cadence?: 'once' | 'daily' | 'weekly' | 'custom'; timeframe?: 'today' | 'this week' | 'next 2 weeks'; assumptions?: string[] } = { goal: message, durationMin: 60, cadence: 'once', timeframe: 'this week', assumptions: [] }
      try {
        if (process.env.PLANNER_CONVERSATIONAL === '1') {
          const normalizeRes = await withTimeout(openai.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0.2,
            max_tokens: 300,
            messages: [
              { role: 'system', content: `Extract a concrete, schedulable goal from the user message. Return JSON: {"goal":string,"durationMin":number|null,"cadence":"once|daily|weekly|custom","timeframe":"today|this week|next 2 weeks","assumptions":[string,...]}` },
              { role: 'user', content: message }
            ]
          }), 6000)
          const content = normalizeRes.choices?.[0]?.message?.content || '{}'
          try { Object.assign(normalized, JSON.parse(content)) } catch {}
        }
      } catch {}

      const USER = (request: string, fb: any, prof: any, ev: any) => `
Goal: ${process.env.PLANNER_CONVERSATIONAL === '1' ? normalized.goal : request}
UserTZ: ${prof?.tz}
Current Time: ${new Date().toISOString()}
Current Time in User TZ: ${new Date().toLocaleString('en-US', { timeZone: prof?.tz })}
FreeBusy: ${JSON.stringify(fb)}
EvidencePool: ${JSON.stringify(ev).slice(0, 4000)}
Constraints:
- Fit into open slots; respect minGapMinutes=${prof?.planning?.minGapMinutes ?? 10}
- Cap per day = ${Math.max(1, prof?.planning?.eventCapPerDay ?? 4)}
- All events must be scheduled in the future (after current time)
- Use proper ISO 8601 format with timezone information
- Schedule events during reasonable hours (8 AM - 8 PM in user's timezone)
Output: EventPlanV2 JSON
`

      try {
        const completion = await withTimeout(openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: USER(message, freeBusy, profile, evidence) }
          ],
          temperature: 0.6,
          max_tokens: 1100
        }), 25000)

        const completionText = completion.choices?.[0]?.message?.content?.trim()
        if (completionText && completionText.startsWith('{')) {
          try {
            const parsed: EventPlanV2 = JSON.parse(completionText)
            if (parsed && Array.isArray(parsed.actions)) {
              // Filter out CTA-like actions (webinars, generic sign-ups, user studies)
              const isUndesiredCTA = (t: string) => /(webinar|register|sign up|user stud(y|ies)|paid study|haptic toolkit|spinning displays|amazon gift card)/i.test(t || '')
              const sanitized = { ...parsed, actions: parsed.actions.filter((a: any) => !isUndesiredCTA(String(a?.title || ''))) }
              planV2 = sanitized
              const built = fromEventPlanV2(sanitized, tz)
              planV2Drafts = built.drafts.filter((d: any) => !isUndesiredCTA(String(d?.title || ''))).map((d: any) => {
                // Additional validation and correction
                const startDate = d.startsAt instanceof Date ? d.startsAt : new Date(d.startsAt)
                const endDate = d.endsAt instanceof Date ? d.endsAt : new Date(d.endsAt)
                const now = new Date()
                
                // Ensure dates are in the future
                const finalStart = startDate <= now ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : startDate
                const finalEnd = endDate <= finalStart ? new Date(finalStart.getTime() + 60 * 60 * 1000) : endDate
                
                return {
                  id: d.id,
                  title: d.title,
                  startsAt: finalStart.toISOString(),
                  endsAt: finalEnd.toISOString(),
                  rationale: d.rationale,
                  confidence: d.confidence,
                  meta: d.meta
                }
              })
            }
          } catch (e) {
            console.warn('Failed to parse EventPlanV2 JSON:', e)
          }
        }
      } catch (primaryErr) {
        console.warn('EventPlanV2 primary attempt failed, retrying with simplified prompt:', primaryErr)
        try {
          const completion2 = await withTimeout(openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: SYSTEM },
              { role: 'user', content: USER(message, freeBusy, profile, /* omit evidence */ []) }
            ],
            temperature: 0.5,
            max_tokens: 900
          }), 12000)

          const completionText2 = completion2.choices?.[0]?.message?.content?.trim()
          if (completionText2 && completionText2.startsWith('{')) {
            try {
              const parsed2: EventPlanV2 = JSON.parse(completionText2)
              if (parsed2 && Array.isArray(parsed2.actions)) {
                const isUndesiredCTA = (t: string) => /(webinar|register|sign up|user stud(y|ies)|paid study|haptic toolkit|spinning displays|amazon gift card)/i.test(t || '')
                const sanitized2 = { ...parsed2, actions: parsed2.actions.filter((a: any) => !isUndesiredCTA(String(a?.title || ''))) }
                planV2 = sanitized2
                const built2 = fromEventPlanV2(sanitized2, tz)
                planV2Drafts = built2.drafts.filter((d: any) => !isUndesiredCTA(String(d?.title || ''))).map((d: any) => {
                  // Additional validation and correction
                  const startDate = d.startsAt instanceof Date ? d.startsAt : new Date(d.startsAt)
                  const endDate = d.endsAt instanceof Date ? d.endsAt : new Date(d.endsAt)
                  const now = new Date()
                  
                  // Ensure dates are in the future
                  const finalStart = startDate <= now ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : startDate
                  const finalEnd = endDate <= finalStart ? new Date(finalStart.getTime() + 60 * 60 * 1000) : endDate
                  
                  return {
                    id: d.id,
                    title: d.title,
                    startsAt: finalStart.toISOString(),
                    endsAt: finalEnd.toISOString(),
                    rationale: d.rationale,
                    confidence: d.confidence,
                    meta: d.meta
                  }
                })
              }
            } catch (e2) {
              console.warn('Failed to parse simplified EventPlanV2 JSON:', e2)
            }
          }
        } catch (secondaryErr) {
          console.warn('EventPlanV2 second attempt failed:', secondaryErr)
        }
      }
    } catch (e) {
      console.warn('EventPlanV2 generation failed:', e)
    }

    // Daily expansion for messages like "every day this week" when conversational mode is on
    try {
      if (process.env.PLANNER_CONVERSATIONAL === '1') {
        const wantsDaily = /\b(every ?day|each day|daily)\b/i.test(message)
        const baseDuration = 60
        if (wantsDaily && session?.user?.email) {
          const userId = (session.user as any).id as string
          const now = new Date()
          const startOfWeek = new Date(now)
          const day = now.getDay() // 0=Sun
          const diffToMonday = (day + 6) % 7
          startOfWeek.setDate(now.getDate() - diffToMonday)
          startOfWeek.setHours(0,0,0,0)
          const days = Array.from({ length: 7 }, (_, i) => new Date(startOfWeek.getTime() + i * 24 * 60 * 60 * 1000))
          // load free/busy for the week
          const busy = await prisma.calendarBusy.findMany({
            where: { userId, startsAt: { gte: startOfWeek }, endsAt: { lte: new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000) } },
            orderBy: { startsAt: 'asc' }
          })
          function findSlotOnDay(dayDate: Date, minutes: number): { start: Date; end: Date } | null {
            const dayStart = new Date(dayDate); dayStart.setHours(8,0,0,0)
            const dayEnd = new Date(dayDate); dayEnd.setHours(20,0,0,0)
            const dayBusy = busy.filter(b => new Date(b.startsAt).toDateString() === dayDate.toDateString())
            let cursor = new Date(dayStart)
            for (const b of dayBusy) {
              const bStart = new Date(b.startsAt)
              const bEnd = new Date(b.endsAt)
              if (bStart.getTime() - cursor.getTime() >= minutes * 60000) {
                const end = new Date(cursor.getTime() + minutes * 60000)
                if (end <= bStart) return { start: cursor, end }
              }
              if (cursor < bEnd) cursor = new Date(bEnd.getTime() + 10 * 60000) // 10m buffer
            }
            if (dayEnd.getTime() - cursor.getTime() >= minutes * 60000) {
              const end = new Date(cursor.getTime() + minutes * 60000)
              if (end <= dayEnd) return { start: cursor, end }
            }
            return null
          }
          const dailyDrafts: any[] = []
          for (const d of days) {
            const slot = findSlotOnDay(d, baseDuration)
            if (slot) {
              dailyDrafts.push(prisma.eventDraft.create({
                data: {
                  userId,
                  taskId: null,
                  title: 'Daily practice',
                  startsAt: slot.start,
                  endsAt: slot.end,
                  rationale: 'Daily block from user request',
                  confidence: 0.9
                }
              }))
            }
          }
          if (dailyDrafts.length > 0) {
        const created = await Promise.all(dailyDrafts)
        plan.eventDrafts = [...(plan.eventDrafts || []), ...created]
          }
        }
      }
    } catch (dailyErr) {
      console.warn('Daily expansion failed (continuing):', dailyErr)
    }

    // Hoist variables used in later sections
    let replyParsedDrafts: any[] = []
    let usiDrafts: any[] = []

    // If event generation is requested and allowed by user preferences, trigger it (local mode if not authenticated)
    // If the assistant reply already includes Proposed blocks, prefer using those rather than invoking the generator to avoid mismatches.
    let eventGeneration = null
    if (shouldAutoGenerateEvents) {
      try {
        const userId = session?.user ? (session.user as any).id as string : 'local-user'
        const isAuthenticated = !!session?.user?.email

        console.log('🎯 Auto-generating events:', { userId, isAuthenticated, localMode: !isAuthenticated, userPref: userAutoGeneratePref })

        // Parse Proposed blocks directly from the assistant reply for alignment
        let proposedForGen: Array<{ title: string; start: string | Date; end: string | Date }> = []
        try {
          const { parseProposedFromReply } = await import('@/utils/events/parseProposedFromReply')
          const { resolveHorizon } = await import('@/lib/planning/temporal')
          // Anchor parsing to the interpreted horizon start to avoid past/old-year dates
          const horizon = resolveHorizon(message, tz)
          const refDate = new Date(horizon.startDate + 'T00:00:00')
          let proposed = parseProposedFromReply(plan.reply || '', tz, refDate)
          // Improve specificity: map generic titles to weekday-specific ones if present in reply
          try {
            const map: Record<number, string> = (() => {
              const m: Record<number, string> = {}
              const lines = (plan.reply || '').split(/\r?\n/)
              const idx: Record<string, number> = { sunday:0, monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6 }
              for (const raw of lines) {
                const s = raw.trim()
                const mm = s.match(/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s*[:\-]\s*(.+)$/i)
                if (mm) {
                  const dow = idx[mm[1].toLowerCase()]
                  const title = (mm[2] || '').trim()
                  if (typeof dow === 'number' && title) m[dow] = title
                }
              }
              return m
            })()
            const tzForDow = tz
            const dowOf = (d: Date) => {
              try { return new Intl.DateTimeFormat('en-US', { timeZone: tzForDow, weekday: 'short' }).format(d).toLowerCase() } catch { return ['sun','mon','tue','wed','thu','fri','sat'][d.getUTCDay()] }
            }
            const num: Record<string, number> = { sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6 }
            proposed = proposed.map(p => {
              const isGeneric = /^(gym session|proposed block)$/i.test(p.title || '')
              if (!isGeneric) return p
              const abbr = dowOf(p.startsAt).slice(0,3)
              const dowNum = num[abbr as keyof typeof num]
              const mapped = (typeof dowNum === 'number') ? map[dowNum] : undefined
              return mapped ? { ...p, title: mapped } : p
            })
          } catch {}
          if (Array.isArray(proposed) && proposed.length > 0) {
            proposedForGen = proposed.map(p => ({ title: p.title, start: p.startsAt, end: p.endsAt }))
          }
        } catch {}

        const shouldSkipGeneration = proposedForGen.length > 0

        // Call the event generation API internally (unless we already have explicit Proposed blocks)
        const eventGenResponse = shouldSkipGeneration ? null : await fetch(new URL('/api/events/generate', req.nextUrl.origin), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': req.headers.get('cookie') || '' // Forward session cookie
          },
          body: JSON.stringify({
            includeGoogleData,
            localMode: !session?.user?.email, // Use local mode if not authenticated
            goal: message,
            // Provide the assistant Proposed template so generator can mimic and expand
            scheduleTemplate: (proposedForGen || []).map(b => ({ title: b.title, start: b.start, end: b.end })),
            preferences: {
              breakMinutes: 15,
              minBlockMinutes: 30,
              resolveConflicts: 'push'
            }
          })
        })

        if (eventGenResponse) console.log('📡 Event generation response status:', eventGenResponse.status)

        if (!shouldSkipGeneration) {
          if (eventGenResponse && eventGenResponse.ok) {
            eventGeneration = await eventGenResponse.json()
            console.log('✅ Event generation successful:', {
              eventDrafts: eventGeneration.eventDrafts?.length || 0,
              success: eventGeneration.success
            })
          } else if (eventGenResponse) {
            const errorText = await eventGenResponse.text()
            console.error('❌ Event generation failed:', eventGenResponse.status, errorText)
          } else {
            console.log('⏭️ Skipping generator because Proposed blocks were detected in the assistant reply')
          }
        }
      } catch (eventError) {
        console.error('❌ Failed to auto-generate events:', eventError)
      }
    } else {
      console.log('⚠️ Event generation skipped:', {
        hasSession: !!session?.user?.email,
        autoGenerateEvents,
        userAutoGeneratePref,
        shouldAutoGenerateEvents,
        reason: !session?.user?.email ? 'not authenticated' :
                userAutoGeneratePref === false ? 'user disabled auto-generation' :
                'autoGenerateEvents is false'
      })
    }
    
    // Long-horizon auto-timeline: detect multi-month/year or goal-oriented requests and create a structured coaching plan
    let timeline: null | {
      eventDrafts: any[]
    } = null
    try {
      const longHorizonCue = /\b(next\s+(?:\d+|one|two|three|four|five)\s+(?:months?|years?)|over\s+(?:the\s+)?(?:\d+|next)\s+(?:months?|years?)|by\s+(?:end of|EOY|EOQ|Q[1-4]|\d{4}|year'?s end|the end of the year)|12[-\s]?month|90[-\s]?day|timeline|roadmap)\b/i
      const wantsLongHorizon = longHorizonCue.test(message)
      const goalCue = /(become|get into|learn|build|start|launch|write|publish|find a job|get a job|change careers|switch careers|prepare for|pass|finish|complete|lose weight|get fit|train for|run a|marathon|portfolio|case study)/i
      const isGoalRequest = goalCue.test(message)
      const canSchedule = isScheduleAllowed(routed.intent) || isCareerPMGoal || isGoalRequest
      // Prefer enabling template timelines for explicit career/goal requests (e.g., PM) to ensure concrete drafts
      const allowTimeline = allowTemplateTimeline 
        || (prefs?.planning?.allowTemplateTimeline === true) 
        || !!goalTemplateOverride 
        || isCareerPMGoal
      const shouldCreateTimeline = !!session?.user?.email && allowTimeline && canSchedule
      console.log('Timeline creation check:', {
        authenticated: !!session?.user?.email,
        wantsLongHorizon,
        isGoalRequest,
        canSchedule,
        shouldCreateTimeline,
        allowTemplateTimeline: allowTemplateTimeline || (prefs?.planning?.allowTemplateTimeline === true) || false,
        isCareerPMGoal
      })
      if (shouldCreateTimeline) {
        const userId = (session?.user as any)?.id as string
        const userEmail = (session?.user as any)?.email
        console.log('🎯 Creating timeline for user:', userId, 'email:', userEmail)

        if (!userId) {
          console.error('❌ No userId available for timeline creation')
          throw new Error('User not authenticated')
        }

        function parseMonths(text: string): number {
          const yearMatch = /(\b(?:one|two|three|four|five|\d+)\s+years?\b)/i.exec(text)
          if (yearMatch) {
            const token = yearMatch[0].toLowerCase()
            const map: Record<string, number> = { one: 12, two: 24, three: 36, four: 48, five: 60 }
            const numKey = (Object.keys(map) as string[]).find(k => token.includes(k))
            if (numKey) return map[numKey]!
            const n = parseInt(token.replace(/[^0-9]/g, ''), 10)
            if (!isNaN(n) && n > 0) return Math.min(n * 12, 60)
          }
          const monthMatch = /(\b(?:\d+|one|two|three|four|five|six|twelve)\s+months?\b)/i.exec(text)
          if (monthMatch) {
            const token = monthMatch[0].toLowerCase()
            const map: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, twelve: 12 }
            const numKey = (Object.keys(map) as string[]).find(k => token.includes(k))
            if (numKey) return map[numKey]!
            const n = parseInt(token.replace(/[^0-9]/g, ''), 10)
            if (!isNaN(n) && n > 0) return Math.min(n, 60)
          }
          if (/\byears?\b/i.test(text)) return 24
          return 12
        }

        const months = Math.max(6, Math.min(parseMonths(message || ''), 60))

        // Derive a goal label from the user's message for generic titling
        function deriveGoalLabel(text: string): string {
          const cleaned = String(text || '')
            .replace(/[\"']/g, '')
            .replace(/^\s*i\s*want\s*to\s*/i, '')
            .replace(/^\s*i\s*need\s*to\s*/i, '')
            .replace(/^\s*help\s*me\s*/i, '')
            .replace(/^\s*how\s*(do|to)\s*i\s*/i, '')
            .trim()
          if (!cleaned) return 'Goal'
          const snippet = cleaned.split(/[\.!?\n]/)[0]?.slice(0, 60) || ''
          return snippet || 'Goal'
        }
        const goalLabel = deriveGoalLabel(message)

        // Per-goal templates
        function getGoalTemplates(text: string, label: string) {
          const t = (text || '').toLowerCase()
          const has = (re: RegExp) => re.test(t)

          type Templates = { key: string; weeklyTopics: string[]; capstones: { month: number; title: string; description: string }[]; weekPrefix: string; outreachTitle?: string }

          const PM: Templates = {
            key: 'PM',
            weekPrefix: 'PM',
            weeklyTopics: [
              'Foundations: What is PM? Responsibilities & artifacts',
              'User Research: Problem discovery & interviews',
              'Problem Framing: PR/FAQ, JTBD, success metrics',
              'Prioritization: RICE, impact vs. effort, roadmap',
              'Requirement Writing: PRD v1 + acceptance criteria',
              'Design Collaboration: Wireframes, flows, tradeoffs',
              'Tech Collaboration: APIs, constraints, estimation',
              'Analytics: North Star, guardrails, experiment design',
              'Execution: Sprint planning, tickets, risk tracking',
              'Launch: GTM plan, enablement, docs',
              'Iteration: Post-launch analysis & learnings',
              'Portfolio: Case study write-up & storytelling'
            ],
            capstones: [
              { month: 1, title: 'Capstone 1 — PRD & Problem Statement', description: 'Deliver PRD + problem framing for: ' + label },
              { month: 2, title: 'Capstone 2 — Experiment Plan & Metrics', description: 'Define metrics and an experiment plan for: ' + label },
              { month: 3, title: 'Capstone 3 — Case Study & Portfolio', description: 'Publish a polished case study for: ' + label }
            ],
            outreachTitle: 'PM Outreach — 5 messages (alumni, PMs, recruiters)'
          }

          const JOB: Templates = {
            key: 'JOB',
            weekPrefix: 'Job Search',
            weeklyTopics: [
              'Positioning: resume, LinkedIn, portfolio baseline',
              'Target list: companies, roles, referral map',
              'Applications: ATS tailoring & volume cadence',
              'Interview prep: behavioral stories (STAR)',
              'Interview prep: technical/case practice',
              'Projects/portfolio: scope and demo',
              'Networking: warm outreach, coffee chats',
              'Tracking: pipeline and metrics review',
              'Mock interviews & feedback integration',
              'Offer strategy: negotiation fundamentals',
              'Gaps: address weak areas',
              'Showcase: final portfolio & narratives'
            ],
            capstones: [
              { month: 1, title: 'Capstone 1 — Resume/LinkedIn/Portfolio Revamp', description: 'Revamp materials and publish portfolio updates for: ' + label },
              { month: 2, title: 'Capstone 2 — Interview Pipeline & Metrics', description: 'Reach targets for applications, screens, and interviews for: ' + label },
              { month: 3, title: 'Capstone 3 — Offer/Top Case Study', description: 'Secure offer or publish top case study for: ' + label }
            ],
            outreachTitle: 'Job Outreach — 5 applications/referrals'
          }

          const LEARN: Templates = {
            key: 'LEARN',
            weekPrefix: 'Learning',
            weeklyTopics: [
              'Syllabus & resources setup',
              'Fundamentals: core concepts',
              'Practice: drills & exercises',
              'Project 1: scope & plan',
              'Project 1: build',
              'Project 1: test & reflect',
              'Project 2: scope & plan',
              'Project 2: build',
              'Algorithms/problem sets or advanced topics',
              'Review & code cleanup / notes',
              'Presentation/teach-back',
              'Portfolio write-up'
            ],
            capstones: [
              { month: 1, title: 'Capstone 1 — Project 1', description: 'Ship Project 1 with README for: ' + label },
              { month: 2, title: 'Capstone 2 — Project 2', description: 'Ship Project 2 and capture learnings for: ' + label },
              { month: 3, title: 'Capstone 3 — Teach/Publish', description: 'Publish a guide or talk teaching: ' + label }
            ],
            outreachTitle: 'Community — ask/answer 2 questions'
          }

          const WRITE: Templates = {
            key: 'WRITE',
            weekPrefix: 'Writing',
            weeklyTopics: [
              'Topic research & audience',
              'Outline & structure',
              'Drafting — act 1',
              'Drafting — act 2',
              'Drafting — act 3',
              'Revision & voice',
              'Feedback & edits',
              'SEO/formatting/assets',
              'Publishing workflow',
              'Distribution plan',
              'Performance review',
              'Consistency & pipeline'
            ],
            capstones: [
              { month: 1, title: 'Capstone 1 — Publish Draft 1', description: 'Publish first piece for: ' + label },
              { month: 2, title: 'Capstone 2 — Publish Draft 2', description: 'Publish second piece and gather feedback for: ' + label },
              { month: 3, title: 'Capstone 3 — Publish Collection/Issue', description: 'Publish a collection/newsletter issue on: ' + label }
            ],
            outreachTitle: 'Distribution — share to 3 communities'
          }

          const FITNESS: Templates = {
            key: 'FITNESS',
            weekPrefix: 'Fitness',
            weeklyTopics: [
              'Baseline & mobility',
              'Strength core lifts',
              'Cardio base & zone 2',
              'Progressive overload',
              'Accessory work & core',
              'Nutrition fundamentals',
              'Sleep & recovery',
              'Deload & form check',
              'Strength progression',
              'Cardio progression',
              'Testing week',
              'Maintenance & habits'
            ],
            capstones: [
              { month: 1, title: 'Capstone 1 — Baseline Assessment', description: 'Record lifts/mileage/body metrics for: ' + label },
              { month: 2, title: 'Capstone 2 — Progress Check', description: 'Demonstrate measurable improvements for: ' + label },
              { month: 3, title: 'Capstone 3 — Event/Benchmark', description: 'Complete a benchmark workout/event for: ' + label }
            ],
            outreachTitle: 'Mobility/Recovery — 20 min'
          }

          const MARATHON: Templates = {
            key: 'MARATHON',
            weekPrefix: 'Training',
            weeklyTopics: [
              'Base mileage & easy pace',
              'Long run build-up',
              'Tempo runs & strides',
              'Intervals & VO2',
              'Cross-training & strength',
              'Nutrition/hydration',
              'Race-specific workouts',
              'Taper principles',
              'Race strategy & logistics',
              'Dress rehearsal',
              'Race week & mindset',
              'Recovery & analysis'
            ],
            capstones: [
              { month: 1, title: 'Capstone 1 — 10K Time Trial', description: 'Run a 10K time trial supporting: ' + label },
              { month: 2, title: 'Capstone 2 — Half Marathon', description: 'Run a supported half marathon for: ' + label },
              { month: 3, title: 'Capstone 3 — Race Plan & Taper', description: 'Finalize race plan and taper for: ' + label }
            ],
            outreachTitle: 'Mobility/Stretching — 20 min'
          }

          const STARTUP: Templates = {
            key: 'STARTUP',
            weekPrefix: 'Startup',
            weeklyTopics: [
              'Problem interviews',
              'Value proposition & JTBD',
              'Competitive research',
              'MVP scoping & risks',
              'Prototype v1',
              'User testing & feedback',
              'Iteration & prioritization',
              'Pricing & packaging',
              'GTM plan',
              'Launch prep',
              'Launch & support',
              'Metrics & growth loop'
            ],
            capstones: [
              { month: 1, title: 'Capstone 1 — Interview Report', description: 'Synthesize top insights for: ' + label },
              { month: 2, title: 'Capstone 2 — MVP Demo', description: 'Ship MVP demo and collect feedback for: ' + label },
              { month: 3, title: 'Capstone 3 — Launch & Metrics', description: 'Launch v1 and report early metrics for: ' + label }
            ],
            outreachTitle: 'Customer Outreach — 5 messages'
          }

          // Investment Banking career track
          const IB: Templates = {
            key: 'IB',
            weekPrefix: 'IB',
            weeklyTopics: [
              'Foundations: What is IB? Roles & workflows',
              'Accounting & Valuation: DCF, comps, accretion/dilution',
              'Modeling: 3-statement model drills',
              'Pitchbooks: Structure, story, and examples',
              'Transactions: M&A process, LBO basics',
              'Markets: Industry research & recent deals',
              'Networking: Alumni outreach & coffee chats',
              'Technical prep: practice sets & feedback',
              'Behavioral prep: stories (STAR)',
              'Case practice: mock interviews',
              'Application pipeline: tracking & metrics',
              'Offer strategy & negotiation'
            ],
            capstones: [
              { month: 1, title: 'Capstone 1 — 3-Statement Model', description: 'Build a clean 3-statement model with checks' },
              { month: 2, title: 'Capstone 2 — DCF & Comps Packet', description: 'Deliver DCF + comps one-pager for a target company' },
              { month: 3, title: 'Capstone 3 — Pitchbook Outline', description: 'Create a concise, themed pitchbook outline' }
            ],
            outreachTitle: 'IB Outreach — 5 messages (alumni, analysts, recruiters)'
          }

          // Backflip skill training
          const BACKFLIP: Templates = {
            key: 'BACKFLIP',
            weekPrefix: 'Backflip',
            weeklyTopics: [
              'Mobility & flexibility baseline',
              'Core strength & explosive power',
              'Jump mechanics & tuck drills',
              'Backward roll & spotter-assisted progressions',
              'Trampoline/foam pit sessions',
              'Mat progressions & landing mechanics',
              'Video review & technique correction',
              'Plyometrics & ankle/hamstring conditioning',
              'Confidence building & safe bails',
              'Indoor gym practice plan',
              'Outdoor transfer plan',
              'Consistency & injury prevention'
            ],
            capstones: [
              { month: 1, title: 'Capstone 1 — Consistent Tuck on Trampoline', description: 'Land 5 consistent backflips on trampoline' },
              { month: 2, title: 'Capstone 2 — Mat Backflip', description: 'Land 3 backflips on mat with spotter' },
              { month: 3, title: 'Capstone 3 — Unassisted Backflip', description: 'Land an unassisted backflip on gym floor' }
            ],
            outreachTitle: 'Coaching — 1 session/week'
          }

          const GENERIC: Templates = {
            key: 'GENERIC',
            weekPrefix: 'Focus',
            weeklyTopics: [
              'Foundations — scope and success criteria',
              'Research — inputs, references, and examples',
              'Problem framing — constraints and metrics',
              'Planning — roadmap and milestones',
              'Build/Practice — prototype or reps',
              'Feedback — reviews and iteration plan',
              'Collaboration — stakeholders and communication',
              'Systems — tools, templates, and workflows',
              'Execution — tracking and risk management',
              'Publish/Share — demo, write-up, or release',
              'Measure — outcomes and learnings',
              'Showcase — portfolio/outcome summary'
            ],
            capstones: [
              { month: 1, title: 'Capstone 1 — Definition & Plan', description: 'Deliver a concise problem statement and plan for: ' + label },
              { month: 2, title: 'Capstone 2 — Execution & Evidence', description: 'Show working progress and metrics for: ' + label },
              { month: 3, title: 'Capstone 3 — Publish & Showcase', description: 'Publish a write-up or demo that showcases: ' + label }
            ],
            outreachTitle: `Outreach — 5 messages related to "${label}"`
          }

          if (has(/\b(product management|product manager|\bpm\b)\b/i)) return PM
          if (has(/\b(investment banking|\bib\b|analyst|private equity|dcf|comps|pitchbook)\b/i)) return IB
          if (has(/\b(backflip|flip|gymnastics|tumbling)\b/i)) return BACKFLIP
          if (has(/\b(job|interview|resume|ats|offer|career|recruiter)\b/i)) return JOB
          if (has(/\b(learn|study|course|class|bootcamp|python|coding|leetcode|cs)\b/i)) return LEARN
          if (has(/\b(write|book|blog|newsletter|publish|draft)\b/i)) return WRITE
          if (has(/\b(fitness|gym|lose weight|workout|strength|cardio)\b/i)) return FITNESS
          if (has(/\b(marathon|5k|10k|half marathon|race|run)\b/i)) return MARATHON
          if (has(/\b(startup|launch|mvp|founder|customers|users|g( )?t( )?m)\b/i)) return STARTUP
          return GENERIC
        }
        const detected = getGoalTemplates(message, goalLabel)
        console.log('🎯 Template detection:', {
          message,
          goalLabel,
          detectedTemplate: detected.key,
          prefTemplate: prefs?.planning?.goalTemplateOverride,
          goalTemplateOverride
        })
        // Apply overrides from user preferences or request
        const prefTemplate = (prefs?.planning?.goalTemplateOverride as string | undefined)
        const selectedKey = (goalTemplateOverride as string | undefined) || prefTemplate || detected.key
        console.log('📋 Selected template:', selectedKey)
        function pickTemplatesByKey(key: string) {
          switch ((key || '').toUpperCase()) {
            case 'PM': return getGoalTemplates('product manager', goalLabel)
            case 'JOB': return getGoalTemplates('job search', goalLabel)
            case 'LEARN': return getGoalTemplates('learn coding', goalLabel)
            case 'WRITE': return getGoalTemplates('write book', goalLabel)
            case 'FITNESS': return getGoalTemplates('lose weight', goalLabel)
            case 'MARATHON': return getGoalTemplates('run marathon', goalLabel)
            case 'STARTUP': return getGoalTemplates('build startup', goalLabel)
            case 'IB': return getGoalTemplates('investment banking', goalLabel)
            case 'BACKFLIP': return getGoalTemplates('backflip', goalLabel)
            default: return getGoalTemplates('', goalLabel)
          }
        }
        const templates = pickTemplatesByKey(selectedKey)
        console.log('🎨 Template selected:', templates?.key, 'with', templates?.weeklyTopics?.length, 'topics')
        if (!templates || !templates.weeklyTopics || !templates.capstones) {
          console.error('❌ Template is invalid:', templates)
          throw new Error('Invalid template selected')
        }
        const weekPrefix = templates.weekPrefix

        // Build per-template time windows (UTC). Allow preference and request overrides.
        type TimeWindow = { hour: number; minute: number; durationMin: number }
        type TimeWindows = {
          focusUTC: TimeWindow
          outreachUTC: TimeWindow
          reviewUTC: TimeWindow
          dailyCheckinUTC: TimeWindow
          longRunWeekendUTC?: { weekday: number; hour: number; minute: number; durationMin: number }
        }
        function defaultTimeWindowsForTemplate(key: string): TimeWindows {
          const base: TimeWindows = {
            focusUTC: { hour: 15, minute: 0, durationMin: 90 },
            outreachUTC: { hour: 22, minute: 0, durationMin: 30 },
            reviewUTC: { hour: 21, minute: 30, durationMin: 30 },
            dailyCheckinUTC: { hour: 14, minute: 30, durationMin: 15 },
          }
          const upper = (key || '').toUpperCase()
          if (upper === 'WRITE') {
            return { ...base, focusUTC: { hour: 12, minute: 0, durationMin: 120 } }
          }
          if (upper === 'JOB') {
            return { ...base, outreachUTC: { hour: 15, minute: 30, durationMin: 45 } }
          }
          if (upper === 'FITNESS') {
            return { ...base, dailyCheckinUTC: { hour: 12, minute: 0, durationMin: 10 } }
          }
          if (upper === 'MARATHON') {
            return { ...base, longRunWeekendUTC: { weekday: 6, hour: 13, minute: 0, durationMin: 120 } }
          }
          return base
        }
        const prefTW = ((prefs?.planning?.timeWindows || {}) as Record<string, TimeWindows>)[templates.key]
        const overrideTW = (timeWindowOverride as Partial<TimeWindows> | undefined)
        const timeWindows: TimeWindows = {
          ...defaultTimeWindowsForTemplate(templates.key),
          ...(prefTW || {} as TimeWindows),
          ...(overrideTW || {} as TimeWindows),
        }

        // Helper functions (UTC-based to avoid tz libs; UI can adjust to user TZ)
        function atUTC(date: Date, hour: number, minute: number): Date {
          const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute, 0, 0))
          return d
        }
        function addDays(date: Date, days: number): Date {
          const d = new Date(date)
          d.setUTCDate(d.getUTCDate() + days)
          return d
        }
        function nextWeekday(from: Date, weekday: number): Date {
          // weekday: 1=Mon ... 5=Fri
          const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
          const wd = typeof weekday === 'number' ? weekday : 1
          let delta = (wd - d.getUTCDay() + 7) % 7
          if (delta === 0) delta = 7
          return addDays(d, delta)
        }

        // Determine weeks to plan (cap to 12 to avoid overload)
        const approxWeeks = Math.min(Math.max(Math.ceil(months * 4), 6), 12)
        const now = new Date()
        const startMonday = nextWeekday(now, 1)

        const weeklyTopics: string[] = templates.weeklyTopics

        // Title normalizer to remove generic prefixes
        function normalizeTitle(t: string): string {
          return (t || '')
            .replace(/^daily practice\s*—\s*/i, '')
            .replace(/^[a-z ]*week\s*\d+\s*—\s*/i, '')
            .replace(/^pm week\s*\d+\s*—\s*/i, '')
            .trim()
        }

        // Lightweight web research to enrich event drafts with specific, actionable items
        async function fetchResearch(goal: string) {
          try {
            const q1 = encodeURIComponent(`${goal} best practices`)
            const q2 = encodeURIComponent(`${goal} roadmap OR plan OR syllabus`)
            const wikiQ = encodeURIComponent(`${goal} framework OR outline`)
            const [ddg1, ddg2, wiki] = await Promise.all([
              fetch(`https://api.duckduckgo.com/?q=${q1}&format=json&no_redirect=1&no_html=1`),
              fetch(`https://api.duckduckgo.com/?q=${q2}&format=json&no_redirect=1&no_html=1`),
              fetch(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${wikiQ}&limit=5&namespace=0&format=json&origin=*`),
            ])
            const [d1, d2, w1] = await Promise.all([ddg1.json(), ddg2.json(), wiki.json()])
            const ddgLinks: { title: string; url: string }[] = []
            function pullDDG(d: any) {
              if (!d) return
              if (Array.isArray(d.RelatedTopics)) {
                for (const t of d.RelatedTopics) {
                  if (t && t.FirstURL && t.Text) ddgLinks.push({ title: t.Text, url: t.FirstURL })
                  if (t && Array.isArray(t.Topics)) {
                    for (const tt of t.Topics) {
                      if (tt && tt.FirstURL && tt.Text) ddgLinks.push({ title: tt.Text, url: tt.FirstURL })
                    }
                  }
                }
              }
              if (d.AbstractURL && d.AbstractText) ddgLinks.push({ title: d.AbstractText, url: d.AbstractURL })
            }
            pullDDG(d1)
            pullDDG(d2)
            const wikiLinks: { title: string; url: string }[] = []
            if (Array.isArray(w1) && Array.isArray(w1[1]) && Array.isArray(w1[3])) {
              for (let i = 0; i < Math.min(w1[1].length, w1[3].length); i++) {
                wikiLinks.push({ title: w1[1][i], url: w1[3][i] })
              }
            }
            const urls: { title: string; url: string }[] = []
            const seen = new Set<string>()
            for (const s of [...ddgLinks, ...wikiLinks]) {
              if (!seen.has(s.url)) { urls.push(s); seen.add(s.url) }
            }
            const top = urls.slice(0, 8)
            const microTasks = top.map((u, idx) => {
              const uObj = new URL(u.url)
              const host = uObj.hostname.replace(/^www\./, '')
              return {
                label: `Study: ${u.title.split(' - ')[0]}`.slice(0, 90),
                rationale: `Research-backed practice item from ${host}. Review and apply insights to your goal.`,
                url: u.url,
              }
            })
            // Add canonical PM practice tasks if research is sparse
            if (microTasks.length < 6) {
              microTasks.push(
                { label: `Deep dive: Key frameworks for ${goal}`, rationale: 'Build foundational mental models from reputable sources', url: 'https://en.wikipedia.org/wiki/Framework' },
                { label: `Hands-on: Produce a 1-page write-up toward ${goal}`, rationale: 'Active recall and synthesis to drive progress', url: 'https://www.coursera.org' },
                { label: `Benchmark leaders in ${goal} — compare 2 examples`, rationale: 'Competitive/peer analysis to learn from exemplars', url: 'https://www.google.com/search?q=benchmark' },
                { label: `Heuristics review: Identify 5 improvement ideas for ${goal}`, rationale: 'Critique to sharpen judgment and execution', url: 'https://en.wikipedia.org/wiki/Heuristic' },
              )
            }
            return microTasks
          } catch {
            return [
              { label: `Research: Read a top overview article on ${goal}`, rationale: 'Gain a broad map before going deep', url: 'https://www.google.com/search?q=overview' },
              { label: `Make a 5-bullet plan for ${goal}`, rationale: 'Define scope and next actions clearly', url: 'https://todoist.com/product' },
              { label: `Compare 2 approaches to ${goal}`, rationale: 'Contrast options to choose a strategy', url: 'https://www.google.com/search?q=pros+cons' },
            ]
          }
        }

        const researchMicroTasks = await fetchResearch(goalLabel)

        const artifactByMonth: { month: number; title: string; description: string }[] = templates.capstones

        const draftCreates: ReturnType<typeof prisma.eventDraft.create>[] = []
        console.log('📅 Planning timeline for', approxWeeks, 'weeks with', weeklyTopics.length, 'topics')

        // Weekly Focus Sessions (Mon 15:00–16:30 UTC)
        for (let w = 0; w < approxWeeks; w++) {
          const topic = weeklyTopics[w % weeklyTopics.length]
          const day = addDays(startMonday, w * 7)
          const start = atUTC(day, Number(timeWindows.focusUTC.hour ?? 15), Number(timeWindows.focusUTC.minute ?? 0))
          const end = new Date(start)
          end.setUTCMinutes(end.getUTCMinutes() + timeWindows.focusUTC.durationMin)
          draftCreates.push(
            prisma.eventDraft.create({
              data: {
                userId,
                taskId: null,
                title: normalizeTitle(`${weekPrefix} Week ${w + 1} — ${topic} (${goalLabel})`),
                startsAt: start,
                endsAt: end,
                rationale: 'Weekly focus session aligned to goal curriculum',
                confidence: 0.9,
              },
            })
          )
        }

        // Outreach/Community blocks (Tue & Thu 22:00–22:30 UTC) — use template-specific title
        const outreachTitle = templates.outreachTitle || `Outreach — 3 tailored messages about "${goalLabel}"`
        for (let w = 0; w < approxWeeks; w++) {
          const tue = addDays(nextWeekday(addDays(startMonday, w * 7), 2), 0)
          const thu = addDays(nextWeekday(addDays(startMonday, w * 7), 4), 0)
          const blocks = [tue, thu]
          for (const b of blocks) {
          const start = atUTC(b, Number(timeWindows.outreachUTC.hour ?? 22), Number(timeWindows.outreachUTC.minute ?? 0))
            const end = new Date(start)
            end.setUTCMinutes(end.getUTCMinutes() + (timeWindows.outreachUTC.durationMin || 30))
            const rt = researchMicroTasks[(w * blocks.length) % researchMicroTasks.length]
            draftCreates.push(
              prisma.eventDraft.create({
                data: {
                  userId,
                  taskId: null,
                  title: outreachTitle,
                  startsAt: start,
                  endsAt: end,
                  rationale: `${rt?.rationale || 'Practice block aligned to goal.'} ${rt?.url ? `Source: ${rt.url}` : ''}`.trim(),
                  confidence: 0.85,
                },
              })
            )
          }
        }

        // Marathon-specific long run (weekly)
        if (templates.key === 'MARATHON' && timeWindows.longRunWeekendUTC) {
          for (let w = 0; w < approxWeeks; w++) {
            const base = addDays(startMonday, w * 7)
            // Compute date of specified weekday in the same week
            const d = nextWeekday(base, (timeWindows.longRunWeekendUTC.weekday ?? 6))
            const start = atUTC(d, Number(timeWindows.longRunWeekendUTC.hour ?? 13), Number(timeWindows.longRunWeekendUTC.minute ?? 0))
            const end = new Date(start)
            end.setUTCMinutes(end.getUTCMinutes() + (timeWindows.longRunWeekendUTC.durationMin || 120))
            draftCreates.push(
              prisma.eventDraft.create({
                data: {
                  userId,
                  taskId: null,
                  title: 'Long Run — endurance build',
                  startsAt: start,
                  endsAt: end,
                  rationale: 'Weekly long run block for marathon training',
                  confidence: 0.85,
                }
              })
            )
          }
        }

        // Weekly review (Fri 21:30–22:00 UTC) — adapt title for marathon training
        for (let w = 0; w < approxWeeks; w++) {
          const fri = nextWeekday(addDays(startMonday, w * 7), 5)
          const start = atUTC(fri, Number(timeWindows.reviewUTC.hour ?? 21), Number(timeWindows.reviewUTC.minute ?? 30))
          const end = new Date(start)
          end.setUTCMinutes(end.getUTCMinutes() + (timeWindows.reviewUTC.durationMin || 30))
      const weeklyReviewTitle = templates.key === 'MARATHON' ? 'Weekly Training Review — plan next week' : `Weekly Review — demo progress for "${goalLabel}"`
          draftCreates.push(
            prisma.eventDraft.create({
              data: {
                userId,
                taskId: null,
                title: weeklyReviewTitle,
                startsAt: start,
                endsAt: end,
                rationale: templates.key === 'MARATHON' ? 'Review training logs, adjust plan, and set mileage targets.' : 'Accountability review and plan reset for the goal',
                confidence: 0.85,
              },
            })
          )
        }

        // Daily practice blocks disabled to avoid generic, non-specific events
        const enableDailyPractice = false
        if (enableDailyPractice) {
          for (let d = 0; d < 21; d++) {
            const day = addDays(now, d + 1)
            const start = atUTC(day, Number(timeWindows.dailyCheckinUTC.hour ?? 14), Number(timeWindows.dailyCheckinUTC.minute ?? 30))
            const end = new Date(start)
            end.setUTCMinutes(end.getUTCMinutes() + (timeWindows.dailyCheckinUTC.durationMin || 15))
            const task = researchMicroTasks[d % researchMicroTasks.length]
            draftCreates.push(
              prisma.eventDraft.create({
                data: {
                  userId,
                  taskId: null,
                  title: normalizeTitle(`Daily Practice — ${task?.label || `Apply a framework to "${goalLabel}"`}`).slice(0, 120),
                  startsAt: start,
                  endsAt: end,
                  rationale: `${task?.rationale || 'Focused micro-practice tied to your goal.'}${task?.url ? ` Source: ${task.url}` : ''}`.trim(),
                  confidence: 0.9,
                },
              })
            )
          }
        }

        // Monthly capstones on first business day (17:00–18:00 UTC)
        function firstBusinessDay(date: Date): Date {
          const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 17, 0, 0, 0))
          const day = d.getUTCDay()
          if (day === 0) d.setUTCDate(2)
          else if (day === 6) d.setUTCDate(3)
          return d
        }
        const startMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
        for (let i = 1; i <= Math.min(months, 3); i++) {
          const base = new Date(Date.UTC(startMonth.getUTCFullYear(), startMonth.getUTCMonth() + i, 1))
          const start = firstBusinessDay(base)
          const end = new Date(start)
          end.setUTCMinutes(end.getUTCMinutes() + 60)
          const cap = artifactByMonth[Math.min(i, artifactByMonth.length) - 1]
          draftCreates.push(
            prisma.eventDraft.create({
              data: {
                userId,
                taskId: null,
                title: cap ? cap.title : `Monthly Capstone — Month ${i}`,
                startsAt: start,
                endsAt: end,
                rationale: cap ? cap.description : 'Monthly milestone delivery',
                confidence: 0.9,
              },
            })
          )
        }

        console.log('🔄 Creating', draftCreates.length, 'event drafts...')
        try {
          const createdDrafts = await Promise.all(draftCreates)
          console.log('✅ Timeline created with', createdDrafts.length, 'event drafts')

          // Check if any drafts failed to create
          const failedDrafts = createdDrafts.filter(draft => !draft)
          if (failedDrafts.length > 0) {
            console.error('❌ Some event drafts failed to create:', failedDrafts.length)
          }

          // Build timeline object while createdDrafts is in scope
          timeline = {
            eventDrafts: createdDrafts,
          }
        } catch (dbError: any) {
          console.error('❌ Database error creating event drafts:', dbError)
          throw new Error('Failed to create event drafts: ' + (dbError?.message || 'unknown'))
        }

        // Attach goal detection metadata into the response later
        (plan as any)._goalDetection = {
          label: goalLabelOverride || goalLabel,
          templateKey: templates.key,
          source: goalTemplateOverride ? 'override' : (prefTemplate ? 'preferences' : 'detected'),
          timeWindowsUsed: timeWindows,
        }
        console.log('📋 Timeline metadata:', (plan as any)._goalDetection)
      }
    } catch (timelineError) {
      console.error('❌ Long-horizon timeline creation failed:', timelineError)
      console.error('Timeline error details:', {
        message,
        userId: (session?.user as any)?.id,
        isGoalRequest: isGoalishRequest,
        isCareerPMGoal,
        canSchedule: isScheduleAllowed(routed.intent) || isCareerPMGoal || isGoalishRequest,
        stack: (timelineError as any)?.stack
      })
      // Re-throw the error so it surfaces to the user
      throw timelineError
    }

    // Enforce conversational style when feature flag is on; otherwise keep legacy only for strict non-scheduling intent
    let enhancedReply = plan.reply
    const conversational = process.env.PLANNER_CONVERSATIONAL === '1'
    if (!isScheduleAllowed(routed.intent) && !conversational) {
      const map = buildAnswerMap(message, plan.reply || '')
      const clarifier = maybeClarifier(message, map.relevance)
      const bullets = map.items.slice(0, 8).map(i => `- ${i.answer || i.question}`).join('\n')
      const ninety = ['Month 1: focus on foundations', 'Month 2: execution and feedback loops', 'Month 3: showcase outcomes'].map(s => `- ${s}`).join('\n')
      const next3 = ['Define 1-2 concrete goals', 'Block first deep-work session', 'Identify stakeholder for feedback'].map(s => `- ${s}`).join('\n')
      enhancedReply = `You asked: "${message}" — returning a focused plan.\n\n${bullets}${clarifier ? `\n\n${clarifier}` : ''}`
    }
    // Implicit everyday events (e.g., lunch and shopping) when user asks with sequencing cues
    try {
      const lower = (message || '').toLowerCase()
      const mentionsVideoCall = /\b(video\s*call|zoom|google\s*meet|teams|call|meeting)\b/.test(lower)
      const mentionsAfter = /\bafter\b/.test(lower)
      const mentionsLunch = /\blunch\b/.test(lower)
      const mentionsShopping = /\b(shop|shopping|store|grocer(y|ies))\b/.test(lower)
      const mentionsToday = /\b(today|this\s+afternoon|this\s+evening|tonight)\b/.test(lower)

      const allowScheduling = isScheduleAllowed(routed.intent)
      const userId = session?.user ? (session.user as any).id as string : undefined

      if (allowScheduling && userId && (mentionsLunch || mentionsShopping)) {
        // Find a nearby anchor: next existing busy event that looks like a call/meeting today
        const now = new Date()
        const endOfDay = new Date(now)
        endOfDay.setHours(23, 59, 59, 999)
        let anchorEnd: Date | null = null
        try {
          const busyToday = await prisma.calendarBusy.findMany({
            where: {
              userId,
              startsAt: { gte: now, lte: endOfDay }
            },
            orderBy: { startsAt: 'asc' }
          })
      const callLike = busyToday.find(b => /call|meet|zoom|video|standup|sync|interview/i.test(b.title || ''))
          if (callLike) anchorEnd = new Date(callLike.endsAt)
        } catch {}

        // Default anchor: 12:00 if no meeting found and user said today
        if (!anchorEnd && mentionsToday) {
          const noon = new Date()
          noon.setHours(12, 0, 0, 0)
          anchorEnd = noon
        }

        if (anchorEnd) {
          const draftsToCreate: { title: string; start: Date; end: Date; rationale: string }[] = []
          // If lunch mentioned, place 45–60 min lunch block right after anchor
          if (mentionsLunch) {
            const lunchStart = new Date(anchorEnd)
            const lunchEnd = new Date(lunchStart)
            lunchEnd.setMinutes(lunchEnd.getMinutes() + 60)
            draftsToCreate.push({
              title: 'Lunch nearby the store',
              start: lunchStart,
              end: lunchEnd,
              rationale: 'Requested lunch before shopping'
            })
          }
          // If shopping mentioned, place 60–90 min block after lunch or anchor with 10-min buffer
          if (mentionsShopping) {
            const base: Date | null = draftsToCreate.length > 0 ? draftsToCreate[draftsToCreate.length - 1]?.end ?? null : (anchorEnd ? new Date(anchorEnd) : null)
            if (!base) {
              // no anchor; skip shopping block
            } else {
              const shopStart = new Date(base)
              shopStart.setMinutes(shopStart.getMinutes() + 10)
              const shopEnd = new Date(shopStart)
              shopEnd.setMinutes(shopEnd.getMinutes() + 90)
              draftsToCreate.push({
                title: 'Shopping at the store',
                start: shopStart,
                end: shopEnd,
                rationale: 'Requested shopping after lunch'
              })
            }
          }

          if (draftsToCreate.length > 0) {
            const createdDrafts = await Promise.all(
              draftsToCreate.map(d => prisma.eventDraft.create({
                data: {
                  userId,
                  taskId: null,
                  title: d.title,
                  startsAt: d.start,
                  endsAt: d.end,
                  rationale: d.rationale,
                  confidence: 0.9
                }
              }))
            )
            // Surface these drafts in the response and Next 3 Actions
            plan.eventDrafts = [...(plan.eventDrafts || []), ...createdDrafts]
          }
        }
      }
    } catch (implicitErr) {
      console.warn('Implicit everyday event drafting failed (continuing):', implicitErr)
    }

    // Append concise summary of drafted events (user TZ) so chat matches created events
    try {
      const userTz = tz
      const fmt = (d: string | Date) => new Date(d as any).toLocaleString('en-US', { timeZone: userTz, hour: '2-digit', minute: '2-digit' })
      const previewDrafts: any[] = []
      if ((eventGeneration as any)?.success && isScheduleAllowed(routed.intent)) {
        previewDrafts.push(...(eventGeneration.eventDrafts || []))
      }
      // Also include reply-parsed and USI drafts in the chat preview, to keep reply and created drafts aligned
      if ((replyParsedDrafts || []).length) previewDrafts.push(...replyParsedDrafts)
      if ((usiDrafts as any[] | undefined)?.length) previewDrafts.push(...usiDrafts)
      const lines = previewDrafts.slice(0, 5).map((e: any) => `- ${fmt(e.startsAt)}–${fmt(e.endsAt)}: ${e.title}`)
      if (lines.length > 0) {
        enhancedReply += `\n\n**Drafted events (${userTz})**\n${lines.join("\n")}`
      }
    } catch (tzErr) {
      console.warn('Failed to add drafted events summary:', tzErr)
    }

    // If we drafted a long-horizon timeline, inform the user inline
    if (timeline && timeline.eventDrafts?.length && process.env.PLANNER_CONVERSATIONAL !== '1') {
      const createdCount = timeline.eventDrafts.length
      console.log('📝 Adding timeline message to reply:', createdCount, 'events')
      enhancedReply += `\n\n---\n\n✅ **Timeline Drafted**\n\nI drafted ${createdCount} goal-aligned milestone events. Review and approve them in the Events tab to add to your calendar.`
    } else {
      console.log('⚠️ No timeline created or no event drafts:', {
        hasTimeline: !!timeline,
        draftCount: timeline?.eventDrafts?.length || 0
      })
    }
    
    // Tool-based scheduling: allow the model to call tools to create drafts or confirm them when appropriate
    // Keep this conservative: drafts by default; confirmations only if clearly requested or opted in
    let toolCreatedDrafts: any[] = []
    let toolConfirmed: null | {
      success: boolean
      confirmedEvents?: any[]
      syncedToGoogle?: boolean
      syncErrors?: any[]
    } = null
    try {
      const allowScheduling = isScheduleAllowed(routed.intent)
      const isAuthenticated = !!session?.user?.email
      const userId = isAuthenticated ? (((session as any).user as any).id as string) : undefined
      const explicitConfirmRequested = /\b(add to (?:my )?calendar|put (?:this|them) on (?:my )?calendar|go ahead and schedule|schedule (?:it|them)|create (?:the )?event(?:s)?)\b/i.test(message || '')
      const allowToolRun = allowScheduling && !!userId
      if (allowToolRun) {
        // Parse Proposed blocks up-front so the tool calls can mirror the assistant reply exactly
        let toolProposedBlocks: Array<{ title: string; startsAt: string; endsAt: string; rationale?: string }> = []
        try {
          const { parseProposedFromReply } = await import('@/utils/events/parseProposedFromReply')
          const { resolveHorizon } = await import('@/lib/planning/temporal')
          const userTz = tz
          const hz = resolveHorizon(message, userTz)
          let proposed = parseProposedFromReply(plan.reply || '', userTz, new Date(hz.startDate + 'T00:00:00'))
          try {
            const map: Record<number, string> = (() => {
              const m: Record<number, string> = {}
              const lines = (plan.reply || '').split(/\r?\n/)
              const idx: Record<string, number> = { sunday:0, monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6 }
              for (const raw of lines) {
                const s = raw.trim()
                const mm = s.match(/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s*[:\-]\s*(.+)$/i)
                if (mm) {
                  const dow = idx[mm[1].toLowerCase()]
                  const title = (mm[2] || '').trim()
                  if (typeof dow === 'number' && title) m[dow] = title
                }
              }
              return m
            })()
            const tzForDow = userTz
            const dowOf = (d: Date) => {
              try { return new Intl.DateTimeFormat('en-US', { timeZone: tzForDow, weekday: 'short' }).format(d).toLowerCase() } catch { return ['sun','mon','tue','wed','thu','fri','sat'][d.getUTCDay()] }
            }
            const num: Record<string, number> = { sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6 }
            proposed = proposed.map(p => {
              const isGeneric = /^(gym session|proposed block)$/i.test(p.title || '')
              if (!isGeneric) return p
              const abbr = dowOf(p.startsAt).slice(0,3)
              const dowNum = num[abbr as keyof typeof num]
              const mapped = (typeof dowNum === 'number') ? map[dowNum] : undefined
              return mapped ? { ...p, title: mapped } : p
            })
          } catch {}
          if (Array.isArray(proposed) && proposed.length > 0) {
            toolProposedBlocks = proposed.map(p => ({
              title: p.title,
              startsAt: p.startsAt.toISOString(),
              endsAt: p.endsAt.toISOString(),
              rationale: 'Parsed from Proposed blocks in assistant reply'
            }))
          }
        } catch {}
        type ToolCall = { id: string; function: { name: string; arguments?: string } }
        const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
          {
            type: 'function',
            function: {
              name: 'create_event_draft',
              description: 'Create a calendar event draft for the user. Prefer using concrete start and end times in ISO.',
              parameters: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  startsAt: { type: 'string', description: 'ISO 8601 date-time' },
                  endsAt: { type: 'string', description: 'ISO 8601 date-time' },
                  rationale: { type: 'string' },
                },
                required: ['title', 'startsAt', 'endsAt'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'confirm_event_drafts',
              description: 'Confirm previously created event drafts and sync to Google Calendar if connected. Use ONLY when the user explicitly requests to add to calendar.',
              parameters: {
                type: 'object',
                properties: {
                  ids: { type: 'array', items: { type: 'string' }, minItems: 1 },
                  syncToGoogle: { type: 'boolean', default: true },
                },
                required: ['ids'],
                additionalProperties: false,
              },
            },
          },
        ]

        const sys = `You are a scheduling assistant. Use tools to create event drafts into the user's system.\n\nRules:\n- Mirror the assistant reply exactly: if Proposed blocks are provided, create drafts that exactly match them (title + start/end).\n- Default to creating event drafts, not confirming.\n- Only call confirm_event_drafts when the user clearly asked to add/schedule events.\n- Use specific titles and realistic times that avoid conflicts.\n- Keep events within near-term windows unless explicitly long-term.`

        const toolMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          { role: 'system', content: sys },
          // Provide the assistant's reply and the parsed Proposed blocks to ground tool calls
          { role: 'assistant', content: plan.reply || '' },
          { role: 'user', content: `User message: ${message}` },
          { role: 'user', content: `Context: timezone=${tz}; canSchedule=${allowScheduling}; explicitConfirmRequested=${explicitConfirmRequested}` },
          ...(toolProposedBlocks.length > 0
            ? [{ role: 'user', content: `ProposedBlocks(JSON): ${JSON.stringify(toolProposedBlocks)}` } as OpenAI.Chat.Completions.ChatCompletionMessageParam]
            : []),
        ]

        let toolChatReply: string | null = null

        for (let i = 0; i < 4; i++) {
          const resp = await withTimeout(openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: toolMessages,
            tools,
            tool_choice: 'auto',
            temperature: 0.2,
            max_tokens: 400,
          }), 10000)
          const choice = resp.choices?.[0]?.message as any
          const calls = (choice?.tool_calls || []) as ToolCall[]
          if (!calls || calls.length === 0) break

          for (const call of calls) {
            let toolResult: any = { ok: false }
            try {
              const args = JSON.parse(call.function.arguments || '{}')
              if (call.function.name === 'create_event_draft') {
                if (!args?.title || !args?.startsAt || !args?.endsAt) throw new Error('missing required fields')
                const created = await prisma.eventDraft.create({
                  data: {
                    userId: userId!,
                    taskId: null,
                    title: String(args.title).slice(0, 140),
                    startsAt: new Date(args.startsAt),
                    endsAt: new Date(args.endsAt),
                    rationale: args.rationale ? String(args.rationale).slice(0, 500) : 'Draft created via tool',
                    confidence: 0.85,
                  },
                })
                toolCreatedDrafts.push(created)
                toolResult = { ok: true, draft: { id: created.id, title: created.title, startsAt: created.startsAt, endsAt: created.endsAt } }
              } else if (call.function.name === 'confirm_event_drafts') {
                const ids: string[] = Array.isArray(args?.ids) ? args.ids : []
                if (ids.length === 0) throw new Error('no ids provided')
                if (!explicitConfirmRequested) throw new Error('confirmation not authorized by user message')
                const confirmRes = await fetch(new URL('/api/events/confirm', req.nextUrl.origin), {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Cookie': req.headers.get('cookie') || '',
                  },
                  body: JSON.stringify({ eventDraftIds: ids, syncToGoogle: args?.syncToGoogle !== false }),
                })
                const payload = await confirmRes.json().catch(() => ({}))
                toolConfirmed = {
                  success: !!payload?.success,
                  confirmedEvents: payload?.confirmedEvents || [],
                  syncedToGoogle: payload?.syncedToGoogle,
                  syncErrors: payload?.syncErrors,
                }
                toolResult = { ok: true, confirmation: { success: toolConfirmed.success, confirmed: toolConfirmed.confirmedEvents?.length || 0 } }
              }
            } catch (err: any) {
              toolResult = { ok: false, error: err?.message || 'tool_failed' }
            }
            toolMessages.push({ role: 'tool', tool_call_id: (call as any).id, content: JSON.stringify(toolResult) } as any)
          }
        }

        // (Reverted) no post-tool strict echo; planner reply pipeline resumes below
      }
    } catch (toolErr) {
      console.warn('Tool-based scheduling failed (continuing):', toolErr)
    }

    // USI + slotter: opportunistically propose drafts for ANY ask (feature-flagged)
    try {
      const allowScheduling = isScheduleAllowed(routed.intent)
      if (allowScheduling && conversational) {
        const userId = session?.user ? (session.user as any).id as string : 'local-user'
        const usi = interpretTemporal(message, tz)
        const cap = Math.max(1, prefs?.planning?.eventCapPerDay || 4)
        const occ = expandOccurrences(usi, 50)
        usiDrafts = await slotOccurrences(usi, occ, userId, cap, {
          mode: (process.env.SCHEDULER_OVERLAP_MODE as any) || (prefs?.planning?.allowOverlap ? 'soft' : 'none'),
          maxOverlapMinutes: prefs?.planning?.maxOverlapMinutes ?? 20,
          stackableRegex: new RegExp(prefs?.planning?.stackableRegex ?? '(walk|stretch|listen|flashcards)', 'i'),
        })
      }
    } catch (usiErr) {
      console.warn('USI/slotter failed (continuing):', usiErr)
    }

    // Persist ephemeral drafts (e.g., planV2Drafts and usiDrafts) so the Events panel fetch sees them
    let v2Drafts = planV2Drafts || []
    // Additionally, parse any "Proposed" blocks from the assistant reply and turn them into drafts so chat and drafts match
    try {
      const { parseProposedFromReply } = await import('@/utils/events/parseProposedFromReply')
      const { resolveHorizon } = await import('@/lib/planning/temporal')
      const userTz = tz
      const hz2 = resolveHorizon(message, userTz)
      let proposed = parseProposedFromReply(plan.reply || '', userTz, new Date(hz2.startDate + 'T00:00:00'))
      try {
        const map: Record<number, string> = (() => {
          const m: Record<number, string> = {}
          const lines = (plan.reply || '').split(/\r?\n/)
          const idx: Record<string, number> = { sunday:0, monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6 }
          for (const raw of lines) {
            const s = raw.trim()
            const mm = s.match(/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s*[:\-]\s*(.+)$/i)
            if (mm) {
              const dow = idx[mm[1].toLowerCase()]
              const title = (mm[2] || '').trim()
              if (typeof dow === 'number' && title) m[dow] = title
            }
          }
          return m
        })()
        const tzForDow = userTz
        const dowOf = (d: Date) => {
          try { return new Intl.DateTimeFormat('en-US', { timeZone: tzForDow, weekday: 'short' }).format(d).toLowerCase() } catch { return ['sun','mon','tue','wed','thu','fri','sat'][d.getUTCDay()] }
        }
        const num: Record<string, number> = { sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6 }
        proposed = proposed.map(p => {
          const isGeneric = /^(gym session|proposed block)$/i.test(p.title || '')
          if (!isGeneric) return p
          const abbr = dowOf(p.startsAt).slice(0,3)
          const dowNum = num[abbr as keyof typeof num]
          const mapped = (typeof dowNum === 'number') ? map[dowNum] : undefined
          return mapped ? { ...p, title: mapped } : p
        })
      } catch {}
      if (Array.isArray(proposed) && proposed.length > 0) {
        replyParsedDrafts = proposed.map(p => ({
          id: `draft_${Math.random().toString(36).slice(2)}`,
          title: p.title,
          startsAt: p.startsAt,
          endsAt: p.endsAt,
          rationale: 'Parsed from Proposed blocks in assistant reply',
          confidence: 0.75
        }))
      }
    } catch (parseErr) {
      console.warn('Failed to parse Proposed blocks from reply (continuing):', parseErr)
    }
    const goalDrafts = (timeline?.eventDrafts || [])
    const plannerEventDrafts = isScheduleAllowed(routed.intent) ? (plan.eventDrafts || []) : []
    const emailDerivedDrafts = isScheduleAllowed(routed.intent) ? (eventGeneration?.eventDrafts || []) : []
    try {
      let isAuthenticated = !!session?.user?.email
      let userId = isAuthenticated ? (session!.user as any).id as string : undefined
      // Dev-only: impersonate first user to persist drafts for frontend testing
      if (!userId && process.env.NODE_ENV !== 'production') {
        try {
          const first = await prisma.user.findFirst({ select: { id: true } })
          if (first?.id) {
            userId = first.id
            isAuthenticated = true
          }
        } catch {}
      }
      async function upsertEphemeralDraft(d: any) {
        if (!isAuthenticated || !userId) return d
        const title = String(d.title || 'Scheduled Task')
        const startsAt = new Date(d.startsAt)
        const endsAt = new Date(d.endsAt)
        if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) return d
        const windowStart = new Date(startsAt.getTime() - 12 * 60 * 60 * 1000)
        const windowEnd = new Date(startsAt.getTime() + 12 * 60 * 60 * 1000)
        const existing = await prisma.eventDraft.findFirst({
          where: { userId, title, startsAt: { gte: windowStart, lte: windowEnd }, status: 'PENDING' },
          select: { id: true, title: true, startsAt: true, endsAt: true, confidence: true },
        })
        if (existing) return { ...d, id: existing.id, startsAt: existing.startsAt, endsAt: existing.endsAt, confidence: existing.confidence ?? d.confidence }
        const created = await prisma.eventDraft.create({
          data: { userId, taskId: null, title, startsAt, endsAt, rationale: d.rationale || 'Draft from planner', confidence: typeof d.confidence === 'number' ? d.confidence : 0.8 },
          select: { id: true, title: true, startsAt: true, endsAt: true, confidence: true },
        })
        return { ...d, id: created.id, startsAt: created.startsAt, endsAt: created.endsAt, confidence: created.confidence }
      }
      // Persist V2 drafts
      if ((v2Drafts || []).length > 0) {
        v2Drafts = await Promise.all(v2Drafts.map(upsertEphemeralDraft))
      }
      // Persist USI drafts
      if ((usiDrafts || []).length > 0) {
        usiDrafts = await Promise.all(usiDrafts.map(upsertEphemeralDraft))
      }
      // Persist reply-parsed drafts
      if ((replyParsedDrafts || []).length > 0) {
        replyParsedDrafts = await Promise.all(replyParsedDrafts.map(upsertEphemeralDraft))
      }
    } catch (persistErr) {
      console.warn('Failed to persist ephemeral drafts (continuing):', persistErr)
    }

    const allEventDrafts = [
      ...v2Drafts,
      ...goalDrafts,
      ...plannerEventDrafts,
      ...emailDerivedDrafts,
      ...toolCreatedDrafts,
      ...usiDrafts,
      ...replyParsedDrafts
    ]

    // Compute Next 3 Actions override from event drafts
    function priorityRank(d: any): number {
      // Derive rank: lower is higher priority
      // Prefer explicit string priority if present; fallback to confidence-based bucketing
      const p = (d && (d.priority || d.task?.priority))
      if (typeof p === 'string') {
        const val = p.toLowerCase()
        if (val.includes('high') || val === 'p1') return 0
        if (val.includes('med') || val === 'p2') return 1
        if (val.includes('low') || val === 'p3') return 2
      }
      if (typeof p === 'number') {
        // Higher numeric priority first
        return 2 - Math.max(0, Math.min(2, Math.floor(Math.min(5, p) / 2)))
      }
      const conf = typeof d?.confidence === 'number' ? d.confidence : 0
      return conf >= 0.85 ? 0 : conf >= 0.7 ? 1 : 2
    }

    function safeTime(ms: any): number {
      const t = new Date(ms as any).getTime()
      return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY
    }

    const sortedDrafts = [...allEventDrafts].sort((a: any, b: any) => {
      const sa = safeTime(a?.startsAt)
      const sb = safeTime(b?.startsAt)
      if (sa !== sb) return sa - sb
      const pa = priorityRank(a)
      const pb = priorityRank(b)
      if (pa !== pb) return pa - pb
      const ca = typeof a?.confidence === 'number' ? a.confidence : 0
      const cb = typeof b?.confidence === 'number' ? b.confidence : 0
      return cb - ca
    })

    const fmtTime = (d: Date) => d.toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
    const fmtDuration = (start?: Date, end?: Date) => {
      if (!start || !end) return null
      const mins = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
      return mins > 0 ? `${mins}m` : null
    }
    const next3Override: string[] = sortedDrafts.slice(0, 3).map((d: any) => {
      try {
        const s = d?.startsAt ? new Date(d.startsAt) : null
        const e = d?.endsAt ? new Date(d.endsAt) : null
        const timeLabel = s && e ? `${fmtTime(s)}–${fmtTime(e)}` : (s ? fmtTime(s) : (fmtDuration(s || undefined, e || undefined) || 'TBD'))
        const title = (d?.title || 'Scheduled Task') as string
        return `${timeLabel} — ${title} (Draft)`
      } catch {
        const title = (d?.title || 'Scheduled Task') as string
        return `${title} (Draft)`
      }
    })

    function injectNext3FromDrafts(markdown: string, lines: string[]): string {
      if (!Array.isArray(lines) || lines.length === 0) return markdown
      const block = `### Next 3 Actions\n${lines.map((l, i) => `${i + 1}) ${l}`).join('\n')}`
      const re = /(\n|^)### Next 3 Actions[^\n]*\n([\s\S]*?)(?=\n#+\s|$)/
      if (re.test(markdown)) {
        return markdown.replace(re, (m, p1) => `${p1}${block}\n`)
      }
      // If not present, append to end
      return `${markdown}\n\n${block}`
    }

    if (!conversational && next3Override.length > 0) {
      enhancedReply = injectNext3FromDrafts(enhancedReply, next3Override)
    }

    // Return the enhanced plan response
    console.log('📤 Returning planner response:', {
      success: true,
      replyLength: enhancedReply.length,
      totalEventDrafts: allEventDrafts.length,
      goalDrafts: goalDrafts.length,
      plannerEventDrafts: plannerEventDrafts.length,
      emailDerivedDrafts: emailDerivedDrafts.length,
      hasTimeline: !!timeline,
      timelineDrafts: timeline?.eventDrafts?.length || 0
    })
    return NextResponse.json({
      success: true,
      plan: plan,
      latestPlanV2: planV2 || null,
      reply: enhancedReply,
      eventDrafts: allEventDrafts,
      next3Override,
      toolConfirmed,
      eventGeneration: eventGeneration?.success ? {
        eventDrafts: eventGeneration.eventDrafts,
        metadata: eventGeneration.metadata,
        insights: eventGeneration.insights
      } : null,
      timeline,
      eventsPayload: plan.eventsPayload,
      eventsText: plan.eventsText,
      goal: (plan as any)._goalDetection ? {
        label: (plan as any)._goalDetection.label,
        templateKey: (plan as any)._goalDetection.templateKey,
        source: (plan as any)._goalDetection.source,
        timeWindowsUsed: (plan as any)._goalDetection.timeWindowsUsed
      } : null,
      // Learning system metadata
      learning: {
        variant: selectedVariant,
        confidence: plan.metadata?.confidence,
        personalized: plan.metadata?.personalized || false,
        usedSources: plan.metadata?.usedSources || [],
        canProvideFeedback: !!session?.user?.email
      }
    })
  } catch (error) {
    console.error('Planner API error:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to process message',
      reply: 'Sorry, I encountered an error while processing your message. Please try again.'
    }, { status: 500 })
  }
}

