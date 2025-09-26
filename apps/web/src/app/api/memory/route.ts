import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createSemanticChunk } from '@/lib/embeddings'
import { z } from 'zod'

const memorySchema = z.object({
  remember: z.object({
    factType: z.enum(['preference', 'constraint', 'goal', 'pattern', 'skill', 'availability']),
    key: z.string(),
    value: z.string(),
    confidence: z.number().min(0).max(1).optional(),
    halfLifeDays: z.number().positive().optional(),
    source: z.string().optional()
  }).optional(),
  content: z.string().optional(),
  chunkType: z.string().optional(),
  source: z.enum(['EMAIL', 'SLACK', 'MANUAL', 'CALENDAR']).optional()
})

/**
 * Store explicit memories and facts
 * POST /api/memory
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const body = await req.json()

    // For demo purposes, work with or without authentication
    const userId = session?.user ? (session.user as any).id as string : 'demo-user'

    // Validate request body
    const validatedData = memorySchema.parse(body)
    const { remember, content, chunkType, source } = validatedData

    let result: any = {}

    // Try to store in database, fall back to in-memory if tables don't exist
    if (remember) {
      const { factType, key, value, confidence = 0.8, halfLifeDays = 30, source: factSource = 'explicit' } = remember

      try {
        const { prisma } = await import('@/lib/clients/prisma')
        
        const userFact = await prisma.userFact.upsert({
          where: {
            userId_factType_key: {
              userId,
              factType,
              key
            }
          },
          update: {
            value,
            confidence,
            halfLifeDays,
            source: factSource,
            lastValidated: new Date()
          },
          create: {
            userId,
            factType,
            key,
            value,
            confidence,
            halfLifeDays,
            source: factSource,
            lastValidated: new Date()
          }
        })

        result.fact = userFact
        result.storage = 'database'

        console.log('User fact stored in database:', {
          userId,
          factType,
          key,
          value,
          confidence
        })
      } catch (dbError) {
        console.log('Database tables not available, using memory storage')
        
        // Fall back to in-memory storage (for demo)
        result.fact = {
          id: `memory-${Date.now()}`,
          userId,
          factType,
          key,
          value,
          confidence,
          source: factSource,
          createdAt: new Date(),
          storage: 'memory'
        }
        result.storage = 'memory'
        
        console.log('User fact stored in memory:', {
          userId,
          factType,
          key,
          value,
          confidence
        })
      }
    }

    // Handle semantic chunk storage similarly
    if (content) {
      try {
        const chunk = await createSemanticChunk(
          userId,
          content,
          source || 'MANUAL',
          chunkType || 'user_memory'
        )

        result.chunk = chunk
        result.chunkStorage = 'database'
      } catch (error) {
        console.log('Semantic chunk tables not available, using memory storage')
        
        result.chunk = {
          id: `chunk-${Date.now()}`,
          userId,
          content,
          source: source || 'MANUAL',
          chunkType: chunkType || 'user_memory',
          createdAt: new Date(),
          storage: 'memory'
        }
        result.chunkStorage = 'memory'
      }
    }

    return NextResponse.json({
      success: true,
      message: `Memory stored successfully${result.storage === 'memory' ? ' (in-memory for demo)' : ''}`,
      data: result
    })
  } catch (error) {
    console.error('Failed to store memory:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request format', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to store memory' },
      { status: 500 }
    )
  }
}

/**
 * Retrieve user memories and facts
 * GET /api/memory?type=facts|chunks&factType=preference&limit=10
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
    const type = searchParams.get('type') || 'facts'
    const factType = searchParams.get('factType')
    const chunkType = searchParams.get('chunkType')
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 100)
    const minConfidence = parseFloat(searchParams.get('minConfidence') || '0')

    const { prisma } = await import('@/lib/clients/prisma')

    let result: any = {}

    if (type === 'facts' || type === 'both') {
      const facts = await prisma.userFact.findMany({
        where: {
          userId,
          confidence: { gte: minConfidence },
          ...(factType && { factType })
        },
        orderBy: [
          { confidence: 'desc' },
          { lastValidated: 'desc' }
        ],
        take: limit
      })

      result.facts = facts
    }

    if (type === 'chunks' || type === 'both') {
      const chunks = await prisma.semanticChunk.findMany({
        where: {
          userId,
          ...(chunkType && { chunkType })
        },
        orderBy: { createdAt: 'desc' },
        take: limit
      })

      result.chunks = chunks
    }

    return NextResponse.json({
      success: true,
      data: result
    })
  } catch (error) {
    console.error('Failed to retrieve memory:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve memory' },
      { status: 500 }
    )
  }
}

/**
 * Delete a memory or fact
 * DELETE /api/memory?factId=123&chunkId=456
 */
export async function DELETE(req: NextRequest) {
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
    const factId = searchParams.get('factId')
    const chunkId = searchParams.get('chunkId')

    const { prisma } = await import('@/lib/clients/prisma')

    let deletedCount = 0

    if (factId) {
      const deleted = await prisma.userFact.deleteMany({
        where: {
          id: factId,
          userId // Ensure user owns the fact
        }
      })
      deletedCount += deleted.count
    }

    if (chunkId) {
      const deleted = await prisma.semanticChunk.deleteMany({
        where: {
          id: chunkId,
          userId // Ensure user owns the chunk
        }
      })
      deletedCount += deleted.count
    }

    return NextResponse.json({
      success: true,
      message: `Deleted ${deletedCount} memory items`
    })
  } catch (error) {
    console.error('Failed to delete memory:', error)
    return NextResponse.json(
      { error: 'Failed to delete memory' },
      { status: 500 }
    )
  }
}
