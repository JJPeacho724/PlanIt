import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/clients/prisma'
import { CredentialProvider } from '@prisma/client'
import { env } from '@acme/core'
import { createGoogleOAuthClient } from '@/lib/clients/google'
import { encryptToBytes } from '@/lib/crypto'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state) return NextResponse.redirect('/?error=missing_code')

  const parsed = JSON.parse(state)
  const userId: string | undefined = parsed?.u
  if (!userId) return NextResponse.redirect('/?error=missing_user')

  const redirectUri = new URL('/api/integrations/connect/google/callback', url.origin).toString()
  const oauth2Client = createGoogleOAuthClient({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri })
  const { tokens } = await oauth2Client.getToken(code)

  await prisma.credential.upsert({
    where: { id: `${userId}_GOOGLE` },
    create: {
      id: `${userId}_GOOGLE`,
      userId,
      provider: CredentialProvider.GOOGLE,
      encryptedAccessToken: tokens.access_token ? encryptToBytes(tokens.access_token) : undefined,
      encryptedRefreshToken: tokens.refresh_token ? encryptToBytes(tokens.refresh_token) : undefined,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      scope: tokens.scope,
    },
    update: {
      encryptedAccessToken: tokens.access_token ? encryptToBytes(tokens.access_token) : undefined,
      encryptedRefreshToken: tokens.refresh_token ? encryptToBytes(tokens.refresh_token) : undefined,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      scope: tokens.scope,
    },
  })

  return NextResponse.redirect('/settings/connections?connected=google')
}

