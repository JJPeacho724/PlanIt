import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { prisma } from '@/lib/clients/prisma'

// Debug endpoint: purge cancelled or old calendar busy entries for current user
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const userId = (session.user as any).id as string

    const url = req.nextUrl
    const olderThanDaysParam = url.searchParams.get('olderThanDays')
    const olderThanDays = olderThanDaysParam ? Number(olderThanDaysParam) : 0
    const cutoff = isNaN(olderThanDays) || olderThanDays <= 0
      ? null
      : new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)

    const where: any = { userId }
    // Remove cancelled or transparent (free) entries
    where.OR = [
      { metadata: { path: ['status'], equals: 'cancelled' } as any },
      { metadata: { path: ['transparency'], equals: 'transparent' } as any },
    ]
    if (cutoff) {
      where.AND = [
        { endsAt: { lt: cutoff } },
      ]
    }

    const result = await prisma.calendarBusy.deleteMany({ where })

    return NextResponse.json({ ok: true, deletedCount: result.count })
  } catch (error: any) {
    console.error('Cleanup calendar-busy error:', error)
    return NextResponse.json({ ok: false, error: error?.message || 'unknown_error' }, { status: 500 })
  }
}


