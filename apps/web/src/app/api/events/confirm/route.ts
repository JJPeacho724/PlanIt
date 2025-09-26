import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { prisma } from '@/lib/clients/prisma'
import { createGoogleOAuthClient, createGoogleCalendarClient } from '@/lib/clients/google'
import { decryptFromBytes, encryptToBytes } from '@/lib/crypto'
import { env } from '@acme/core'

// Simple helpers to compare events for deduplication against Google Calendar
function normalizeTitle(raw: string | null | undefined): string {
  return (raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isWithinMs(a: Date, b: Date, thresholdMs: number): boolean {
  return Math.abs(a.getTime() - b.getTime()) <= thresholdMs
}

async function findExistingGoogleEvent(params: {
  calendar: any
  calendarId: string
  title: string | null | undefined
  startsAt: Date
  endsAt: Date
}): Promise<any | null> {
  const { calendar, calendarId, title, startsAt, endsAt } = params

  // Search a small window around the target time to account for rounding/timezone differences
  const windowMs = 15 * 60 * 1000
  const timeMin = new Date(startsAt.getTime() - windowMs).toISOString()
  const timeMax = new Date(endsAt.getTime() + windowMs).toISOString()

  try {
    const list = await calendar.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 25,
      // Use free-text query when a title is available to reduce result set
      ...(title ? { q: String(title).slice(0, 256) } : {}),
    })

    const targetNorm = normalizeTitle(title)
    const candidates = list?.data?.items || []

    for (const ev of candidates) {
      // Skip cancelled or transparent entries
      if (ev.status === 'cancelled') continue
      if (ev.transparency === 'transparent') continue

      const evStartIso = ev.start?.dateTime || ev.start?.date
      const evEndIso = ev.end?.dateTime || ev.end?.date
      if (!evStartIso || !evEndIso) continue

      const evStartsAt = new Date(evStartIso)
      const evEndsAt = new Date(evEndIso)

      // Quick time proximity check
      const timeClose =
        isWithinMs(evStartsAt, startsAt, windowMs) && isWithinMs(evEndsAt, endsAt, windowMs)

      const evNorm = normalizeTitle(ev.summary)
      const titleMatch = !!targetNorm && !!evNorm && (targetNorm === evNorm || targetNorm.includes(evNorm) || evNorm.includes(targetNorm))

      // Strong signal if event was originally created by our app
      const createdByUs = (ev.source?.title || '').toLowerCase() === 'ai planner'

      if ((titleMatch && timeClose) || createdByUs) {
        return ev
      }
    }
  } catch (err) {
    console.warn('Google events.list failed; continuing without dedupe:', err)
  }

  return null
}

