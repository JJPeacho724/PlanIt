#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client'
import { cacheCalendarBusyForUser } from '@/lib/ingest/calendar'

const prisma = new PrismaClient()

async function main() {
  console.log('🔎 Debugging Google Calendar cache...')
  try {
    const user = await prisma.user.findFirst({
      include: { credentials: { where: { provider: 'GOOGLE' }, orderBy: { updatedAt: 'desc' } } },
      orderBy: { createdAt: 'asc' },
    })
    if (!user) {
      console.log('❌ No users found in database')
      return
    }
    const cred = user.credentials?.[0]
    if (!cred) {
      console.log(`❌ User ${user.email ?? user.id} has no Google credential. Re-connect Google.`)
      return
    }

    console.log(`👤 User: ${user.email ?? user.id}`)
    console.log(`🔐 Scope: ${cred.scope ?? '(none)'}`)

    console.log('⏳ Running cacheCalendarBusyForUser...')
    const res = await cacheCalendarBusyForUser({ userId: user.id, origin: 'http://localhost:3000' })
    console.log('📦 Refresh result:', res)

    const count = await prisma.calendarBusy.count({ where: { userId: user.id } })
    console.log(`🗓️ Cached busy events in DB: ${count}`)

    const recent = await prisma.calendarBusy.findMany({
      where: { userId: user.id },
      orderBy: { startsAt: 'desc' },
      take: 5,
      select: { id: true, title: true, startsAt: true, endsAt: true, calendarId: true, externalEventId: true },
    })
    console.log('🔬 Sample (most recent 5):')
    for (const r of recent) {
      console.log(`- ${r.title ?? 'Busy'} | ${r.startsAt.toISOString()} → ${r.endsAt.toISOString()} | cal=${r.calendarId} id=${r.externalEventId}`)
    }
  } catch (err) {
    console.error('💥 Error:', err)
  } finally {
    await prisma.$disconnect()
  }
}

main()


