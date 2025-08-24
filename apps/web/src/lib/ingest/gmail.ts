import { prisma } from '@/lib/clients/prisma'
import { decryptFromBytes, encryptToBytes } from '@/lib/crypto'
import { env } from '@acme/core'
import { createGoogleOAuthClient, createGmailClient } from '@/lib/clients/google'
import crypto from 'node:crypto'
import { evaluateMessageForAction } from '@acme/core'
import { openai } from '@/lib/clients/openai'

function hashId(id: string) {
  return crypto.createHash('sha256').update(id).digest('hex')
}

export async function ingestGmailForUser(params: { userId: string; origin: string }) {
  const { userId, origin } = params
  const cred = await prisma.credential.findFirst({ where: { userId, provider: 'GOOGLE' } })
  if (!cred) return { ok: false, reason: 'not_connected' as const }

  const accessToken = decryptFromBytes(cred.encryptedAccessToken)
  const refreshToken = decryptFromBytes(cred.encryptedRefreshToken)
  const redirectUri = new URL('/api/integrations/connect/google/callback', origin).toString()
  const oauth2Client = createGoogleOAuthClient({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri })
  if (accessToken) oauth2Client.setCredentials({ access_token: accessToken, refresh_token: refreshToken ?? undefined })
  const gmail = createGmailClient(oauth2Client)

  const cursor = await prisma.ingestCursor.findUnique({ where: { userId_source: { userId, source: 'EMAIL' } } })
  let pageToken: string | undefined = cursor?.cursor ?? undefined

  const createdTaskIds: string[] = []
  const q = `newer_than:30d label:INBOX`
  let nextPageToken: string | undefined
  do {
    const list = await gmail.users.messages.list({ userId: 'me', q, pageToken, maxResults: 50 })
    nextPageToken = list.data.nextPageToken ?? undefined
    const messages = list.data.messages ?? []
    if (messages.length === 0) break

    for (const m of messages) {
      if (!m.id) continue
      const detail = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' })
      const headers = (detail.data.payload?.headers ?? []).reduce<Record<string, string>>((acc, h) => {
        if (h.name && h.value) acc[h.name] = h.value
        return acc
      }, {})
      const subject = (detail.data.payload?.headers ?? []).find(h => h.name?.toLowerCase() === 'subject')?.value ?? ''
      const fromHdr = (detail.data.payload?.headers ?? []).find(h => h.name?.toLowerCase() === 'from')?.value
      const receivedMs = detail.data.internalDate ? Number(detail.data.internalDate) : Date.now()
      const bodyText = detail.data.snippet ?? ''

      const hashedMessageId = hashId(`gmail:${m.id}`)
      const msg = await prisma.messageIngest.upsert({
        where: { hashedMessageId },
        create: {
          userId,
          source: 'EMAIL',
          hashedMessageId,
          receivedAt: new Date(receivedMs),
          metadata: { id: m.id, from: fromHdr, subject, headers },
        },
        update: {},
      })

      const evaluation = evaluateMessageForAction({ subject, text: bodyText, headers })
      if (!evaluation.isActionable) continue

      let title = subject || 'Follow up email'
      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'Extract a concise actionable task title (max 80 chars).' },
            { role: 'user', content: `${subject}\n\n${bodyText}` },
          ],
          temperature: 0.2,
          max_tokens: 64,
        })
        title = completion.choices?.[0]?.message?.content?.trim() || title
      } catch {
        // fall back to subject
      }

      const task = await prisma.task.create({
        data: {
          userId,
          source: 'EMAIL',
          title,
          description: `From: ${fromHdr ?? 'unknown'}\nGmail ID: ${m.id}\nReasons: ${evaluation.reasons.join(', ')}`,
          createdFromMessageId: msg.id,
          tags: ['email'],
        },
      })
      createdTaskIds.push(task.id)
    }
    pageToken = nextPageToken
  } while (nextPageToken)

  await prisma.ingestCursor.upsert({
    where: { userId_source: { userId, source: 'EMAIL' } },
    create: { userId, source: 'EMAIL', cursor: pageToken ?? null, lastFetchedAt: new Date() },
    update: { cursor: pageToken ?? null, lastFetchedAt: new Date() },
  })

  const newCreds = oauth2Client.credentials
  if (newCreds.access_token) {
    await prisma.credential.updateMany({
      where: { userId, provider: 'GOOGLE' },
      data: {
        encryptedAccessToken: encryptToBytes(newCreds.access_token),
        encryptedRefreshToken: newCreds.refresh_token ? encryptToBytes(newCreds.refresh_token) : undefined,
        expiresAt: newCreds.expiry_date ? new Date(newCreds.expiry_date) : undefined,
        scope: newCreds.scope,
      },
    })
  }

  return { ok: true as const, createdTasks: createdTaskIds }
}

