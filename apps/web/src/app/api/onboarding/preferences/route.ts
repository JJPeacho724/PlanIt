import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { prisma } from '@/lib/clients/prisma'

type PreferencesPayload = {
  timeZone?: string
  planning?: {
    workHours?: { start: string; end: string }
    meetingHours?: { start: string; end: string }
    minGapMinutes?: number
    eventCapPerDay?: number
    autoGenerateEvents?: boolean
  }
  gating?: {
    allowedDomains?: string[]
    ignoreDomains?: string[]
    ignoreKeywords?: string[]
    requireMeetingLink?: boolean
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timeZone: true, preferences: true } })
  return NextResponse.json({
    success: true,
    timeZone: user?.timeZone || 'America/New_York',
    preferences: user?.preferences || {}
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string

  const body = (await req.json()) as PreferencesPayload
  const current = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } })
  const merged = { ...(current?.preferences || {}), ...body }

  await prisma.user.update({ where: { id: userId }, data: { preferences: merged, timeZone: body.timeZone || undefined } })
  return NextResponse.json({ success: true, preferences: merged })
}


