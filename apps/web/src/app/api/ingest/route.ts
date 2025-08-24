import { NextResponse } from 'next/server'

export async function GET() {
  // Health endpoint for ingest
  return NextResponse.json({ ok: true })
}

