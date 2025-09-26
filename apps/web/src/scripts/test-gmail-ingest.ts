#!/usr/bin/env tsx

// Test script for Gmail ingestion with enhanced day planning features
import { PrismaClient } from '@prisma/client'
import { ingestGmailForUser } from '@/lib/ingest/gmail'

const prisma = new PrismaClient()

async function testGmailIngest() {
  console.log('🚀 Testing enhanced Gmail ingestion for day planning...')
  
  try {
    // Get a user with Google credentials
    const user = await prisma.user.findFirst({
      include: {
        credentials: {
          where: { provider: 'GOOGLE' }
        }
      }
    })

    if (!user || user.credentials.length === 0) {
      console.log('❌ No user found with Google credentials. Please connect Gmail first.')
      console.log('💡 Visit your app and connect your Google account to test this feature.')
      return
    }

    console.log(`✅ Found user: ${user.email}`)
    console.log('📧 Starting Gmail ingestion for last 5 days...')

    const result = await ingestGmailForUser({
      userId: user.id,
      origin: 'http://localhost:3000'
    })

    if (result.ok) {
      console.log(`✅ Successfully ingested Gmail emails`)
      const tasksCount = result.createdTasks?.length || 0
      console.log(`📝 Created ${tasksCount} tasks from actionable emails`)
      
      // Show some details about created tasks
      if (tasksCount > 0) {
        const tasks = await prisma.task.findMany({
          where: { id: { in: result.createdTasks || [] } },
          include: {
            createdFrom: true
          }
        })

        console.log('\n📋 Created Tasks:')
        for (const task of tasks) {
          console.log(`  • ${task.title}`)
          console.log(`    Priority: ${task.priority}, Tags: [${task.tags.join(', ')}]`)
          const metadata = task.createdFrom?.metadata as any
          console.log(`    From: ${metadata?.from || 'Unknown'}`)
          console.log(`    Subject: ${metadata?.subject || 'No subject'}`)
          console.log('')
        }
      }

      // Show recent email ingests
      const recentEmails = await prisma.messageIngest.findMany({
        where: { 
          userId: user.id, 
          source: 'EMAIL',
          receivedAt: { gte: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) }
        },
        orderBy: { receivedAt: 'desc' },
        take: 5
      })

      console.log(`📨 Recent emails ingested (${recentEmails.length} total):`)
      for (const email of recentEmails) {
        const metadata = email.metadata as any
        console.log(`  • ${metadata?.subject || 'No subject'}`)
        console.log(`    From: ${metadata?.from || 'Unknown'}`)
        console.log(`    Date: ${email.receivedAt.toISOString().split('T')[0]}`)
        console.log('')
      }

    } else {
      console.log(`❌ Gmail ingestion failed: ${result.reason}`)
    }

  } catch (error) {
    console.error('❌ Error testing Gmail ingestion:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// Test the day planning API
async function testDayPlanningAPI() {
  console.log('\n🧠 Testing day planning with email context...')
  
  try {
    const user = await prisma.user.findFirst()
    if (!user) {
      console.log('❌ No user found for day planning test')
      return
    }

    const today = new Date().toISOString().split('T')[0]
    
    // Simulate the API call
    const emailIngests = await prisma.messageIngest.findMany({
      where: {
        userId: user.id,
        source: 'EMAIL',
        receivedAt: { gte: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) }
      },
      orderBy: { receivedAt: 'desc' },
      take: 10
    })

    const tasks = await prisma.task.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 10
    })

    console.log(`📧 Found ${emailIngests.length} recent emails for context`)
    console.log(`📋 Found ${tasks.length} tasks for planning`)
    
    if (emailIngests.length > 0) {
      console.log('\n📬 Email context available for AI day planning:')
      for (const email of emailIngests.slice(0, 3)) {
        const metadata = email.metadata as any
        console.log(`  • ${metadata?.subject || 'No subject'}`)
        console.log(`    From: ${metadata?.from || 'Unknown'}`)
        console.log(`    Has body text: ${metadata?.bodyText ? 'Yes' : 'No'}`)
        console.log('')
      }
    }

    console.log('✅ Day planning API ready for use!')
    console.log(`💡 Call POST /api/planner/email-context with body: { "date": "${today}" }`)

  } catch (error) {
    console.error('❌ Error testing day planning:', error)
  }
}

if (require.main === module) {
  testGmailIngest()
    .then(() => testDayPlanningAPI())
    .catch(console.error)
}
