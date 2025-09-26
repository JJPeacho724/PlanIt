import { prisma } from '@/lib/clients/prisma'
import { ingestGmailForUser } from '@/lib/ingest/gmail'
import { env } from '@acme/core'
import { createGoogleOAuthClient } from '@/lib/clients/google'
import { encryptToBytes, decryptFromBytes } from '@/lib/crypto'

export async function triggerAutoIngestForUser(userId: string, origin: string) {
  try {
    // Check if we need to ingest (avoid too frequent calls)
    const lastIngest = await prisma.ingestCursor.findUnique({
      where: { userId_source: { userId, source: 'EMAIL' } }
    })

    // Only ingest if last fetch was more than 30 minutes ago or never fetched
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000)
    if (lastIngest?.lastFetchedAt && lastIngest.lastFetchedAt > thirtyMinutesAgo) {
      return { skipped: true, reason: 'recent_fetch' }
    }

    // Check if user has Gmail credentials
    const hasGmailCreds = await prisma.credential.findFirst({
      where: { userId, provider: 'GOOGLE' }
    })

    if (!hasGmailCreds) {
      return { skipped: true, reason: 'no_credentials' }
    }

    // Trigger ingestion in background (don't await to avoid blocking)
    ingestGmailForUser({ userId, origin }).catch(error => {
      console.error(`Background auto-ingest failed for user ${userId}:`, error)
    })

    return { triggered: true }
  } catch (error) {
    console.error(`Auto-ingest trigger failed for user ${userId}:`, error)
    return { skipped: true, reason: 'error' }
  }
}

// Enhanced function that checks multiple conditions for smart auto-ingestion
export async function smartAutoIngest(userId: string, origin: string) {
  try {
    const [lastIngest, user, tasksCount] = await Promise.all([
      prisma.ingestCursor.findUnique({
        where: { userId_source: { userId, source: 'EMAIL' } }
      }),
      prisma.user.findUnique({
        where: { id: userId },
        include: { credentials: { where: { provider: 'GOOGLE' } } }
      }),
      prisma.task.count({
        where: { 
          userId, 
          source: 'EMAIL',
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // last 24h
        }
      })
    ])

    if (!user?.credentials.length) {
      return { skipped: true, reason: 'no_credentials' }
    }

    // Smart conditions for when to auto-ingest:
    const now = new Date()
    const isBusinessHours = now.getHours() >= 7 && now.getHours() <= 20
    const hasRecentTasks = tasksCount > 0
    
    // More aggressive ingestion during business hours or if user has been active
    const minIntervalMinutes = isBusinessHours || hasRecentTasks ? 15 : 30
    const minInterval = new Date(Date.now() - minIntervalMinutes * 60 * 1000)
    
    if (lastIngest?.lastFetchedAt && lastIngest.lastFetchedAt > minInterval) {
      return { skipped: true, reason: 'recent_fetch', lastFetch: lastIngest.lastFetchedAt }
    }

    // Start ingestion in background
    const ingestionPromise = ingestGmailForUser({ userId, origin })
    
    // Don't await in production to avoid blocking, but log results
    ingestionPromise
      .then(result => {
        if (result.ok && result.createdTasks && result.createdTasks.length > 0) {
          console.log(`Smart auto-ingest created ${result.createdTasks.length} tasks for user ${userId}`)
        }
      })
      .catch(error => {
        console.error(`Smart auto-ingest failed for user ${userId}:`, error)
      })

    return { triggered: true, mode: 'smart', interval: minIntervalMinutes }
  } catch (error) {
    console.error(`Smart auto-ingest error for user ${userId}:`, error)
    return { skipped: true, reason: 'error' }
  }
}

/**
 * Proactively refresh Google OAuth tokens for all users before they expire
 * This should be called regularly (e.g., every hour) to prevent token expiry issues
 */
export async function refreshExpiringTokens(origin: string) {
  try {
    console.log('Starting proactive token refresh for all users...')

    // Find all Google credentials that need refresh
    const expiringCredentials = await prisma.credential.findMany({
      where: {
        provider: 'GOOGLE',
        OR: [
          { expiresAt: null }, // Never had expiry set
          { expiresAt: { lte: new Date(Date.now() + 10 * 60 * 1000) } }, // Expires within 10 minutes
        ],
        encryptedRefreshToken: { not: null }, // Must have refresh token
      },
      select: {
        id: true,
        userId: true,
        encryptedAccessToken: true,
        encryptedRefreshToken: true,
        expiresAt: true,
      },
    })

    console.log(`Found ${expiringCredentials.length} credentials that need token refresh`)

    let successCount = 0
    let failureCount = 0

    for (const cred of expiringCredentials) {
      try {
        const accessToken = decryptFromBytes(cred.encryptedAccessToken)
        const refreshToken = decryptFromBytes(cred.encryptedRefreshToken)

        if (!refreshToken) {
          console.log(`No refresh token for user ${cred.userId}, skipping`)
          continue
        }

        const redirectUri = new URL('/api/integrations/connect/google/callback', origin).toString()
        const oauth2Client = createGoogleOAuthClient({
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          redirectUri
        })

        if (accessToken) {
          oauth2Client.setCredentials({
            access_token: accessToken,
            refresh_token: refreshToken,
            expiry_date: cred.expiresAt?.getTime()
          })
        }

        console.log(`Refreshing token for user ${cred.userId}`)
        await oauth2Client.refreshAccessToken()

        // Save the new tokens
        const newCreds = oauth2Client.credentials
        if (newCreds.access_token) {
          await prisma.credential.update({
            where: { id: cred.id },
            data: {
              encryptedAccessToken: encryptToBytes(newCreds.access_token),
              encryptedRefreshToken: newCreds.refresh_token ? encryptToBytes(newCreds.refresh_token) : undefined,
              expiresAt: newCreds.expiry_date ? new Date(newCreds.expiry_date) : new Date(Date.now() + 3600 * 1000),
              scope: newCreds.scope,
            },
          })
          console.log(`Token refreshed successfully for user ${cred.userId}`)
          successCount++
        }
      } catch (error) {
        console.error(`Failed to refresh token for user ${cred.userId}:`, error)
        failureCount++

        // If refresh token is invalid, mark credentials as needing re-auth
        if (error.message?.includes('invalid_grant') || error.message?.includes('Token has been expired')) {
          console.log(`Refresh token expired for user ${cred.userId}, marking as disconnected`)
          await prisma.credential.update({
            where: { id: cred.id },
            data: {
              encryptedAccessToken: null,
              encryptedRefreshToken: null,
              expiresAt: null,
            },
          })
        }
      }
    }

    console.log(`Token refresh completed: ${successCount} successful, ${failureCount} failed`)
    return { successCount, failureCount }
  } catch (error) {
    console.error('Error in refreshExpiringTokens:', error)
    return { successCount: 0, failureCount: 0, error: error.message }
  }
}
