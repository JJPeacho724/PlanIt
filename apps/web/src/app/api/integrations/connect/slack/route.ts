import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { env } from '@acme/core'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const userId = (session.user as any).id as string
  const redirectUri = new URL('/api/integrations/connect/slack/callback', req.nextUrl.origin).toString()
  const state = encodeURIComponent(JSON.stringify({ u: userId }))

  const userScopes = [
    'channels:history',
    'groups:history',
    'im:history',
    'mpim:history',
    'users:read',
  ]

  const url = `https://slack.com/oauth/v2/authorize?client_id=${encodeURIComponent(env.SLACK_CLIENT_ID)}&user_scope=${encodeURIComponent(userScopes.join(','))}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`
  return NextResponse.redirect(url)
}

