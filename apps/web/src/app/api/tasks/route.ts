import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { prisma } from '@/lib/clients/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const tasks = await prisma.task.findMany({ where: { userId: (session.user as any).id ?? 'unknown' } })
  return NextResponse.json({ tasks })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json()
  const task = await prisma.task.create({ 
    data: { 
      userId: (session.user as any).id ?? 'unknown', 
      source: 'MANUAL',
      title: body.title, 
      description: body.description ?? null,
      priority: body.priority ?? 1,
      effortMinutes: body.effortMinutes ?? 60,
      tags: body.tags ?? []
    } 
  })
  return NextResponse.json({ task })
}

