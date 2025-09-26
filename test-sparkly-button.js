#!/usr/bin/env node

/**
 * Test script to simulate the sparkly button exactly
 */

async function testSparklyButton() {
  console.log('🧪 Testing Sparkly Button Functionality\n')
  
  try {
    // Check if server is running
    const healthResponse = await fetch('http://localhost:3000/api/health')
    if (!healthResponse.ok) {
      throw new Error('Development server not running. Please start with: cd apps/web && npm run dev')
    }
    
    console.log('✅ Server is running')
    
    // Test the exact call that the sparkly button makes
    console.log('📞 Calling planner API with sparkly button parameters...')
    
    const plannerResponse = await fetch('http://localhost:3000/api/planner', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'test-script'
      },
      body: JSON.stringify({
        message: 'Schedule my tasks from emails and calendar',
        autoGenerateEvents: true,
        includeGoogleData: true
      })
    })
    
    console.log('📡 Response status:', plannerResponse.status)
    console.log('📡 Response headers:', Object.fromEntries(plannerResponse.headers.entries()))
    
    if (!plannerResponse.ok) {
      const errorText = await plannerResponse.text()
      console.log('❌ Response failed:', errorText)
      return
    }
    
    const plannerData = await plannerResponse.json()
    
    console.log('\n📋 Planner Response Summary:')
    console.log('- Success:', plannerData.success)
    console.log('- Reply length:', plannerData.reply?.length || 0)
    console.log('- Event drafts:', plannerData.eventDrafts?.length || 0)
    console.log('- Event generation info:', !!plannerData.eventGeneration)
    
    if (plannerData.eventDrafts && plannerData.eventDrafts.length > 0) {
      console.log('\n🎉 SUCCESS! Event drafts were created:')
      plannerData.eventDrafts.forEach((draft, i) => {
        const start = new Date(draft.startsAt).toLocaleString()
        const end = new Date(draft.endsAt).toLocaleString()
        console.log(`   ${i + 1}. ${draft.title || 'Untitled'} (${start} - ${end})`)
      })
    } else {
      console.log('\n❌ NO EVENT DRAFTS CREATED')
      
      if (plannerData.reply) {
        console.log('\nPlanner reply (first 200 chars):')
        console.log(plannerData.reply.substring(0, 200) + '...')
      }
      
      if (plannerData.eventGeneration) {
        console.log('\nEvent generation metadata:', plannerData.eventGeneration)
      }
    }
    
    // Also test direct event generation
    console.log('\n🔧 Testing direct event generation...')
    
    const directEventResponse = await fetch('http://localhost:3000/api/events/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        includeGoogleData: true,
        preferences: {
          breakMinutes: 15,
          minBlockMinutes: 30,
          resolveConflicts: 'push'
        }
      })
    })
    
    console.log('Direct event generation status:', directEventResponse.status)
    
    if (directEventResponse.ok) {
      const eventData = await directEventResponse.json()
      console.log('✅ Direct event generation worked!')
      console.log('- Created events:', eventData.eventDrafts?.length || 0)
      console.log('- Metadata:', eventData.metadata)
    } else {
      const errorText = await directEventResponse.text()
      console.log('❌ Direct event generation failed:', errorText)
    }
    
  } catch (error) {
    console.log('❌ Error:', error.message)
    console.log('\n🔧 Troubleshooting:')
    console.log('   1. Make sure the dev server is running: cd apps/web && npm run dev')
    console.log('   2. Sign in to the app at http://localhost:3000')
    console.log('   3. Check server logs for any errors')
  }
}

// Make fetch available in Node.js
if (!global.fetch) {
  global.fetch = require('node-fetch')
}

testSparklyButton().catch(console.error)
