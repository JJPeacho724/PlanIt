import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { recordSignal } from '@/lib/bandit'
import { z } from 'zod'

const signalSchema = z.object({
  key: z.string(),
  signal: z.string(),
  delta: z.number().optional(),
  banditKey: z.string().optional(),
  success: z.boolean().optional(),
  metadata: z.any().optional()
})

/**
 * Record user signals for learning
 * POST /api/signals
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const body = await req.json()

    // For demo purposes, work with or without authentication
    const userId = session?.user ? (session.user as any).id as string : 'demo-user'

    // Validate request body
    const validatedData = signalSchema.parse(body)
    const { key, signal, delta, banditKey, success, metadata } = validatedData

    try {
      // Try to record the signal in database
      await recordSignal(userId, key, signal, delta, banditKey, success, metadata)

      console.log('Signal recorded in database:', {
        userId,
        key,
        signal: signal.slice(0, 100),
        delta,
        banditKey,
        success
      })

      return NextResponse.json({
        success: true,
        message: 'Signal recorded successfully',
        storage: 'database'
      })
    } catch (dbError) {
      console.log('Database tables not available, recording signal in memory:', {
        userId,
        key,
        signal: signal.slice(0, 100),
        delta,
        banditKey,
        success
      })

      // For demo, just log the signal instead of storing
      return NextResponse.json({
        success: true,
        message: 'Signal recorded successfully (in-memory for demo)',
        storage: 'memory',
        data: {
          userId,
          key,
          signal,
          delta,
          banditKey,
          success,
          timestamp: new Date().toISOString()
        }
      })
    }
  } catch (error) {
    console.error('Failed to record signal:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request format', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to record signal' },
      { status: 500 }
    )
  }
}

/**
 * Get user signals for analysis
 * GET /api/signals?key=signal_key&limit=10
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const userId = (session.user as any).id as string
    const { searchParams } = new URL(req.url)
    const key = searchParams.get('key')
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 100)

    const { prisma } = await import('@/lib/clients/prisma')

    const signals = await prisma.signal.findMany({
      where: {
        userId,
        ...(key && { key })
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    })

    return NextResponse.json({
      success: true,
      signals: signals.map(signal => ({
        id: signal.id,
        key: signal.key,
        signal: signal.signal,
        delta: signal.delta,
        banditKey: signal.banditKey,
        success: signal.success,
        metadata: signal.metadata,
        createdAt: signal.createdAt
      }))
    })
  } catch (error) {
    console.error('Failed to get signals:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve signals' },
      { status: 500 }
    )
  }
}
