import { prisma } from '@/lib/clients/prisma'
import { decryptFromBytes, encryptToBytes } from '@/lib/crypto'
import { env } from '@acme/core'
import { evalFocusedEmail } from '@/lib/email/focus'
import { createGoogleOAuthClient, createGmailClient } from '@/lib/clients/google'
import crypto from 'node:crypto'
import { evaluateMessageForAction } from '@acme/core'
import { openai } from '@/lib/clients/openai'
import { detectCalendarInviteFromEmail } from '@/lib/email-calendar-extract'

function hashId(id: string) {
  return crypto.createHash('sha256').update(id).digest('hex')
}

function extractEmailBody(payload: any): string {
  if (!payload) return ''
  
  // Check if the email has parts (multipart)
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8')
      }
      // Recursively check nested parts
      if (part.parts) {
        const nestedBody = extractEmailBody(part)
        if (nestedBody) return nestedBody
      }
    }
    // If no plain text found, try HTML
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        const htmlContent = Buffer.from(part.body.data, 'base64').toString('utf-8')
        // Basic HTML to text conversion (strip tags)
        return htmlContent.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
      }
    }
  }
  
  // Check if it's a simple email without parts
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8')
  }
  
  return ''
}

export async function ingestGmailForUser(params: { userId: string; origin: string }) {
  const { userId, origin } = params
  const cred = await prisma.credential.findFirst({ where: { userId, provider: 'GOOGLE' } })
  if (!cred) return { ok: false, reason: 'not_connected' as const }

  const accessToken = decryptFromBytes(cred.encryptedAccessToken)
  const refreshToken = decryptFromBytes(cred.encryptedRefreshToken)
  const redirectUri = new URL('/api/integrations/connect/google/callback', origin).toString()
  const oauth2Client = createGoogleOAuthClient({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri })
  
  if (accessToken) {
    oauth2Client.setCredentials({ 
      access_token: accessToken, 
      refresh_token: refreshToken ?? undefined,
      expiry_date: cred.expiresAt?.getTime()
    })
  }

  // Try to refresh token if it's expired, about to expire, or expiresAt is null
  try {
    const shouldRefresh = !cred.expiresAt ||
      cred.expiresAt.getTime() <= Date.now() + 5 * 60 * 1000 || // Refresh if expires within 5 minutes
      cred.expiresAt.getTime() <= Date.now() // Already expired

    if (shouldRefresh) {
      console.log(`Refreshing token for user ${userId} - expiresAt: ${cred.expiresAt}, reason: ${!cred.expiresAt ? 'null_expiry' : cred.expiresAt.getTime() <= Date.now() ? 'expired' : 'expiring_soon'}`)
      await oauth2Client.refreshAccessToken()

      // Save the new tokens
      const newCreds = oauth2Client.credentials
      if (newCreds.access_token) {
        await prisma.credential.updateMany({
          where: { userId, provider: 'GOOGLE' },
          data: {
            encryptedAccessToken: encryptToBytes(newCreds.access_token),
            encryptedRefreshToken: newCreds.refresh_token ? encryptToBytes(newCreds.refresh_token) : undefined,
            expiresAt: newCreds.expiry_date ? new Date(newCreds.expiry_date) : new Date(Date.now() + 3600 * 1000), // Default to 1 hour if no expiry provided
            scope: newCreds.scope,
          },
        })
        console.log(`Token refreshed successfully for user ${userId}, new expiry: ${newCreds.expiry_date ? new Date(newCreds.expiry_date) : '1 hour from now'}`)
      }
    }
  } catch (refreshError) {
    console.error(`Token refresh failed for user ${userId}:`, refreshError)

    // If refresh token is invalid/expired, mark credentials as needing re-auth
    if (refreshError.message?.includes('invalid_grant') || refreshError.message?.includes('Token has been expired')) {
      console.log(`Refresh token expired for user ${userId}, marking as disconnected`)
      await prisma.credential.updateMany({
        where: { userId, provider: 'GOOGLE' },
        data: {
          encryptedAccessToken: null,
          encryptedRefreshToken: null,
          expiresAt: null,
        },
      })
      return { ok: false, reason: 'refresh_token_expired' as const }
    }

    return { ok: false, reason: 'token_refresh_failed' as const }
  }

  const gmail = createGmailClient(oauth2Client)

  const cursor = await prisma.ingestCursor.findUnique({ where: { userId_source: { userId, source: 'EMAIL' } } })
  let pageToken: string | undefined = cursor?.cursor ?? undefined

  const createdTaskIds: string[] = []
  const focusedEnabled = (env.EMAIL_FOCUSED_INGEST || 'false').toLowerCase() === 'true'
  const q = focusedEnabled
    ? [
      'in:inbox',
      '(category:primary OR category:updates)',
      '-category:promotions',
      '-category:social',
      '-category:forums',
      'newer_than:5d',
    ].join(' ')
    : `newer_than:5d label:INBOX`
  let nextPageToken: string | undefined
  let processedCount = 0
  const maxProcessPerRun = 10 // Limit to prevent rate limiting
  
  try {
    do {
      const list = await gmail.users.messages.list({ userId: 'me', q, pageToken, maxResults: 50 })
      nextPageToken = list.data.nextPageToken ?? undefined
      const messages = list.data.messages ?? []
      if (messages.length === 0) break

      for (const m of messages) {
        // Rate limiting: only process a limited number of emails per run
        if (processedCount >= maxProcessPerRun) {
          console.log(`Rate limiting: processed ${processedCount} emails, stopping to prevent API limits`)
          break
        }
        processedCount++
        if (!m.id) continue
        
        try {
          const detail = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' })
          const headers = (detail.data.payload?.headers ?? []).reduce<Record<string, string>>((acc, h) => {
            if (h.name && h.value) acc[h.name] = h.value
            return acc
          }, {})
          const subject = (detail.data.payload?.headers ?? []).find(h => h.name?.toLowerCase() === 'subject')?.value ?? ''
          const fromHdr = (detail.data.payload?.headers ?? []).find(h => h.name?.toLowerCase() === 'from')?.value
          const receivedMs = detail.data.internalDate ? Number(detail.data.internalDate) : Date.now()
          const bodyText = extractEmailBody(detail.data.payload) || detail.data.snippet || ''
          const bodyHtmlPart = (() => {
            try {
              if (!detail.data.payload) return ''
              const stack = [detail.data.payload]
              while (stack.length) {
                const part: any = stack.pop()
                if (part.mimeType === 'text/html' && part.body?.data) {
                  return Buffer.from(part.body.data, 'base64').toString('utf-8')
                }
                if (part.parts) stack.push(...part.parts)
              }
              return ''
            } catch {
              return ''
            }
          })()

          // Parse from email/domain
          const fromMatch = (fromHdr || '').match(/<([^>]+)>/) || []
          const fromEmail = (fromMatch[1] || fromHdr || '').trim()
          const fromDomain = fromEmail.includes('@') ? fromEmail.split('@')[1].toLowerCase() : ''

          // Thread metadata (lightweight placeholder; extend if needed)
          const threadMeta = { replyCount: (detail.data?.sizeEstimate ? 1 : 0), userReplied: false, participants: 0 }

          // Detect calendar invites EARLY to force allow before gating
          const calendarDetection = await detectCalendarInviteFromEmail({
            subject,
            bodyText,
            from: fromHdr || 'unknown',
            headers,
          })
          const icsForceAllow = Boolean(calendarDetection?.isCalendarInvite)

          // Evaluate focus if enabled
          const { score, reason, forceAllow } = focusedEnabled
            ? evalFocusedEmail({
                headers,
                subject,
                plain: bodyText,
                fromEmail,
                fromDomain,
                threadMetadata: threadMeta,
              })
            : { score: 0, reason: 'disabled', forceAllow: false }
          const computedIsFocused = focusedEnabled ? (icsForceAllow || forceAllow || score >= 0.6) : true
          const computedFocusReason = focusedEnabled ? (icsForceAllow ? 'calendar_invite' : reason) : 'disabled'

          const hashedMessageId = hashId(`gmail:${m.id}`)
          const msg = await prisma.messageIngest.upsert({
            where: { hashedMessageId },
            create: {
              userId,
              source: 'EMAIL',
              hashedMessageId,
              receivedAt: new Date(receivedMs),
              metadata: { id: m.id, from: fromHdr, subject, headers, bodyText: bodyText.slice(0, 5000) },
              // New denormalized fields for focused inbox
              fromEmail,
              fromDomain,
              subject,
              headers,
              bodyPlain: bodyText,
              bodyHtml: bodyHtmlPart || undefined,
              snippet: detail.data.snippet || undefined,
              isFocused: computedIsFocused,
              focusedScore: focusedEnabled ? score : 1,
              focusReason: computedFocusReason,
            },
            update: {
              // Keep metadata in sync and update focus flags on re-ingest
              metadata: { id: m.id, from: fromHdr, subject, headers, bodyText: bodyText.slice(0, 5000) },
              fromEmail,
              fromDomain,
              subject,
              headers,
              bodyPlain: bodyText,
              bodyHtml: bodyHtmlPart || undefined,
              snippet: detail.data.snippet || undefined,
              ...(focusedEnabled ? { isFocused: computedIsFocused, focusedScore: score, focusReason: computedFocusReason } : {}),
            },
          })

          // Gate downstream work if focused ingest enabled
          if (focusedEnabled) {
            if (!computedIsFocused) continue
          }

          const evaluation = evaluateMessageForAction({ subject, text: bodyText, headers })

          // Mark as actionable if it's either a general action OR a calendar invite
          const actionableForTask = evaluation.isActionable || calendarDetection.isCalendarInvite
          if (!actionableForTask) continue

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
          } catch (error) {
            // fall back to subject if rate limited or other error
            if (error.code === 'rate_limit_exceeded') {
              console.log('OpenAI rate limit hit, using subject as title')
            }
            // fall back to subject
          }

          // Enhanced task creation with calendar context
          let taskDescription = `From: ${fromHdr ?? 'unknown'}\nGmail ID: ${m.id}\n`
          let taskTags = ['email']
          
          if (evaluation.isActionable) {
            taskDescription += `Action Reasons: ${evaluation.reasons.join(', ')}\n`
          }
          
          if (calendarDetection.isCalendarInvite) {
            taskDescription += `Calendar Detection: ${calendarDetection.reasoning}\n`
            if (calendarDetection.events.length > 0) {
              taskDescription += `Events: ${calendarDetection.events.map(e => `${e.title} on ${e.date} at ${e.time}`).join(', ')}\n`
            }
            taskTags.push('calendar', 'meeting')
          }

          const task = await prisma.task.create({
            data: {
              userId,
              source: 'EMAIL',
              title,
              description: taskDescription.trim(),
              createdFromMessageId: msg.id,
              tags: taskTags,
              // Set higher priority for calendar invites
              priority: calendarDetection.isCalendarInvite ? 3 : (evaluation.reasons.some(r => r.includes('urgent') || r.includes('asap')) ? 2 : 1),
            },
          })
          createdTaskIds.push(task.id)
        } catch (messageError) {
          console.error(`Failed to process message ${m.id} for user ${userId}:`, messageError)
          // Continue processing other messages
        }
      }
      pageToken = nextPageToken
    } while (nextPageToken)
  } catch (gmailError) {
    console.error(`Gmail API error for user ${userId}:`, gmailError)
    
    // Check if it's an OAuth error
    if (gmailError.code === 401 || gmailError.message?.includes('invalid_grant') || gmailError.message?.includes('Token has been expired')) {
      return { ok: false, reason: 'oauth_expired' as const }
    }
    
    return { ok: false, reason: 'gmail_api_error' as const }
  }

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
        expiresAt: newCreds.expiry_date ? new Date(newCreds.expiry_date) : new Date(Date.now() + 3600 * 1000), // Default to 1 hour if no expiry provided
        scope: newCreds.scope,
      },
    })
  }

  return { ok: true as const, createdTasks: createdTaskIds }
}

