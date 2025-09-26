import { prisma } from '@/lib/clients/prisma'
import { decryptFromBytes, encryptToBytes } from '@/lib/crypto'
import { env } from '@acme/core'
import { createGoogleOAuthClient, createGoogleCalendarClient } from '@/lib/clients/google'

export async function cacheCalendarBusyForUser(params: { userId: string; origin: string }) {
  const { userId, origin } = params
  const cred = await prisma.credential.findFirst({ where: { userId, provider: 'GOOGLE' }, orderBy: { updatedAt: 'desc' } })
  if (!cred) return { ok: false, reason: 'not_connected' as const }

  const accessToken = decryptFromBytes(cred.encryptedAccessToken)
  const refreshToken = decryptFromBytes(cred.encryptedRefreshToken)
  const redirectUri = new URL('/api/integrations/connect/google/callback', origin).toString()
  const oauth2Client = createGoogleOAuthClient({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri })
  if (accessToken || refreshToken) {
    oauth2Client.setCredentials({
      access_token: accessToken ?? undefined,
      refresh_token: refreshToken ?? undefined,
      expiry_date: cred.expiresAt?.getTime(),
    })
  }

  // Proactively refresh if token is expired or expiring soon
  try {
    const shouldRefresh = !!refreshToken && (
      !cred.expiresAt ||
      cred.expiresAt.getTime() <= Date.now() ||
      cred.expiresAt.getTime() <= Date.now() + 5 * 60 * 1000
    )
    if (shouldRefresh) {
      await oauth2Client.refreshAccessToken()
      const newCreds = oauth2Client.credentials
      if (newCreds.access_token) {
        await prisma.credential.updateMany({
          where: { userId, provider: 'GOOGLE' },
          data: {
            encryptedAccessToken: encryptToBytes(newCreds.access_token),
            encryptedRefreshToken: newCreds.refresh_token ? encryptToBytes(newCreds.refresh_token) : undefined,
            expiresAt: newCreds.expiry_date ? new Date(newCreds.expiry_date) : new Date(Date.now() + 3600 * 1000),
            scope: newCreds.scope,
          },
        })
      }
    }
  } catch (err) {
    console.warn(`Calendar token refresh failed for user ${userId}:`, err)
  }

  const calendar = createGoogleCalendarClient(oauth2Client)

  const timeMin = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const timeMax = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()

  // List calendars with a single retry on 401 after refresh
  const listCalendars = async () => {
    try {
      return await calendar.calendarList.list()
    } catch (e: any) {
      if ((e?.code === 401 || e?.response?.status === 401) && refreshToken) {
        try {
          await oauth2Client.refreshAccessToken()
          const newCreds = oauth2Client.credentials
          if (newCreds.access_token) {
            await prisma.credential.updateMany({
              where: { userId, provider: 'GOOGLE' },
              data: {
                encryptedAccessToken: encryptToBytes(newCreds.access_token),
                encryptedRefreshToken: newCreds.refresh_token ? encryptToBytes(newCreds.refresh_token) : undefined,
                expiresAt: newCreds.expiry_date ? new Date(newCreds.expiry_date) : new Date(Date.now() + 3600 * 1000),
                scope: newCreds.scope,
              },
            })
          }
          return await calendar.calendarList.list()
        } catch (e2) {
          console.warn('Failed to refresh token after 401 when listing calendars:', e2)
          throw e
        }
      }
      throw e
    }
  }

  const cals = await listCalendars()
  const calendars = cals.data.items ?? []
  // Build a quick lookup for calendar colors
  const calendarIdToColors: Record<string, { backgroundColor?: string; foregroundColor?: string }> = {}
  for (const cal of calendars) {
    if (cal.id) {
      calendarIdToColors[cal.id] = {
        backgroundColor: (cal as any).backgroundColor,
        foregroundColor: (cal as any).foregroundColor,
      }
    }
  }
  let count = 0
  const seenIds = new Set<string>()
  for (const cal of calendars) {
    if (!cal.id) continue
    let pageToken: string | undefined
    do {
      // List events with a single retry on 401 after refresh
      const listEvents = async () => {
        try {
          return await calendar.events.list({ calendarId: cal.id as string, pageToken, singleEvents: true, timeMin, timeMax, maxResults: 2500, orderBy: 'startTime' })
        } catch (e: any) {
          if ((e?.code === 401 || e?.response?.status === 401) && refreshToken) {
            try {
              await oauth2Client.refreshAccessToken()
              const newCreds = oauth2Client.credentials
              if (newCreds.access_token) {
                await prisma.credential.updateMany({
                  where: { userId, provider: 'GOOGLE' },
                  data: {
                    encryptedAccessToken: encryptToBytes(newCreds.access_token),
                    encryptedRefreshToken: newCreds.refresh_token ? encryptToBytes(newCreds.refresh_token) : undefined,
                    expiresAt: newCreds.expiry_date ? new Date(newCreds.expiry_date) : new Date(Date.now() + 3600 * 1000),
                    scope: newCreds.scope,
                  },
                })
              }
              return await calendar.events.list({ calendarId: cal.id as string, pageToken, singleEvents: true, timeMin, timeMax, maxResults: 2500, orderBy: 'startTime' })
            } catch (e2) {
              console.warn('Failed to refresh token after 401 when listing events:', e2)
              throw e
            }
          }
          throw e
        }
      }

      const events = await listEvents()
      pageToken = events.data.nextPageToken ?? undefined
      for (const ev of events.data.items ?? []) {
        const externalId = ev.id
        if (!externalId) continue
        seenIds.add(externalId)
        const startIso = ev.start?.dateTime ?? ev.start?.date
        const endIso = ev.end?.dateTime ?? ev.end?.date
        if (!startIso || !endIso) continue
        const startsAt = new Date(startIso)
        const endsAt = new Date(endIso)
        const isAllDay = !!ev.start?.date && !ev.start?.dateTime
        const calColors = calendarIdToColors[cal.id as string] || {}
        const bgColor = calColors.backgroundColor
        const fgColor = calColors.foregroundColor
        await prisma.calendarBusy.upsert({
          where: { userId_externalEventId: { userId, externalEventId: externalId } },
          create: {
            userId,
            source: 'CALENDAR',
            externalEventId: externalId,
            calendarId: cal.id,
            title: ev.summary ?? null,
            startsAt,
            endsAt,
            metadata: { status: ev.status, transparency: ev.transparency, organizer: ev.organizer, color: bgColor, textColor: fgColor, allDay: isAllDay, primary: Boolean((cal as any).primary) },
          },
          update: {
            calendarId: cal.id,
            title: ev.summary ?? null,
            startsAt,
            endsAt,
            metadata: { status: ev.status, transparency: ev.transparency, organizer: ev.organizer, color: bgColor, textColor: fgColor, allDay: isAllDay, primary: Boolean((cal as any).primary) },
          },
        })
        count++
      }
    } while (pageToken)
  }
  // Cleanup: delete stale entries that no longer appear in Google within window
  try {
    const stale = await prisma.calendarBusy.findMany({
      where: {
        userId,
        startsAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
        endsAt: { lte: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) },
      },
      select: { id: true, externalEventId: true },
    })
    const toDelete = stale.filter(s => s.externalEventId && !seenIds.has(s.externalEventId)).map(s => s.id)
    if (toDelete.length > 0) {
      await prisma.calendarBusy.deleteMany({ where: { id: { in: toDelete } } })
    }
  } catch (cleanupErr) {
    console.warn('Calendar busy cleanup failed:', cleanupErr)
  }
  return { ok: true as const, cached: count }
}

