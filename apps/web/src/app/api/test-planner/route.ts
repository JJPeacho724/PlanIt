import { NextRequest, NextResponse } from 'next/server'

/**
 * Simple test endpoint to verify basic functionality
 */
export async function POST(req: NextRequest) {
  try {
    console.log('🧪 Test planner endpoint called')
    
    const body = await req.json()
    const message = body?.message || 'No message provided'
    
    console.log('📝 Message received:', message)
    
    // Simple response without any external dependencies
    const reply = `## Test Plan Response

I received your message: "${message}"

### Here's a simple plan:
1. **Morning**: Start with priority tasks
2. **Midday**: Handle meetings and collaboration  
3. **Afternoon**: Focus work and follow-ups
4. **Evening**: Review and plan tomorrow

This is a basic test response to verify the API is working.

**Status**: ✅ API is functional!`

    const response = {
      success: true,
      reply,
      test: true,
      timestamp: new Date().toISOString(),
      learning: {
        variant: 'test',
        confidence: 1.0,
        personalized: false,
        canProvideFeedback: false
      }
    }
    
    console.log('✅ Test response generated')
    return NextResponse.json(response)
    
  } catch (error) {
    console.error('❌ Test planner error:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Test failed',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ 
    status: 'Test planner API is running',
    timestamp: new Date().toISOString()
  })
}