// Convert EventDrafts to confirmed Events, optionally syncing to Google Calendar
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  
  const userId = (session.user as any).id as string
  const body = await req.json()
  let { eventDraftIds, syncToGoogle = true, action } = body

  if (!eventDraftIds || !Array.isArray(eventDraftIds)) {
    return NextResponse.json({ error: 'eventDraftIds array required' }, { status: 400 })
  }

  try {
    // Handle decline vs delete actions differently
    if (action) {
      if (action.toLowerCase() === 'reject' || action.toLowerCase() === 'decline') {
        // Mark as declined instead of deleting
        const result = await prisma.eventDraft.updateMany({
          where: { id: { in: eventDraftIds }, userId },
          data: { status: 'DECLINED' }
        })
        return NextResponse.json({ success: true, declinedCount: result.count })
      } else if (action.toLowerCase() === 'delete') {
        // Actually delete the event drafts
        const result = await prisma.eventDraft.deleteMany({
          where: { id: { in: eventDraftIds }, userId }
        })
        return NextResponse.json({ success: true, deletedCount: result.count })
      }
    }

    // 1. Get the event drafts to confirm
    const eventDrafts = await prisma.eventDraft.findMany({
      where: {
        id: { in: eventDraftIds },
        userId
      },
      include: {
        task: true
      }
    })

    if (eventDrafts.length === 0) {
      return NextResponse.json({ error: 'No valid event drafts found' }, { status: 404 })
    }

    // 2. Setup Google Calendar client if sync is requested
    let calendar = null
    let oauth2Client = null
    
    if (syncToGoogle) {
      try {
        const cred = await prisma.credential.findFirst({ 
          where: { userId, provider: 'GOOGLE' } 
        })
        
        if (cred) {
          const accessToken = decryptFromBytes(cred.encryptedAccessToken)
          const refreshToken = decryptFromBytes(cred.encryptedRefreshToken)
          const redirectUri = new URL('/api/integrations/connect/google/callback', req.nextUrl.origin).toString()
          
          oauth2Client = createGoogleOAuthClient({ 
            clientId: env.GOOGLE_CLIENT_ID, 
            clientSecret: env.GOOGLE_CLIENT_SECRET, 
            redirectUri 
          })
          
          if (accessToken) {
            oauth2Client.setCredentials({ 
              access_token: accessToken, 
              refresh_token: refreshToken ?? undefined 
            })
            calendar = createGoogleCalendarClient(oauth2Client)
          }
        }
      } catch (error) {
        console.warn('Failed to setup Google Calendar sync, proceeding without:', error)
        syncToGoogle = false
      }
    }

    // 3. Create confirmed events and optionally sync to Google
    const confirmedEvents = []
    const syncErrors = []

    for (const draft of eventDrafts) {
      let externalId = null
      let calendarId = null

      // Sync to Google Calendar if enabled and client is available
      if (syncToGoogle && calendar) {
        try {
          // First, attempt to find an existing Google event that matches this draft
          const existing = await findExistingGoogleEvent({
            calendar,
            calendarId: 'primary',
            title: draft.title || draft.task?.title,
            startsAt: draft.startsAt,
            endsAt: draft.endsAt,
          })

          if (existing?.id) {
            externalId = existing.id
            calendarId = 'primary'
          } else {
            // Otherwise insert a new event
            const googleEvent = {
              summary: draft.title || 'Scheduled Task',
              description: draft.task?.description || draft.rationale || 'AI-scheduled event',
              start: {
                dateTime: draft.startsAt.toISOString(),
                timeZone: session?.user && (session.user as any).timeZone ? (session.user as any).timeZone : undefined
              },
              end: {
                dateTime: draft.endsAt.toISOString(),
                timeZone: session?.user && (session.user as any).timeZone ? (session.user as any).timeZone : undefined
              },
              source: {
                title: 'AI Planner',
                url: req.nextUrl.origin
              }
            }

            const response = await calendar.events.insert({
              calendarId: 'primary',
              requestBody: googleEvent
            })

            externalId = response.data.id
            calendarId = 'primary'
          }
        } catch (googleError) {
          console.error(`Failed to sync event "${draft.title}" to Google Calendar:`, googleError)
          syncErrors.push({
            draftId: draft.id,
            title: draft.title,
            error: googleError instanceof Error ? googleError.message : 'Unknown sync error'
          })
        }
      }

      // Create confirmed event in database
      const confirmedEvent = await prisma.event.create({
        data: {
          userId,
          taskId: draft.taskId,
          title: draft.title || 'Scheduled Task',
          startsAt: draft.startsAt,
          endsAt: draft.endsAt,
          externalId,
          calendarId,
          confirmed: true
        }
      })

      confirmedEvents.push(confirmedEvent)

      // Delete the draft since it's now confirmed
      await prisma.eventDraft.delete({
        where: { id: draft.id }
      })
    }

    // 4. Update Google OAuth credentials if they were refreshed
    if (oauth2Client?.credentials?.access_token) {
      const newCreds = oauth2Client.credentials
      await prisma.credential.updateMany({
        where: { userId, provider: 'GOOGLE' },
        data: {
          encryptedAccessToken: newCreds.access_token ? encryptToBytes(newCreds.access_token) : undefined,
          encryptedRefreshToken: newCreds.refresh_token ? encryptToBytes(newCreds.refresh_token) : undefined,
          expiresAt: newCreds.expiry_date ? new Date(newCreds.expiry_date) : undefined,
          scope: newCreds.scope,
        },
      })
    }

    return NextResponse.json({
      success: true,
      confirmedEvents,
      syncedToGoogle: syncToGoogle && syncErrors.length === 0,
      syncErrors: syncErrors.length > 0 ? syncErrors : undefined,
      metadata: {
        totalConfirmed: confirmedEvents.length,
        syncAttempted: syncToGoogle,
        syncSuccessful: syncErrors.length === 0
      }
    })

  } catch (error) {
    console.error('Event confirmation error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to confirm events',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Delete event drafts or confirmed events
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const userId = (session.user as any).id as string
  const { searchParams } = new URL(req.url)
  const eventDraftIdsFromQuery = searchParams.get('draftIds')?.split(',') || []
  const eventIdsFromQuery = searchParams.get('eventIds')?.split(',') || []

  // Support passing IDs via JSON body as well as query params
  let eventDraftIds = eventDraftIdsFromQuery
  let eventIds = eventIdsFromQuery

  if (eventDraftIds.length === 0 && eventIds.length === 0) {
    try {
      const contentType = req.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const body = await req.json().catch(() => null)
        const bodyDraftIds = Array.isArray(body?.draftIds)
          ? body.draftIds
          : Array.isArray(body?.eventDraftIds)
          ? body.eventDraftIds
          : []
        const bodyEventIds = Array.isArray(body?.eventIds) ? body.eventIds : []
        const genericIds = Array.isArray(body?.ids) ? body.ids : []
        // If generic ids provided, treat them as event ids initially; we'll reclassify below
        const candidateIds = genericIds.length > 0 ? genericIds : []
        if (eventDraftIds.length === 0) eventDraftIds = bodyDraftIds
        if (eventIds.length === 0) eventIds = bodyEventIds.length > 0 ? bodyEventIds : candidateIds
      }
    } catch {
      // ignore body parsing errors; we'll validate below
    }
  }

  if ((eventDraftIds?.length || 0) === 0 && (eventIds?.length || 0) === 0) {
    return NextResponse.json({ error: 'Event draft IDs or event IDs required' }, { status: 400 })
  }

  try {
    let deletedDraftsCount = 0
    let deletedEventsCount = 0
    const syncErrors = []

    // If some provided eventIds actually correspond to draft IDs, reclassify them
    if (eventIds.length > 0) {
      const overlappingDrafts = await prisma.eventDraft.findMany({
        where: { id: { in: eventIds }, userId },
        select: { id: true },
      })
      if (overlappingDrafts.length > 0) {
        const overlapIds = new Set(overlappingDrafts.map(d => d.id))
        // Add to draft list
        const mergedDrafts = new Set([...(eventDraftIds || []), ...Array.from(overlapIds)])
        eventDraftIds = Array.from(mergedDrafts)
        // Remove from event deletion list
        eventIds = eventIds.filter(id => !overlapIds.has(id))
      }
    }

    // Delete event drafts (mark as deleted instead of actually deleting)
    if (eventDraftIds.length > 0) {
      const draftResult = await prisma.eventDraft.updateMany({
        where: {
          id: { in: eventDraftIds },
          userId
        },
        data: { status: 'DELETED' }
      })
      deletedDraftsCount = draftResult.count
    }

    // Delete confirmed events
    if (eventIds.length > 0) {
      // Get events to check for Google Calendar sync before deletion
      const eventsToDelete = await prisma.event.findMany({
        where: {
          id: { in: eventIds },
          userId
        }
      })

      // Setup Google Calendar client for deletion
      let calendar = null
      let oauth2Client = null

      try {
        const cred = await prisma.credential.findFirst({
          where: { userId, provider: 'GOOGLE' }
        })

        if (cred) {
          const accessToken = decryptFromBytes(cred.encryptedAccessToken)
          const refreshToken = decryptFromBytes(cred.encryptedRefreshToken)
          const redirectUri = new URL('/api/integrations/connect/google/callback', req.nextUrl.origin).toString()

          oauth2Client = createGoogleOAuthClient({
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            redirectUri
          })

          if (accessToken) {
            oauth2Client.setCredentials({
              access_token: accessToken,
              refresh_token: refreshToken ?? undefined
            })
            calendar = createGoogleCalendarClient(oauth2Client)
          }
        }
      } catch (error) {
        console.warn('Failed to setup Google Calendar client for event deletion:', error)
      }

      // Delete from Google Calendar if synced
      for (const event of eventsToDelete) {
        if (event.externalId && event.calendarId && calendar) {
          try {
            await calendar.events.delete({
              calendarId: event.calendarId,
              eventId: event.externalId
            })
          } catch (googleError) {
            console.error(`Failed to delete event "${event.title}" from Google Calendar:`, googleError)
            syncErrors.push({
              eventId: event.id,
              title: event.title,
              error: googleError instanceof Error ? googleError.message : 'Unknown sync error'
            })
          }
        }
      }

      // Delete from local database
      const eventResult = await prisma.event.deleteMany({
        where: {
          id: { in: eventIds },
          userId
        }
      })
      deletedEventsCount = eventResult.count

      // Update Google OAuth credentials if they were refreshed
      if (oauth2Client?.credentials?.access_token) {
        const newCreds = oauth2Client.credentials
        await prisma.credential.updateMany({
          where: { userId, provider: 'GOOGLE' },
          data: {
            encryptedAccessToken: newCreds.access_token ? Buffer.from(newCreds.access_token) : undefined,
            encryptedRefreshToken: newCreds.refresh_token ? Buffer.from(newCreds.refresh_token) : undefined,
            expiresAt: newCreds.expiry_date ? new Date(newCreds.expiry_date) : undefined,
            scope: newCreds.scope,
          },
        })
      }
    }

    return NextResponse.json({
      success: true,
      deletedDraftsCount,
      deletedEventsCount,
      totalDeleted: deletedDraftsCount + deletedEventsCount,
      syncErrors: syncErrors.length > 0 ? syncErrors : undefined
    })
  } catch (error) {
    console.error('Failed to delete events:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to delete events'
    }, { status: 500 })
  }
}
