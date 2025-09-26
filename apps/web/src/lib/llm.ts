import { openai } from '@/lib/clients/openai'
import { findSimilarChunks } from './embeddings'
import { getConversationContext } from './redis'

export interface UserProfile {
  goals: string[]
  constraints: Record<string, any>
  preferences: Record<string, any>
  workPatterns?: Record<string, any>
  skills?: string[]
  availability?: Record<string, any>
}

export interface PlannerContext {
  userId: string
  profile?: UserProfile
  recentMemories: Array<{ content: string; confidence: number }>
  semanticContext: Array<{ content: string; similarity: number }>
  conversationHistory?: Array<{ role: string; content: string }>
  currentTasks?: Array<{ title: string; description?: string; priority?: number }>
  upcomingEvents?: Array<{ title: string; startsAt: Date; endsAt: Date }>
}

/**
 * Enhanced LLM service with personalized prompt building
 */
export class PersonalizedLLMService {
  /**
   * Generate a personalized plan using user profile and memories
   */
  async generatePersonalizedPlan(
    request: string,
    context: PlannerContext
  ): Promise<{ reply: string; confidence: number; usedSources: string[] }> {
    try {
      const { routeIntent } = await import('@/utils/ai/IntentRouter')
      const routed = routeIntent(request)
      const prompt = await this.buildPersonalizedPrompt(request, context, routed.intent)
      const usedSources = this.extractUsedSources(context)
      
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: prompt.systemPrompt },
          { role: 'user', content: prompt.userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 900,
      })

      const reply = completion.choices?.[0]?.message?.content?.trim() || 
        'I understand your request. Let me help you create a personalized plan.'
      
      // Calculate confidence based on available context
      const confidence = this.calculateConfidence(context)
      
      return { reply, confidence, usedSources }
    } catch (error) {
      console.error('Personalized LLM generation failed:', error)
      return this.generateFallbackPlan(request, context)
    }
  }

  /**
   * Build a personalized prompt with user context
   */
  private async buildPersonalizedPrompt(
    request: string,
    context: PlannerContext,
    intent: 'plan_request' | 'schedule_request' | 'mixed'
  ): Promise<{ systemPrompt: string; userPrompt: string }> {
    const { profile, recentMemories, semanticContext, currentTasks, upcomingEvents } = context
    
    // Base system prompt (keep existing context injection)
    let systemPrompt = `You are a personalized AI day planner.
`

    // Add profile information
    if (profile) {
      systemPrompt += `## User Profile:
**Goals:** ${profile.goals?.join(', ') || 'Not specified'}
**Work Patterns:** ${JSON.stringify(profile.workPatterns || {}, null, 2)}
**Preferences:** ${JSON.stringify(profile.preferences || {}, null, 2)}
**Constraints:** ${JSON.stringify(profile.constraints || {}, null, 2)}

`
    }

    // Add learned memories
    if (recentMemories.length > 0) {
      systemPrompt += `## Learned User Patterns (High Confidence):
${recentMemories.map(m => `- ${m.content} (confidence: ${Math.round(m.confidence * 100)}%)`).join('\n')}

`
    }

    // Add semantic context
    if (semanticContext.length > 0) {
      systemPrompt += `## Relevant Context:
${semanticContext.map(c => `- ${c.content}`).join('\n')}

`
    }

    // Add current state
    if (currentTasks?.length) {
      systemPrompt += `## Current Tasks:
${currentTasks.slice(0, 10).map(t => `- **${t.title}** ${t.description ? `- ${t.description}` : ''} ${t.priority ? `(Priority: ${t.priority})` : ''}`).join('\n')}

`
    }

    if (upcomingEvents?.length) {
      systemPrompt += `## Upcoming Events Today:
${upcomingEvents.map(e => `- **${e.title}** at ${e.startsAt.toLocaleTimeString()} - ${e.endsAt.toLocaleTimeString()}`).join('\n')}

`
    }

    // Always use adaptive conversational style (no fixed headings)
    systemPrompt += `
ROLE: Practical planning coach. Reply in natural prose with optional bullets; vary structure.
RULES:
- Be specific and actionable; no fluff.
- You MAY propose 1–4 timeboxed **Proposed** blocks when scheduling is allowed.
- Never claim proposals are on the calendar; user must confirm.
- Default timezone America/Chicago unless user specifies otherwise.
STYLE: 1 short paragraph + optional bullets. Keep it under one screen.
`

    const userPrompt = `Request: "${request}"

Context you may use:
- Profile: ${profile ? 'provided' : 'none'}
- Current tasks: ${currentTasks?.length || 0}
- Upcoming events: ${upcomingEvents?.length || 0}
- Semantic/email context size: ${semanticContext.length}
- Intent: ${intent}

Answer naturally. If intent is 'mixed' or 'schedule_request' OR no explicit “don’t schedule” is present, propose 1–4 concrete blocks and label them as Proposed.`

    return { systemPrompt, userPrompt }
  }

  /**
   * Calculate confidence score based on available context
   */
  private calculateConfidence(context: PlannerContext): number {
    let score = 0.3 // Base confidence
    
    if (context.profile) score += 0.2
    if (context.recentMemories.length > 0) score += 0.2
    if (context.semanticContext.length > 0) score += 0.1
    if (context.currentTasks?.length) score += 0.1
    if (context.upcomingEvents?.length) score += 0.1
    
    return Math.min(score, 1.0)
  }

  /**
   * Extract sources used in the context
   */
  private extractUsedSources(context: PlannerContext): string[] {
    const sources = []
    if (context.profile) sources.push('user_profile')
    if (context.recentMemories.length > 0) sources.push('learned_patterns')
    if (context.semanticContext.length > 0) sources.push('semantic_memory')
    if (context.currentTasks?.length) sources.push('current_tasks')
    if (context.upcomingEvents?.length) sources.push('calendar_events')
    return sources
  }

  /**
   * Fallback plan generation when main service fails
   */
  private generateFallbackPlan(
    request: string,
    context: PlannerContext
  ): { reply: string; confidence: number; usedSources: string[] } {
    const profile = context.profile
    const goals = profile?.goals?.join(', ') || 'your goals'
    
    const reply = `## Personalized Plan: ${request}

Based on your profile and current context, here's a tailored approach:

### 🎯 **Focus Areas**
- Align with your goals: ${goals}
- Consider your current ${context.currentTasks?.length || 0} tasks
- Work around ${context.upcomingEvents?.length || 0} scheduled events

### ⏰ **Recommended Schedule**
1. **Morning**: Start with high-priority items when energy is fresh
2. **Midday**: Handle meetings and collaborative work
3. **Afternoon**: Focus on detailed work and follow-ups
4. **End of day**: Review and plan for tomorrow

### 📋 **Next Steps**
- Break down your request into specific, actionable tasks
- Set realistic time estimates for each component
- Block calendar time for focused work
- Build in buffer time for unexpected items

**Note**: This is a general framework. As we learn more about your preferences and patterns, these recommendations will become more personalized.

💡 **Tip**: Use the feedback buttons to help me learn your preferences!`

    return {
      reply,
      confidence: 0.3,
      usedSources: this.extractUsedSources(context)
    }
  }
}

