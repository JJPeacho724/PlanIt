import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { prisma } from '@/lib/clients/prisma'
import { buildPlan } from '@acme/ai'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { message } = await req.json()

  // TODO: call LLM tools to produce plan
  const plan = await buildPlan({ message, now: new Date() })

  // Example: upsert placeholder task
  await prisma.task.create({ data: { userId: (session.user as any).id ?? 'unknown', title: plan.title ?? 'Planned Task', description: plan.summary ?? undefined } })

  return NextResponse.json({ reply: plan.reply })
}

