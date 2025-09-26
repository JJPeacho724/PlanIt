import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { prisma } from '@/lib/clients/prisma'
import { openai } from '@/lib/clients/openai'
import { COMPREHENSIVE_PLANNING_KNOWLEDGE } from '@acme/ai'

// Enhanced day planning API that uses email context for better schedule optimization
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  
  const userId = (session.user as any).id as string
  const body = await req.json()
  const { date, preferences = {} } = body

  try {
    // Get last 5 days of email ingests for context
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
    const emailIngests = await prisma.messageIngest.findMany({
      where: {
        userId,
        source: 'EMAIL',
        receivedAt: { gte: fiveDaysAgo }
      },
      orderBy: { receivedAt: 'desc' },
      take: 50 // Limit to recent emails
    })

    // Get existing tasks for context
    const tasks = await prisma.task.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20
    })

    // Get calendar events for the specified date
    const startOfDay = new Date(date)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(date)
    endOfDay.setHours(23, 59, 59, 999)

    const calendarEvents = await prisma.calendarBusy.findMany({
      where: {
        userId,
        startsAt: { gte: startOfDay },
        endsAt: { lte: endOfDay }
      },
      orderBy: { startsAt: 'asc' }
    })

    // Prepare email context for AI
    const emailContext = emailIngests.map(email => {
      const metadata = email.metadata as any
      return {
        date: email.receivedAt.toISOString().split('T')[0],
        from: metadata?.from || 'Unknown',
        subject: metadata?.subject || 'No subject',
        bodySnippet: metadata?.bodyText?.slice(0, 300) || 'No content',
        receivedAt: email.receivedAt.toISOString()
      }
    })

    // Use AI to analyze emails and provide day planning insights
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `${COMPREHENSIVE_PLANNING_KNOWLEDGE}

You are an AI day planning assistant that analyzes recent emails to provide intelligent scheduling recommendations.

TASK: Analyze the user's recent emails and existing commitments to provide optimal day planning advice for ${date}.

Consider:
- Meeting requests and calendar invites in emails
- Deadline mentions and time-sensitive items
- Project updates and collaboration needs
- Travel or location requirements mentioned
- Energy levels and meeting density
- Email urgency patterns and sender importance
- Optimal time blocks for different types of work

Provide actionable day planning advice including:
1. Key priorities based on email context
2. Optimal time blocks for different activities  
3. Meeting scheduling recommendations
4. Energy management suggestions
5. Potential conflicts or scheduling issues
6. Action items derived from emails

Format your response in markdown with clear sections.`
        },
        {
          role: 'user',
          content: `Plan my day for ${date}

RECENT EMAILS (last 5 days):
${emailContext.map(email => `
Date: ${email.date}
From: ${email.from}
Subject: ${email.subject}
Content: ${email.bodySnippet}
---`).join('\n')}

EXISTING CALENDAR EVENTS:
${calendarEvents.map(event => `
${event.startsAt.toLocaleTimeString()} - ${event.endsAt.toLocaleTimeString()}: ${event.title}
`).join('\n')}

CURRENT TASKS:
${tasks.map(task => `
- ${task.title} (Priority: ${task.priority || 0}, Due: ${task.dueAt?.toISOString().split('T')[0] || 'No due date'})
`).join('\n')}

USER PREFERENCES:
${JSON.stringify(preferences, null, 2)}`
        }
      ],
      temperature: 0.7,
      max_tokens: 1500,
    })

    const planningAdvice = completion.choices?.[0]?.message?.content?.trim() || 'Unable to generate planning advice.'

    // Detect actionable items from emails for task creation
    const actionableEmails = emailIngests.filter(email => {
      const metadata = email.metadata as any
      const subject = metadata?.subject || ''
      const bodyText = metadata?.bodyText || ''
      const text = `${subject}\n${bodyText}`.toLowerCase()
      
      // Enhanced pattern matching for day planning
      return text.includes('meeting') || text.includes('deadline') || text.includes('due') || 
             text.includes('asap') || text.includes('urgent') || text.includes('schedule') ||
             text.includes('call') || text.includes('zoom') || text.includes('calendar') ||
             /\b(tomorrow|today|this week|next week|monday|tuesday|wednesday|thursday|friday)\b/.test(text)
    })

    return NextResponse.json({
      ok: true,
      planningAdvice,
      emailContext: emailContext.slice(0, 10), // Return first 10 for reference
      actionableEmails: actionableEmails.length,
      suggestedActions: actionableEmails.slice(0, 5).map(email => {
        const metadata = email.metadata as any
        return {
          id: email.id,
          subject: metadata?.subject,
          from: metadata?.from,
          suggestion: `Review email about: ${metadata?.subject}`
        }
      })
    })

  } catch (error) {
    console.error('Email context planning error:', error)
    return NextResponse.json({ error: 'Failed to generate email-based planning advice' }, { status: 500 })
  }
}
