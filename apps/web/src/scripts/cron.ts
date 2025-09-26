import { prisma } from '@/lib/clients/prisma'
import { ingestGmailForUser } from '@/lib/ingest/gmail'
import { ingestSlackForUser } from '@/lib/ingest/slack'
import { cacheCalendarBusyForUser } from '@/lib/ingest/calendar'
import { refreshExpiringTokens } from '@/lib/auto-ingest'

async function run() {
  const origin = process.env.NEXTAUTH_URL || 'http://localhost:3000'

  // First, refresh any expiring tokens to prevent sync failures
  console.log('Running proactive token refresh...')
  const refreshResult = await refreshExpiringTokens(origin)
  console.log(`Token refresh result: ${refreshResult.successCount} successful, ${refreshResult.failureCount} failed`)

  // Then run the regular ingestion tasks
  const users = await prisma.user.findMany({ select: { id: true } })
  for (const u of users) {
    await Promise.allSettled([
      ingestGmailForUser({ userId: u.id, origin }),
      ingestSlackForUser({ userId: u.id }),
      cacheCalendarBusyForUser({ userId: u.id, origin }),
    ])
  }
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })

