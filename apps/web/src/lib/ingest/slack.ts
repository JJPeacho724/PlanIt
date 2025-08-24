import { prisma } from '@/lib/clients/prisma'
import { decryptFromBytes } from '@/lib/crypto'
import { createSlackClient } from '@/lib/clients/slack'
import crypto from 'node:crypto'
import { evaluateMessageForAction } from '@acme/core'

function hashId(id: string) {
  return crypto.createHash('sha256').update(id).digest('hex')
}

export async function ingestSlackForUser(params: { userId: string }) {
  const { userId } = params
  const cred = await prisma.credential.findFirst({ where: { userId, provider: 'SLACK' } })
  if (!cred) return { ok: false, reason: 'not_connected' as const }

  const token = decryptFromBytes(cred.encryptedAccessToken)
  if (!token) return { ok: false, reason: 'missing_token' as const }
  const slack = createSlackClient(token)

  const cursor = await prisma.ingestCursor.findUnique({ where: { userId_source: { userId, source: 'SLACK' } } })
  let nextCursor: string | undefined = cursor?.cursor ?? undefined

  const createdTaskIds: string[] = []
  const convList = await slack.conversations.list({ types: 'im,mpim' })
  const channels = (convList.channels ?? []) as any[]
  for (const ch of channels) {
    let hasMore = true
    let slackCursor = nextCursor
    while (hasMore) {
      const history = await slack.conversations.history({ channel: ch.id, limit: 200, cursor: slackCursor }) as any
      hasMore = history.has_more
      slackCursor = history.response_metadata?.next_cursor

      for (const msg of (history.messages ?? [])) {
        if (!msg.ts) continue
        const messageId = `${ch.id}:${msg.ts}`
        const hashedId = hashId(`slack:${messageId}`)
        const text: string = msg.text ?? ''
        const receivedAt = new Date(Math.floor(parseFloat(msg.ts) * 1000))
        const mi = await prisma.messageIngest.upsert({
          where: { hashedMessageId: hashedId },
          create: {
            userId,
            source: 'SLACK',
            hashedMessageId: hashedId,
            receivedAt,
            metadata: { channel: ch.id, ts: msg.ts, text },
          },
          update: {},
        })

        const evaluation = evaluateMessageForAction({ subject: undefined, text, headers: undefined })
        if (!evaluation.isActionable) continue

        const task = await prisma.task.create({
          data: {
            userId,
            source: 'SLACK',
            title: text.slice(0, 80) || 'Slack follow up',
            description: `Channel: ${ch.id}\nTS: ${msg.ts}\nReasons: ${evaluation.reasons.join(', ')}`,
            createdFromMessageId: mi.id,
            tags: ['slack'],
          },
        })
        createdTaskIds.push(task.id)
      }
    }
    nextCursor = undefined
  }

  await prisma.ingestCursor.upsert({
    where: { userId_source: { userId, source: 'SLACK' } },
    create: { userId, source: 'SLACK', cursor: nextCursor ?? null, lastFetchedAt: new Date() },
    update: { cursor: nextCursor ?? null, lastFetchedAt: new Date() },
  })

  return { ok: true as const, createdTasks: createdTaskIds }
}

