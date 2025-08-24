import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { env } from '@acme/core'
import { createGoogleOAuthClient } from '@/lib/clients/google'

// Start Google OAuth for Calendar + Gmail readonly
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const redirectUri = new URL('/api/integrations/connect/google/callback', req.nextUrl.origin).toString()
  const oauth2Client = createGoogleOAuthClient({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri })

  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/gmail.readonly',
  ]

  const state = JSON.stringify({ u: (session.user as any).id })
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
    include_granted_scopes: true,
    state,
  })

  return NextResponse.redirect(url)
}

