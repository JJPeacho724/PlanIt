import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { prisma } from '@/lib/clients/prisma'
import { CredentialProvider } from '@prisma/client'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { provider } = await req.json().catch(() => ({ provider: undefined }))
  if (!provider) return NextResponse.json({ error: 'missing provider' }, { status: 400 })

  const providerEnum = provider === 'GOOGLE' ? CredentialProvider.GOOGLE : CredentialProvider.SLACK
  await prisma.credential.deleteMany({ where: { userId: (session.user as any).id ?? 'unknown', provider: providerEnum } })
  return NextResponse.json({ ok: true })
}

