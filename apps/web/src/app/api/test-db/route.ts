import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { prisma } from '@/lib/clients/prisma'

export async function GET(req: NextRequest) {
  try {
    console.log('Testing database connection...')

    // Test basic Prisma connection
    const userCount = await prisma.user.count()
    console.log(`Database connected. User count: ${userCount}`)

    // Test session
    const session = await getServerSession(authOptions)
    console.log('Session check:', { authenticated: !!session?.user?.email, userId: session?.user?.id })

    return NextResponse.json({
      success: true,
      message: 'Database connection successful',
      userCount,
      authenticated: !!session?.user?.email,
      userId: session?.user?.id
    })
  } catch (error) {
    console.error('Database test failed:', error)
    return NextResponse.json({
      success: false,
      error: 'Database connection failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
