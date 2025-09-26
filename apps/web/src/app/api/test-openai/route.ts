import { NextRequest, NextResponse } from 'next/server'
import { openai } from '@/lib/clients/openai'

export async function GET(req: NextRequest) {
  try {
    console.log('Testing OpenAI connection...')

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hello, can you respond with "OpenAI test successful"?' }],
      temperature: 0.1,
      max_tokens: 50
    })

    const response = completion.choices?.[0]?.message?.content || 'No response'

    console.log('OpenAI test successful:', response)

    return NextResponse.json({
      success: true,
      message: 'OpenAI connection successful',
      response
    })
  } catch (error) {
    console.error('OpenAI test failed:', error)
    return NextResponse.json({
      success: false,
      error: 'OpenAI connection failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
