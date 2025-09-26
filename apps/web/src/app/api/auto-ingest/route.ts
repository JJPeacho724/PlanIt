import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { prisma } from '@/lib/clients/prisma'
import { ingestGmailForUser } from '@/lib/ingest/gmail'

// Automatic background ingestion endpoint that runs periodically
export async function POST(req: NextRequest) {
  try {
    // Run for all users with Gmail credentials
    const users = await prisma.user.findMany({
      where: {
        credentials: {
          some: { provider: 'GOOGLE' }
        }
      },
      select: { id: true, email: true }
    })

    const origin = process.env.NEXTAUTH_URL || req.nextUrl.origin
    const results = []

    for (const user of users) {
      try {
        // Check if we need to ingest (avoid too frequent calls)
        const lastIngest = await prisma.ingestCursor.findUnique({
          where: { userId_source: { userId: user.id, source: 'EMAIL' } }
        })

        // Only ingest if last fetch was more than 30 minutes ago
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000)
        if (lastIngest?.lastFetchedAt && lastIngest.lastFetchedAt > thirtyMinutesAgo) {
          continue
        }

        const result = await ingestGmailForUser({ userId: user.id, origin })
        results.push({
          userId: user.id,
          email: user.email,
          success: result.ok,
          tasksCreated: result.ok ? (result.createdTasks?.length || 0) : 0,
          error: !result.ok ? result.reason : null
        })
        
        // Log specific OAuth errors for better debugging
        if (!result.ok && (result.reason === 'oauth_expired' || result.reason === 'token_refresh_failed')) {
          console.log(`User ${user.email} needs to reconnect Google account: ${result.reason}`)
        }
      } catch (error) {
        console.error(`Auto-ingest failed for user ${user.id}:`, error)
        results.push({
          userId: user.id,
          email: user.email,
          success: false,
          error: 'Exception during ingestion'
        })
      }
    }

    return NextResponse.json({
      ok: true,
      processedUsers: results.length,
      totalUsers: users.length,
      results
    })

  } catch (error) {
    console.error('Auto-ingest error:', error)
    return NextResponse.json({ error: 'Auto-ingest failed' }, { status: 500 })
  }
}

// Allow authenticated users to trigger their own ingestion
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const userId = (session.user as any).id as string
  
  try {
    const origin = process.env.NEXTAUTH_URL || req.nextUrl.origin
    const result = await ingestGmailForUser({ userId, origin })
    
    return NextResponse.json({
      ok: result.ok,
      tasksCreated: result.ok ? (result.createdTasks?.length || 0) : 0,
      error: !result.ok ? result.reason : null
    })
  } catch (error) {
    console.error('User auto-ingest error:', error)
    return NextResponse.json({ error: 'Ingestion failed' }, { status: 500 })
  }
}
