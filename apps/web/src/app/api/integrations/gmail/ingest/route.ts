import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { prisma } from '@/lib/clients/prisma'
import { decryptFromBytes, encryptToBytes } from '@/lib/crypto'
import { env } from '@acme/core'
import { createGoogleOAuthClient, createGmailClient } from '@/lib/clients/google'
import crypto from 'node:crypto'

function hashId(id: string) {
  return crypto.createHash('sha256').update(id).digest('hex')
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string

  const cred = await prisma.credential.findFirst({ where: { userId, provider: 'GOOGLE' } })
  if (!cred) return NextResponse.json({ error: 'not connected' }, { status: 400 })

  const accessToken = decryptFromBytes(cred.encryptedAccessToken)
  const refreshToken = decryptFromBytes(cred.encryptedRefreshToken)
  const redirectUri = new URL('/api/integrations/connect/google/callback', req.nextUrl.origin).toString()
  const oauth2Client = createGoogleOAuthClient({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri })

  if (accessToken) oauth2Client.setCredentials({ access_token: accessToken, refresh_token: refreshToken ?? undefined })

  // Refresh if needed; token refresh handled by googleapis when expired
  const gmail = createGmailClient(oauth2Client)

  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
  const q = `newer_than:5d label:INBOX` // Gmail search query

  let nextPageToken: string | undefined
  const ingested: number = 0
  do {
    const list = await gmail.users.messages.list({ userId: 'me', q, pageToken: nextPageToken, maxResults: 100 })
    nextPageToken = list.data.nextPageToken ?? undefined
    const messages = list.data.messages ?? []
    if (messages.length === 0) break

    // Fetch details in batches
    for (const m of messages) {
      if (!m.id) continue
      const detail = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['Subject', 'From', 'To', 'Date'] })
      const receivedMs = detail.data.internalDate ? Number(detail.data.internalDate) : Date.now()
      const fromHdr = (detail.data.payload?.headers ?? []).find(h => h.name?.toLowerCase() === 'from')?.value
      const subject = (detail.data.payload?.headers ?? []).find(h => h.name?.toLowerCase() === 'subject')?.value

      const hashedMessageId = hashId(`gmail:${m.id}`)
      await prisma.messageIngest.upsert({
        where: { hashedMessageId },
        create: {
          userId,
          source: 'EMAIL',
          hashedMessageId,
          receivedAt: new Date(receivedMs),
          metadata: { id: m.id, from: fromHdr, subject },
        },
        update: {},
      })
    }
  } while (nextPageToken)

  // Persist refreshed tokens if they changed
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

  return NextResponse.json({ ok: true })
}

