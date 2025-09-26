import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { prisma } from '@/lib/clients/prisma'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const userId = (session.user as any).id as string
    // Load user timezone for correct client-facing formatting
    let userTimeZone: string | undefined
    try {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { timeZone: true } })
      userTimeZone = user?.timeZone || undefined
    } catch {}

    // Parse optional window params
    const { searchParams } = new URL(req.url)
    const afterMs = Number(searchParams.get('after') || '')
    const beforeMs = Number(searchParams.get('before') || '')
    const limit = Number(searchParams.get('limit') || '') || 200
    const after = isNaN(afterMs) ? undefined : new Date(afterMs)
    const before = isNaN(beforeMs) ? undefined : new Date(beforeMs)

    try {
      // Fetch pending event drafts (created by chatbot/planner) within window
      const eventDrafts = await prisma.eventDraft.findMany({
        where: {
          userId,
          status: 'PENDING',
          ...(after || before ? { startsAt: { ...(after ? { gte: after } : {}), ...(before ? { lte: before } : {}) } } : {}),
        },
        orderBy: { startsAt: 'asc' },
        take: limit,
        include: {
          task: { select: { title: true } },
        },
      })

      // Guard against bad data: require valid dates; otherwise do not filter out by title
      const filteredDrafts = eventDrafts.filter(d => {
        if (!d?.startsAt || !d?.endsAt) return false
        const sOk = !isNaN(new Date(d.startsAt as any).getTime())
        const eOk = !isNaN(new Date(d.endsAt as any).getTime())
        return sOk && eOk
      })

      // Dedupe by similar title within 60 minutes window
      const byDay: typeof filteredDrafts = []
      filteredDrafts.sort((a, b) => new Date(a.startsAt as any).getTime() - new Date(b.startsAt as any).getTime())
      for (const d of filteredDrafts) {
        const t = (d.title || d.task?.title || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
        const dup = byDay.find(x => {
          const xt = (x.title || x.task?.title || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
          const close = Math.abs(new Date(x.startsAt as any).getTime() - new Date(d.startsAt as any).getTime()) <= 60 * 60 * 1000
          if (!close) return false
          const same = t && xt && (t === xt || (t.includes(xt) || xt.includes(t)))
          return same
        })
        if (!dup) byDay.push(d)
      }

      // Map to Events panel shape
      const formattedDrafts = byDay.map(d => {
        const s = new Date(d.startsAt as any)
        const e = new Date(d.endsAt as any)
        const dateStr = userTimeZone
          ? s.toLocaleDateString(undefined, { timeZone: userTimeZone })
          : s.toLocaleDateString()
        const timeRange = userTimeZone
          ? `${s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: userTimeZone })}–${e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: userTimeZone })}`
          : `${s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–${e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        return {
          id: d.id,
          title: d.title || d.task?.title || 'Scheduled task',
          whenLabel: `${dateStr} ${timeRange}`,
          confidence: d.confidence ?? 0.7,
          status: 'pending' as const,
          startISO: d.startsAt.toISOString(),
          canAct: true,
        }
      })

      // If no drafts exist, fallback to legacy task-derived events for continuity
      if (formattedDrafts.length === 0) {
        const tasks = await prisma.task.findMany({
          where: {
            userId,
            source: 'EMAIL',
            tags: { has: 'calendar' },
          },
          orderBy: { createdAt: 'desc' },
          take: Math.min(50, limit),
          select: { id: true, title: true, description: true, createdAt: true, priority: true, tags: true },
        })

        const fallback = tasks.map(task => {
          const description = task.description || ''
          const timeMatch = description.match(/(\d{1,2}:\d{2}|\d{1,2}(am|pm))/i)
          const timeStr = timeMatch ? timeMatch[0] : 'TBD'
          return {
            id: task.id,
            title: task.title,
            whenLabel: `Today ${timeStr}`,
            confidence: task.priority === 3 ? 0.8 : task.priority === 2 ? 0.6 : 0.4,
            // Mark as confirmed so the 'pending' filter (default) hides these non-actionable fallbacks
            status: 'confirmed' as const,
            canAct: false,
          }
        })

        return NextResponse.json({ items: fallback, status: { ok: true } })
      }

      return NextResponse.json({ items: formattedDrafts, status: { ok: true } })
    } catch (dbErr: any) {
      console.error('Context events DB error:', dbErr)
      return NextResponse.json({ items: [], status: { ok: false, reason: `db_error:${dbErr?.message || 'unknown'}` } })
    }

  } catch (error) {
    console.error('Error fetching events:', error)
    return NextResponse.json({ items: [], status: { ok: false, reason: `api_error:${(error as any)?.message || 'unknown'}` } })
  }
}
