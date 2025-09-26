import { NextRequest, NextResponse } from 'next/server'
import { env } from '@acme/core'
import { prisma } from '@/lib/clients/prisma'
import { encryptToBytes } from '@/lib/crypto'
import { CredentialProvider } from '@prisma/client'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state) return NextResponse.redirect(new URL('/?error=missing_code', url.origin))

  const parsed = JSON.parse(decodeURIComponent(state))
  const userId: string | undefined = parsed?.u
  if (!userId) return NextResponse.redirect(new URL('/?error=missing_user', url.origin))

  const redirectUri = new URL('/api/integrations/connect/slack/callback', url.origin).toString()
  const body = new URLSearchParams({
    code,
    client_id: env.SLACK_CLIENT_ID,
    client_secret: env.SLACK_CLIENT_SECRET,
    redirect_uri: redirectUri,
  })

  const resp = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const data = await resp.json() as any
  if (!data.ok) return NextResponse.redirect(new URL('/settings/connections?error=slack_oauth', url.origin))

  const userToken: string | undefined = data.authed_user?.access_token
  const expirySeconds: number | undefined = data.authed_user?.expires_in

  await prisma.credential.upsert({
    where: { id: `${userId}_SLACK` },
    create: {
      id: `${userId}_SLACK`,
      userId,
      provider: CredentialProvider.SLACK,
      encryptedAccessToken: userToken ? encryptToBytes(userToken) : undefined,
      expiresAt: expirySeconds ? new Date(Date.now() + expirySeconds * 1000) : undefined,
      scope: data.authed_user?.scope,
    },
    update: {
      encryptedAccessToken: userToken ? encryptToBytes(userToken) : undefined,
      expiresAt: expirySeconds ? new Date(Date.now() + expirySeconds * 1000) : undefined,
      scope: data.authed_user?.scope,
    },
  })

  return NextResponse.redirect(new URL('/settings/connections?connected=slack', url.origin))
}

