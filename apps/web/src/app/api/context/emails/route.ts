import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { prisma } from '@/lib/clients/prisma'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const userId = (session.user as any).id as string
    console.log('🔍 Email API Debug:', { userId, userEmail: session.user.email })

    // Parse windowing params
    const sp = req.nextUrl.searchParams
    const now = Date.now()
    const afterMs = Number(sp.get('after') || '')
    const beforeMs = Number(sp.get('before') || '')
    const limitParam = Number(sp.get('limit') || '')
    const take = Math.max(1, Math.min(isFinite(limitParam) && limitParam > 0 ? limitParam : 50, 500))

    const where: any = {
      userId,
      source: 'EMAIL',
    }
    if (isFinite(afterMs) && afterMs > 0) {
      where.receivedAt = { ...(where.receivedAt || {}), gte: new Date(afterMs) }
    }
    if (isFinite(beforeMs) && beforeMs > 0) {
      where.receivedAt = { ...(where.receivedAt || {}), lte: new Date(beforeMs) }
    }

    // Get recent emails from the database
    const emails = await prisma.messageIngest.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      take,
      select: {
        id: true,
        receivedAt: true,
        metadata: true
      }
    })

    console.log('📧 Found emails:', emails.length)
    
    // Also check if any emails exist for any user (for debugging)
    const totalEmails = await prisma.messageIngest.count({
      where: { source: 'EMAIL' }
    })
    console.log('📊 Total emails in DB:', totalEmails)

    // Transform to the expected format
    const formattedEmails = emails.map(email => {
      const metadata = email.metadata as any
      const from: string = metadata?.from || ''
      // naive parse: "Name <email@domain>"
      const match = from.match(/^(.*)\s*<([^>]+)>$/)
      const fromName = match ? match[0] && match[1].trim() : (from.split('<')[0] || '').trim() || 'Unknown'
      const fromEmail = match ? match[2] : (from.match(/<([^>]+)>/)?.[1] || from)
      return {
        id: email.id,
        fromName,
        fromEmail,
        subject: metadata?.subject || 'No subject',
        snippet: metadata?.snippet || metadata?.bodySnippet || '',
        dateISO: email.receivedAt.toISOString(),
        included: true,
      }
    })

    return NextResponse.json(formattedEmails)

  } catch (error) {
    console.error('Error fetching emails:', error)
    return NextResponse.json({ error: 'Failed to fetch emails' }, { status: 500 })
  }
}
