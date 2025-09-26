import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { prisma } from '@/lib/clients/prisma'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const userId = (session.user as any).id as string

    // Check if user has Google credentials
    const credential = await prisma.credential.findFirst({
      where: { userId, provider: 'GOOGLE' }
    })

    const isConnected = !!credential

    // Get last ingestion time
    const ingestCursor = await prisma.ingestCursor.findUnique({
      where: { userId_source: { userId, source: 'EMAIL' } }
    })

    // Count total emails ingested
    const totalEmails = await prisma.messageIngest.count({
      where: { userId, source: 'EMAIL' }
    })

    // Count recent tasks created from emails (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const recentTasks = await prisma.task.count({
      where: {
        userId,
        source: 'EMAIL',
        createdAt: { gte: sevenDaysAgo }
      }
    })

    return NextResponse.json({
      isConnected,
      lastFetchedAt: ingestCursor?.lastFetchedAt?.toISOString() || null,
      totalEmails,
      recentTasks
    })

  } catch (error) {
    console.error('Error fetching ingestion status:', error)
    return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 })
  }
}
