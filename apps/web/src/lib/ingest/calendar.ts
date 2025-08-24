import { prisma } from '@/lib/clients/prisma'
import { decryptFromBytes } from '@/lib/crypto'
import { env } from '@acme/core'
import { createGoogleOAuthClient, createGoogleCalendarClient } from '@/lib/clients/google'

export async function cacheCalendarBusyForUser(params: { userId: string; origin: string }) {
  const { userId, origin } = params
  const cred = await prisma.credential.findFirst({ where: { userId, provider: 'GOOGLE' } })
  if (!cred) return { ok: false, reason: 'not_connected' as const }

  const accessToken = decryptFromBytes(cred.encryptedAccessToken)
  const refreshToken = decryptFromBytes(cred.encryptedRefreshToken)
  const redirectUri = new URL('/api/integrations/connect/google/callback', origin).toString()
  const oauth2Client = createGoogleOAuthClient({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri })
  if (accessToken) oauth2Client.setCredentials({ access_token: accessToken, refresh_token: refreshToken ?? undefined })
  const calendar = createGoogleCalendarClient(oauth2Client)

  const timeMin = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const timeMax = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()

  const cals = await calendar.calendarList.list()
  const calendars = cals.data.items ?? []
  let count = 0
  for (const cal of calendars) {
    if (!cal.id) continue
    let pageToken: string | undefined
    do {
      const events = await calendar.events.list({ calendarId: cal.id, pageToken, singleEvents: true, timeMin, timeMax, maxResults: 2500, orderBy: 'startTime' })
      pageToken = events.data.nextPageToken ?? undefined
      for (const ev of events.data.items ?? []) {
        const externalId = ev.id
        if (!externalId) continue
        const startIso = ev.start?.dateTime ?? ev.start?.date
        const endIso = ev.end?.dateTime ?? ev.end?.date
        if (!startIso || !endIso) continue
        const startsAt = new Date(startIso)
        const endsAt = new Date(endIso)
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
            metadata: { status: ev.status, transparency: ev.transparency, organizer: ev.organizer },
          },
          update: {
            calendarId: cal.id,
            title: ev.summary ?? null,
            startsAt,
            endsAt,
            metadata: { status: ev.status, transparency: ev.transparency, organizer: ev.organizer },
          },
        })
        count++
      }
    } while (pageToken)
  }
  return { ok: true as const, cached: count }
}