/**
 * Build context for personalized planning with graceful fallbacks
 */
export async function buildPlannerContext(
  userId: string,
  request: string
): Promise<PlannerContext> {
  const { prisma } = await import('@/lib/clients/prisma')
  
  try {
    // Get user profile (with fallback)
    let userProfile: { profileJson?: unknown } | null = null
    try {
      userProfile = await prisma.userProfile.findUnique({
        where: { userId }
      })
    } catch (error) {
      console.log('UserProfile table not found, using fallback')
    }
    
    // Get high-confidence facts (with fallback)
    let userFacts: Array<{ factType: string; key: string; value: string; confidence: number }> = []
    try {
      const fetchedFacts = await prisma.userFact.findMany({
        where: { 
          userId,
          confidence: { gte: 0.7 }
        },
        orderBy: { confidence: 'desc' },
        take: 10
      })
      userFacts = fetchedFacts.map((f: any) => ({
        factType: f.factType,
        key: f.key,
        value: f.value,
        confidence: f.confidence
      }))
    } catch (error) {
      console.log('UserFact table not found, using fallback')
    }
    
    // Get recent memories
    const recentMemories = userFacts.map(fact => ({
      content: `${fact.factType}: ${fact.key} = ${fact.value}`,
      confidence: fact.confidence
    }))
    
    // Get semantic context (with fallback)
    let semanticContext: Array<{ content: string; similarity: number }> = []
    try {
      const chunks = await findSimilarChunks(request, userId, 5, 0.5)
      semanticContext = (chunks as Array<{ content: string; similarity: number }> ) || []
    } catch (error) {
      console.log('Semantic search failed, using text fallback')
      semanticContext = []
    }
    
    // Get conversation history (with fallback)
    let conversationHistory = null
    try {
      conversationHistory = await getConversationContext(userId)
    } catch (error) {
      console.log('Redis not available, skipping conversation history')
    }
    
    // Get current tasks (should work with existing schema)
    const currentTasksRaw = await prisma.task.findMany({
      where: { userId },
      orderBy: [
        { priority: 'desc' },
        { dueAt: 'asc' },
        { createdAt: 'desc' }
      ],
      take: 10,
      select: {
        title: true,
        description: true,
        priority: true
      }
    })
    const currentTasks = currentTasksRaw.map(t => ({
      title: t.title as string,
      description: (t.description ?? undefined) as string | undefined,
      priority: (t.priority ?? undefined) as number | undefined
    }))
    
    // Get today's events (should work with existing schema)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    
    const upcomingEvents = await prisma.event.findMany({
      where: {
        userId,
        startsAt: {
          gte: today,
          lt: tomorrow
        }
      },
      orderBy: { startsAt: 'asc' },
      select: {
        title: true,
        startsAt: true,
        endsAt: true
      }
    })
    
    const profileObj = (userProfile?.profileJson ?? undefined) as unknown
    return {
      userId,
      profile: (profileObj && typeof profileObj === 'object' ? (profileObj as UserProfile) : undefined),
      recentMemories,
      semanticContext,
      conversationHistory: conversationHistory?.messages,
      currentTasks,
      upcomingEvents
    }
  } catch (error) {
    console.error('Error building planner context:', error)
    // Return minimal context if everything fails
    return {
      userId,
      profile: undefined,
      recentMemories: [],
      semanticContext: [],
      conversationHistory: undefined,
      currentTasks: [],
      upcomingEvents: []
    }
  }
}

// Export a singleton instance
export const personalizedLLM = new PersonalizedLLMService()
