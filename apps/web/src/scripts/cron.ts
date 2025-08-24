import { prisma } from '@/lib/clients/prisma'
import { ingestGmailForUser } from '@/lib/ingest/gmail'
import { ingestSlackForUser } from '@/lib/ingest/slack'
import { cacheCalendarBusyForUser } from '@/lib/ingest/calendar'

async function run() {
  const users = await prisma.user.findMany({ select: { id: true } })
  const origin = process.env.NEXTAUTH_URL || 'http://localhost:3000'
  for (const u of users) {
    await Promise.allSettled([
      ingestGmailForUser({ userId: u.id, origin }),
      ingestSlackForUser({ userId: u.id }),
      cacheCalendarBusyForUser({ userId: u.id, origin }),
    ])
  }
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })

