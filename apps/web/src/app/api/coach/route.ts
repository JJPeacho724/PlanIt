import { NextRequest, NextResponse } from 'next/server'
import { PLANIT_COACH_SYSTEM_PROMPT, planWithResearch } from '@/lib/coach'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const message: string = body?.message || 'Help me plan my goal'
    const profile = body?.profile
    const context = body?.context

    const messages = [
      { role: 'system', content: PLANIT_COACH_SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify({ request: message, profile, context }) }
    ] as any

    const plan = await planWithResearch(messages)
    return NextResponse.json(plan)
  } catch (error) {
    console.error('Coach API error:', error)
    return NextResponse.json({ events: [], sources: [], assumptions: ['coach_failed'], notes: (error as Error).message || 'error' }, { status: 500 })
  }
}


