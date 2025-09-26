#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client'
import { evalFocusedEmail } from '@/lib/email/focus'

const prisma = new PrismaClient()

async function main() {
  const days = Number(process.env.BACKFILL_DAYS || 90)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  console.log(`Re-evaluating focused flags for emails since ${since.toISOString()}`)

  const batchSize = 200
  let skip = 0
  while (true) {
    const msgs = await prisma.messageIngest.findMany({
      where: { source: 'EMAIL', receivedAt: { gte: since } },
      orderBy: { receivedAt: 'desc' },
      take: batchSize,
      skip,
    })
    if (msgs.length === 0) break

    for (const m of msgs) {
      const headers = (m.headers as any) || (m.metadata as any)?.headers || {}
      const subject = m.subject || (m.metadata as any)?.subject || ''
      const fromEmail = m.fromEmail || (m.metadata as any)?.from || ''
      const fromDomain = m.fromDomain || (fromEmail.includes('@') ? fromEmail.split('@')[1] : '')
      const plain = m.bodyPlain || (m.metadata as any)?.bodyText || ''

      const { score, reason, forceAllow } = evalFocusedEmail({
        headers,
        subject,
        plain,
        fromEmail,
        fromDomain,
      })
      const isFocused = forceAllow || score >= 0.6

      await prisma.messageIngest.update({
        where: { id: m.id },
        data: { isFocused, focusedScore: score, focusReason: reason },
      })
    }

    skip += msgs.length
    console.log(`Processed ${skip} messages...`)
  }

  console.log('Done re-evaluating focused flags.')
}

main().finally(() => prisma.$disconnect())


