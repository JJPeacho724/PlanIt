import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { ids = [], action, level } = await req.json();
    return NextResponse.json({ ok: true, count: Array.isArray(ids) ? ids.length : 0, action, level });
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
  }
}


