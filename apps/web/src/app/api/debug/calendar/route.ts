import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { prisma } from '@/lib/clients/prisma'
import { cacheCalendarBusyForUser } from '@/lib/ingest/calendar'

export async function GET(req: NextRequest) {
  const url = req.nextUrl
  const impersonate = url.searchParams.get('impersonate') === 'true'
  let userId: string | null = null

  if (impersonate && process.env.NODE_ENV !== 'production') {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } })
    if (!user) return NextResponse.json({ error: 'no_user' }, { status: 404 })
    userId = user.id
  } else {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    userId = (session.user as any).id as string
  }

  const cred = await prisma.credential.findFirst({ where: { userId: userId! , provider: 'GOOGLE' }, orderBy: { updatedAt: 'desc' } })
  const scope = cred?.scope || null

  const ref = req.nextUrl.searchParams.get('refresh') === 'true'
  let refreshResult: any = null
  if (ref) {
    try {
      refreshResult = await cacheCalendarBusyForUser({ userId: userId!, origin: req.nextUrl.origin })
    } catch (e: any) {
      refreshResult = { ok: false, error: e?.message || 'refresh_failed' }
    }
  }

  const recent = await prisma.calendarBusy.findMany({
    where: { userId: userId! },
    orderBy: { startsAt: 'desc' },
    take: 5,
    select: { id: true, title: true, startsAt: true, endsAt: true, calendarId: true, externalEventId: true }
  })

  return NextResponse.json({ scope, refreshResult, sample: recent })
}


