import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { prisma } from '@/lib/clients/prisma'
import { cacheCalendarBusyForUser } from '@/lib/ingest/calendar'

// Returns confirmed events and pending drafts for the calendar UI
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const impersonate = url.searchParams.get('impersonate') === 'true'
    let userId: string | null = null
    if (impersonate && process.env.NODE_ENV !== 'production') {
      const user = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } })
      if (!user) return NextResponse.json({ error: 'no_user' }, { status: 404 })
      userId = user.id
    } else {
      const session = await getServerSession(authOptions)
      if (!session?.user?.email) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
      }
      userId = (session.user as any).id as string
    }

    const { searchParams } = new URL(req.url)
    const afterMs = Number(searchParams.get('after') || '')
    const beforeMs = Number(searchParams.get('before') || '')
    const refresh = (searchParams.get('refresh') || 'false').toLowerCase() === 'true'
    const includeDrafts = (searchParams.get('includeDrafts') || 'false').toLowerCase() === 'true'
    const onlyPrimary = (searchParams.get('primaryOnly') || 'false').toLowerCase() === 'true'
    const limit = Number(searchParams.get('limit') || '') || 1000
    const after = isNaN(afterMs) ? undefined : new Date(afterMs)
    const before = isNaN(beforeMs) ? undefined : new Date(beforeMs)

    const overlapFilter = (after?: Date, before?: Date) => {
      if (!after && !before) return {}
      const and: any[] = []
      if (before) and.push({ startsAt: { lte: before } })
      if (after) and.push({ endsAt: { gte: after } })
      return { AND: and }
    }
    const whereWindow = overlapFilter(after, before)

    // Determine calendar connection status
    let calendarStatus: 'ok' | 'not_connected' | 'missing_scope' = 'ok'
    let statusReason: string | undefined
    const credential = await prisma.credential.findFirst({ where: { userId, provider: 'GOOGLE' }, orderBy: { updatedAt: 'desc' } })
    if (!credential) {
      calendarStatus = 'not_connected'
      statusReason = 'No Google credential found'
    } else if (!credential.scope || !credential.scope.includes('https://www.googleapis.com/auth/calendar')) {
      calendarStatus = 'missing_scope'
      statusReason = 'Google credential missing Calendar scope'
    }

    // Optionally refresh Google Calendar cache (try regardless of status; function returns reason)
    if (refresh) {
      try {
        const res = await cacheCalendarBusyForUser({ userId, origin: req.nextUrl.origin })
        if (!res.ok) {
          statusReason = res.reason
        }
      } catch (err: any) {
        console.warn('Calendar refresh failed (continuing with cached data):', err)
        statusReason = `refresh_failed:${err?.message || 'unknown'}`
      }
    }

    try {
      const [busy, confirmed] = await Promise.all([
        prisma.calendarBusy.findMany({
          where: { userId, ...overlapFilter(after, before) },
          orderBy: { startsAt: 'asc' },
          take: limit,
          select: { id: true, title: true, startsAt: true, endsAt: true, calendarId: true, externalEventId: true, metadata: true },
        }),
        prisma.event.findMany({
          where: { userId, confirmed: true, ...overlapFilter(after, before) },
          orderBy: { startsAt: 'asc' },
          take: limit,
          select: { id: true, title: true, startsAt: true, endsAt: true, externalId: true, calendarId: true },
        }),
      ])

      // Optionally fetch drafts for debugging; disabled by default per product requirement
      let drafts: Array<{ id: string; title: string | null; startsAt: Date; endsAt: Date; confidence: number | null }> = []
      if (includeDrafts) {
        try {
          drafts = await prisma.eventDraft.findMany({
            where: { userId, status: 'PENDING', ...whereWindow } as any,
            orderBy: { startsAt: 'asc' },
            take: limit,
            select: { id: true, title: true, startsAt: true, endsAt: true, confidence: true },
          })
        } catch (draftErr: any) {
          console.warn('Skipping drafts due to schema error:', draftErr?.message || draftErr)
          statusReason = (statusReason ? statusReason + ';' : '') + 'drafts_unavailable'
        }
      }

      // Build a set of external IDs present in Google busy cache for dedupe
      const busyExternalIds = new Set<string>((busy || []).map(b => String(b.externalEventId || '')))

      const events = [
        // Include confirmed events immediately so UI updates without waiting for Google cache
        ...confirmed
          // If Google busy already has the same externalId, skip the local confirmed copy to avoid duplicates
          .filter(c => !(c.externalId && busyExternalIds.has(String(c.externalId))))
          .map(c => ({
            id: c.id,
            title: c.title || 'Event',
            start: c.startsAt,
            end: c.endsAt,
            backgroundColor: '#2563eb',
            borderColor: '#2563eb',
            textColor: '#ffffff',
            extendedProps: { type: 'confirmed', calendarId: c.calendarId, externalId: c.externalId },
          })),
        ...(includeDrafts ? drafts.map(d => ({
          id: d.id,
          title: d.title || 'Suggested',
          start: d.startsAt,
          end: d.endsAt,
          backgroundColor: '#9ca3af',
          borderColor: '#9ca3af',
          textColor: '#111827',
          extendedProps: { type: 'draft', confidence: d.confidence },
        })) : []),
        ...busy
          // Exclude entries that are cancelled in Google Calendar or marked as "free"/transparent
          .filter(b => {
            const meta: any = (b as any).metadata || {}
            if (meta.status === 'cancelled') return false
            if (meta.transparency === 'transparent') return false
            if (onlyPrimary && meta.primary === false) return false
            return true
          })
          .map(b => {
            const meta = (b as any).metadata || {}
            const bg = meta.color || '#e5e7eb'
            const fg = meta.textColor || '#111827'
            const allDay = Boolean(meta.allDay)
            return {
              id: b.id,
              title: b.title || 'Busy',
              start: b.startsAt,
              end: b.endsAt,
              allDay,
              backgroundColor: bg,
              borderColor: bg,
              textColor: fg,
              extendedProps: { type: 'external', calendarId: b.calendarId, externalId: b.externalEventId },
            }
          }),
      ]

      return NextResponse.json({ events, status: { calendar: calendarStatus, reason: statusReason } })
    } catch (queryErr: any) {
      console.error('Calendar events DB error:', queryErr)
      return NextResponse.json({ events: [], status: { calendar: calendarStatus, reason: `db_error:${queryErr?.message || 'unknown'}` } })
    }
  } catch (error) {
    console.error('Calendar events API error:', error)
    return NextResponse.json({ error: 'Failed to fetch calendar events' }, { status: 500 })
  }
}


