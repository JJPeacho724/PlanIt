import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { prisma } from '@/lib/clients/prisma'
import { CredentialProvider } from '@prisma/client'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string

  const creds = await prisma.credential.findMany({ where: { userId } })
  const providers = new Set(creds.map(c => c.provider))
  return NextResponse.json({
    google: providers.has(CredentialProvider.GOOGLE),
    slack: providers.has(CredentialProvider.SLACK),
  })
}

