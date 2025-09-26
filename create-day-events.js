#!/usr/bin/env node

/**
 * Script to create calendar events for the day plan
 */

const events = [
  {
    title: 'Manage Quarantined Emails',
    description: 'Review and address any important emails that may be in your quarantine folder',
    start: '8:00 AM',
    end: '9:00 AM',
    priority: 3
  },
  {
    title: 'Join Climate Briefing',
    description: 'Time-sensitive commitment scheduled for September 2 at 9 AM CT',
    start: '9:00 AM', 
    end: '10:00 AM',
    priority: 3
  },
  {
    title: 'Plan Fall Travel',
    description: 'Research and plan your fall travel. Check Southwest Airlines $49 sale for best options',
    start: '10:00 AM',
    end: '12:00 PM', 
    priority: 2
  },
  {
    title: 'Prepare for Meeting with Dr. Levin',
    description: 'Review necessary materials and prepare for your meeting with Dr. Levin',
    start: '2:30 PM',
    end: '3:00 PM',
    priority: 3
  },
  {
    title: 'Meeting with Dr. Levin',
    description: 'Attend your meeting with Dr. Levin - Tuesday at 3 PM CT',
    start: '3:00 PM',
    end: '4:00 PM',
    priority: 3
  },
  {
    title: 'Follow Up on Internship Application',
    description: 'Follow up on your internship application with Databricks if you haven\'t received a response',
    start: '4:00 PM',
    end: '5:00 PM',
    priority: 2
  },
  {
    title: 'Review Job Alerts',
    description: 'Set aside time to review new job alerts for investment banking internships',
    start: '1:00 PM',
    end: '1:30 PM',
    priority: 1
  },
  {
    title: 'Prepare Therapy Recommendation',
    description: 'Prepare a brief email recommending Dr. Melanie Santos for anxiety and body-image therapy',
    start: '1:30 PM',
    end: '2:00 PM',
    priority: 1
  }
]

async function createTasksAndEvents() {
  console.log('🎯 Creating calendar events for your day plan...\n')
  
  try {
    // Check if server is running
    const healthResponse = await fetch('http://localhost:3000/api/health')
    if (!healthResponse.ok) {
      throw new Error('Development server not running. Please start with: cd apps/web && npm run dev')
    }
    
    console.log('✅ Server is running')
    
    // Check authentication
    const authResponse = await fetch('http://localhost:3000/api/auth/session')
    const session = await authResponse.json()
    
    if (!session?.user?.email) {
      throw new Error('Not authenticated. Please sign in at http://localhost:3000')
    }
    
    console.log('✅ Authenticated as:', session.user.email)
    
    // Create tasks for each event
    const createdTasks = []
    for (const event of events) {
      const taskResponse = await fetch('http://localhost:3000/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: event.title,
          description: event.description,
          priority: event.priority,
          effortMinutes: calculateDuration(event.start, event.end)
        })
      })
      
      if (taskResponse.ok) {
        const task = await taskResponse.json()
        createdTasks.push(task)
        console.log(`📝 Created task: ${event.title}`)
      } else {
        console.log(`❌ Failed to create task: ${event.title}`)
      }
    }
    
    console.log(`\n✅ Created ${createdTasks.length} tasks`)
    
    // Generate calendar events from tasks
    console.log('\n🗓️ Generating calendar events...')
    
    const eventResponse = await fetch('http://localhost:3000/api/events/generate', {
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
    
    if (eventResponse.ok) {
      const eventData = await eventResponse.json()
      console.log(`✅ Generated ${eventData.eventDrafts?.length || 0} event drafts`)
      
      if (eventData.eventDrafts?.length > 0) {
        console.log('\n📅 Event Schedule:')
        eventData.eventDrafts.forEach(draft => {
          const start = new Date(draft.startsAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
          const end = new Date(draft.endsAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
          console.log(`   ${start}-${end}: ${draft.title}`)
        })
        
        console.log('\n🎉 Success! Go to your app and:')
        console.log('   1. Click the sparkly ✨ "Plan my day" button')
        console.log('   2. Review the generated events') 
        console.log('   3. Click "Accept All" to add them to your calendar')
      }
    } else {
      const error = await eventResponse.text()
      console.log('❌ Event generation failed:', error)
    }
    
  } catch (error) {
    console.log('❌ Error:', error.message)
    console.log('\n🔧 Troubleshooting:')
    console.log('   1. Make sure the dev server is running: cd apps/web && npm run dev')
    console.log('   2. Sign in to the app at http://localhost:3000')
    console.log('   3. Check the browser console for any errors')
  }
}

function calculateDuration(start, end) {
  const startTime = parseTime(start)
  const endTime = parseTime(end)
  return Math.max(30, endTime - startTime) // Minimum 30 minutes
}

function parseTime(timeStr) {
  const [time, period] = timeStr.split(' ')
  const [hours, minutes] = time.split(':').map(Number)
  let totalMinutes = hours * 60 + (minutes || 0)
  
  if (period === 'PM' && hours !== 12) {
    totalMinutes += 12 * 60
  } else if (period === 'AM' && hours === 12) {
    totalMinutes -= 12 * 60
  }
  
  return totalMinutes
}

// Make fetch available in Node.js
if (!global.fetch) {
  global.fetch = require('node-fetch')
}

createTasksAndEvents().catch(console.error)
