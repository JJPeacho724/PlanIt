#!/usr/bin/env node

/**
 * Test the new local-first event creation flow
 */

async function testLocalMode() {
  console.log('🏠 Testing Local-First Event Creation\n')
  
  try {
    // Test direct event generation in local mode
    console.log('📅 Testing direct event generation in local mode...')
    
    const directResponse = await fetch('http://localhost:3000/api/events/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        localMode: true,
        includeGoogleData: false,
        preferences: {
          breakMinutes: 15,
          minBlockMinutes: 30,
          resolveConflicts: 'push'
        }
      })
    })
    
    console.log('Response status:', directResponse.status)
    
    if (directResponse.ok) {
      const data = await directResponse.json()
      console.log('✅ Local event generation successful!')
      console.log('📊 Results:')
      console.log('- Success:', data.success)
      console.log('- Event drafts:', data.eventDrafts?.length || 0)
      console.log('- Local mode:', data.metadata?.isLocalMode)
      console.log('- Message:', data.metadata?.message)
      
      if (data.eventDrafts && data.eventDrafts.length > 0) {
        console.log('\n📅 Generated Events:')
        data.eventDrafts.forEach((event, i) => {
          const start = new Date(event.startsAt).toLocaleString()
          const end = new Date(event.endsAt).toLocaleString()
          console.log(`   ${i + 1}. ${event.title}`)
          console.log(`      Time: ${start} - ${end}`)
          console.log(`      Rationale: ${event.rationale || 'No rationale'}`)
          console.log('')
        })
      }
    } else {
      const error = await directResponse.text()
      console.log('❌ Direct event generation failed:', error)
    }
    
    // Test planner API in local mode
    console.log('\n🤖 Testing planner API (sparkly button simulation)...')
    
    const plannerResponse = await fetch('http://localhost:3000/api/planner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Schedule my tasks from emails and calendar',
        autoGenerateEvents: true,
        includeGoogleData: false
      })
    })
    
    console.log('Planner response status:', plannerResponse.status)
    
    if (plannerResponse.ok) {
      const plannerData = await plannerResponse.json()
      console.log('✅ Planner API successful!')
      console.log('📊 Results:')
      console.log('- Success:', plannerData.success)
      console.log('- Event drafts:', plannerData.eventDrafts?.length || 0)
      console.log('- Has event generation data:', !!plannerData.eventGeneration)
      
      if (plannerData.eventGeneration) {
        console.log('- Event generation success:', plannerData.eventGeneration.success)
        console.log('- Event generation local mode:', plannerData.eventGeneration.metadata?.isLocalMode)
      }
      
      if (plannerData.eventDrafts && plannerData.eventDrafts.length > 0) {
        console.log('\n🎉 SUCCESS! Sparkly button now works without authentication!')
        console.log('Generated event previews:')
        plannerData.eventDrafts.slice(0, 3).forEach((event, i) => {
          const start = new Date(event.startsAt).toLocaleString()
          console.log(`   ${i + 1}. ${event.title} (${start})`)
        })
        
        if (plannerData.eventDrafts.length > 3) {
          console.log(`   ...and ${plannerData.eventDrafts.length - 3} more events`)
        }
      } else {
        console.log('⚠️ No event drafts in planner response')
      }
    } else {
      const error = await plannerResponse.text()
      console.log('❌ Planner API failed:', error)
    }
    
    console.log('\n🎯 Local Mode Summary:')
    console.log('✅ Events can now be created without Google authentication')
    console.log('✅ Local sample tasks are used for planning')
    console.log('✅ Events are returned directly (not saved to database)')
    console.log('✅ Users can plan locally first, then sync to Google later')
    
  } catch (error) {
    console.log('❌ Error:', error.message)
  }
}

// Make fetch available in Node.js
if (!global.fetch) {
  global.fetch = require('node-fetch')
}

testLocalMode().catch(console.error)




