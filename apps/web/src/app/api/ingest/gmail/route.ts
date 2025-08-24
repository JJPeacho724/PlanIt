import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { ingestGmailForUser } from '@/lib/ingest/gmail'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  const res = await ingestGmailForUser({ userId, origin: req.nextUrl.origin })
  if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 })
  return NextResponse.json({ ok: true, createdTasks: res.createdTasks })
}

