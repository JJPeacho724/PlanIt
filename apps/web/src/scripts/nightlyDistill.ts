/**
 * Nightly distillation worker
 * Processes user signals and sources to extract structured facts and semantic chunks
 */

import { prisma } from '@/lib/clients/prisma'
import { createSemanticChunk, generateEmbedding } from '@/lib/embeddings'
import { recordSignal } from '@/lib/bandit'

interface DistillationConfig {
  daysToProcess: number
  maxSignalsPerUser: number
  maxMessagesPerUser: number
  confidenceThreshold: number
}

const DEFAULT_CONFIG: DistillationConfig = {
  daysToProcess: 7,
  maxSignalsPerUser: 100,
  maxMessagesPerUser: 50,
  confidenceThreshold: 0.3
}

/**
 * Main distillation process
 */
async function runNightlyDistillation(config: DistillationConfig = DEFAULT_CONFIG) {
  console.log('🌙 Starting nightly distillation process...')
  
  const startTime = Date.now()
  let processedUsers = 0
  let extractedFacts = 0
  let createdChunks = 0

  try {
    // Get all users with recent activity
    const activeUsers = await getActiveUsers(config.daysToProcess)
    console.log(`📊 Found ${activeUsers.length} active users`)

    for (const user of activeUsers) {
      try {
        console.log(`👤 Processing user: ${user.id}`)
        
        const userResults = await processUserDistillation(user.id, config)
        extractedFacts += userResults.factsExtracted
        createdChunks += userResults.chunksCreated
        processedUsers++
        
        console.log(`✅ User ${user.id}: ${userResults.factsExtracted} facts, ${userResults.chunksCreated} chunks`)
      } catch (error) {
        console.error(`❌ Failed to process user ${user.id}:`, error)
      }
    }

    const duration = Date.now() - startTime
    console.log(`🎉 Distillation complete! Processed ${processedUsers} users in ${duration}ms`)
    console.log(`📈 Results: ${extractedFacts} facts extracted, ${createdChunks} chunks created`)

  } catch (error) {
    console.error('💥 Nightly distillation failed:', error)
    throw error
  }
}

/**
 * Get users with recent activity
 */
async function getActiveUsers(days: number) {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  
  return await prisma.user.findMany({
    where: {
      OR: [
        { signals: { some: { createdAt: { gte: cutoffDate } } } },
        { ingestedMsgs: { some: { createdAt: { gte: cutoffDate } } } },
        { tasks: { some: { createdAt: { gte: cutoffDate } } } }
      ]
    },
    select: { id: true, email: true }
  })
}

/**
 * Process distillation for a single user
 */
async function processUserDistillation(
  userId: string, 
  config: DistillationConfig
): Promise<{ factsExtracted: number; chunksCreated: number }> {
  let factsExtracted = 0
  let chunksCreated = 0

  // 1. Process signals to extract behavioral patterns
  const signalFacts = await extractFactsFromSignals(userId, config)
  factsExtracted += signalFacts

  // 2. Process email messages to create semantic chunks
  const emailChunks = await createChunksFromEmails(userId, config)
  chunksCreated += emailChunks

  // 3. Process tasks to extract preferences
  const taskFacts = await extractFactsFromTasks(userId, config)
  factsExtracted += taskFacts

  // 4. Update user profile with discovered patterns
  await updateUserProfile(userId)

  return { factsExtracted, chunksCreated }
}

/**
 * Extract facts from user signals
 */
async function extractFactsFromSignals(
  userId: string, 
  config: DistillationConfig
): Promise<number> {
  const cutoffDate = new Date(Date.now() - config.daysToProcess * 24 * 60 * 60 * 1000)
  
  const signals = await prisma.signal.findMany({
    where: {
      userId,
      createdAt: { gte: cutoffDate }
    },
    orderBy: { createdAt: 'desc' },
    take: config.maxSignalsPerUser
  })

  let extractedCount = 0

  // Analyze plan acceptance patterns
  const planSignals = signals.filter(s => s.key.includes('plan_'))
  if (planSignals.length > 5) {
    const acceptanceRate = planSignals.filter(s => s.success === true).length / planSignals.length
    
    if (acceptanceRate > 0.7) {
      await upsertUserFact(userId, 'pattern', 'plan_acceptance', 'high', 0.6, 'signals')
      extractedCount++
    } else if (acceptanceRate < 0.3) {
      await upsertUserFact(userId, 'pattern', 'plan_acceptance', 'low', 0.6, 'signals')
      extractedCount++
    }
  }

  // Analyze time-of-day patterns
  const planGenerationTimes = signals
    .filter(s => s.key === 'plan_generated')
    .map(s => new Date(s.createdAt).getHours())
  
  if (planGenerationTimes.length > 3) {
    const avgHour = Math.round(planGenerationTimes.reduce((a, b) => a + b, 0) / planGenerationTimes.length)
    let timePattern = 'unknown'
    
    if (avgHour < 10) timePattern = 'early_bird'
    else if (avgHour > 18) timePattern = 'night_owl'
    else timePattern = 'normal_hours'
    
    await upsertUserFact(userId, 'pattern', 'planning_time', timePattern, 0.5, 'signals')
    extractedCount++
  }

  return extractedCount
}

/**
 * Create semantic chunks from recent emails
 */
async function createChunksFromEmails(
  userId: string, 
  config: DistillationConfig
): Promise<number> {
  const cutoffDate = new Date(Date.now() - config.daysToProcess * 24 * 60 * 60 * 1000)
  
  const messages = await prisma.messageIngest.findMany({
    where: {
      userId,
      source: 'EMAIL',
      createdAt: { gte: cutoffDate }
    },
    orderBy: { receivedAt: 'desc' },
    take: config.maxMessagesPerUser
  })

  let createdCount = 0

  for (const message of messages) {
    try {
      const metadata = message.metadata as any
      
      // Skip if we already processed this message
      const existingChunk = await prisma.semanticChunk.findFirst({
        where: {
          userId,
          sourceId: message.id,
          source: 'EMAIL'
        }
      })
      
      if (existingChunk) continue

      // Create chunk from email content
      const content = `Email from ${metadata?.from || 'unknown'}: ${metadata?.subject || 'No subject'}\n${metadata?.bodyText?.slice(0, 1000) || 'No content'}`
      
      if (content.length > 50) {
        await createSemanticChunk(
          userId,
          content,
          'EMAIL',
          'email_thread',
          message.id,
          {
            from: metadata?.from,
            subject: metadata?.subject,
            receivedAt: message.receivedAt.toISOString()
          }
        )
        createdCount++
      }
    } catch (error) {
      console.warn(`Failed to create chunk from message ${message.id}:`, error)
    }
  }

  return createdCount
}

/**
 * Extract facts from task patterns
 */
async function extractFactsFromTasks(
  userId: string, 
  config: DistillationConfig
): Promise<number> {
  const cutoffDate = new Date(Date.now() - config.daysToProcess * 24 * 60 * 60 * 1000)
  
  const tasks = await prisma.task.findMany({
    where: {
      userId,
      createdAt: { gte: cutoffDate }
    },
    orderBy: { createdAt: 'desc' }
  })

  let extractedCount = 0

  // Analyze effort estimation patterns
  const tasksWithEffort = tasks.filter(t => t.effortMinutes && t.effortMinutes > 0)
  if (tasksWithEffort.length > 3) {
    const avgEffort = tasksWithEffort.reduce((sum, t) => sum + (t.effortMinutes || 0), 0) / tasksWithEffort.length
    
    let effortPattern = 'medium'
    if (avgEffort < 30) effortPattern = 'short_tasks'
    else if (avgEffort > 120) effortPattern = 'long_tasks'
    
    await upsertUserFact(userId, 'pattern', 'task_effort', effortPattern, 0.4, 'tasks')
    extractedCount++
  }

  // Analyze priority patterns
  const tasksWithPriority = tasks.filter(t => t.priority !== null)
  if (tasksWithPriority.length > 5) {
    const avgPriority = tasksWithPriority.reduce((sum, t) => sum + (t.priority || 0), 0) / tasksWithPriority.length
    
    let priorityPattern = 'mixed'
    if (avgPriority > 2) priorityPattern = 'high_priority_focused'
    else if (avgPriority < 1) priorityPattern = 'low_priority_comfortable'
    
    await upsertUserFact(userId, 'pattern', 'priority_preference', priorityPattern, 0.4, 'tasks')
    extractedCount++
  }

  return extractedCount
}

/**
 * Update user profile with discovered patterns
 */
async function updateUserProfile(userId: string) {
  const highConfidenceFacts = await prisma.userFact.findMany({
    where: {
      userId,
      confidence: { gte: 0.6 }
    }
  })

  // Build profile summary
  const profileUpdate: any = {
    patterns: {},
    preferences: {},
    constraints: {},
    lastDistilled: new Date().toISOString()
  }

  for (const fact of highConfidenceFacts) {
    if (fact.factType === 'pattern') {
      profileUpdate.patterns[fact.key] = fact.value
    } else if (fact.factType === 'preference') {
      profileUpdate.preferences[fact.key] = fact.value
    } else if (fact.factType === 'constraint') {
      profileUpdate.constraints[fact.key] = fact.value
    }
  }

  // Update or create user profile
  await prisma.userProfile.upsert({
    where: { userId },
    update: { profileJson: profileUpdate },
    create: { userId, profileJson: profileUpdate }
  })
}

/**
 * Helper to upsert user facts
 */
async function upsertUserFact(
  userId: string,
  factType: string,
  key: string,
  value: string,
  confidence: number,
  source: string
) {
  await prisma.userFact.upsert({
    where: {
      userId_factType_key: { userId, factType, key }
    },
    update: {
      value,
      confidence: { increment: confidence },
      source,
      lastValidated: new Date()
    },
    create: {
      userId,
      factType,
      key,
      value,
      confidence,
      source,
      lastValidated: new Date()
    }
  })
}

/**
 * Demo user seeding (for development)
 */
async function seedDemoUser() {
  console.log('🎭 Seeding demo user and profile...')
  
  // First, ensure the demo user exists
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@example.com' },
    update: {},
    create: {
      id: 'demo-user',
      email: 'demo@example.com',
      name: 'Demo User',
      profile: {
        demo: true,
        createdAt: new Date().toISOString()
      }
    }
  })
  
  console.log('✅ Demo user created/found:', demoUser.id)
  
  // Then create the learning profile
  await prisma.userProfile.upsert({
    where: { userId: demoUser.id },
    update: {
      profileJson: {
        goals: ["Ship APM apps", "Workout 5x/week", "Learn new technologies"],
        constraints: {
          work_hours: "9-18",
          no_meetings_before: "10:00",
          lunch_break: "12:00-13:00"
        },
        preferences: {
          planning_style: "time_blocking",
          break_duration: "15min",
          deep_work_blocks: "90min",
          energy_pattern: "morning_person"
        },
        patterns: {
          plan_acceptance: "high",
          planning_time: "early_bird",
          task_effort: "medium",
          priority_preference: "high_priority_focused"
        }
      }
    },
    create: {
      userId: demoUser.id,
      profileJson: {
        goals: ["Ship APM apps", "Workout 5x/week", "Learn new technologies"],
        constraints: {
          work_hours: "9-18",
          no_meetings_before: "10:00",
          lunch_break: "12:00-13:00"
        },
        preferences: {
          planning_style: "time_blocking",
          break_duration: "15min",
          deep_work_blocks: "90min",
          energy_pattern: "morning_person"
        }
      }
    }
  })
  
  // Create some sample facts
  const sampleFacts = [
    { factType: 'preference', key: 'work_hours', value: '9-18', confidence: 0.9 },
    { factType: 'preference', key: 'break_duration', value: '15min', confidence: 0.8 },
    { factType: 'pattern', key: 'energy_peak', value: 'morning', confidence: 0.7 },
    { factType: 'constraint', key: 'no_meetings_before', value: '10:00', confidence: 0.9 }
  ]
  
  for (const fact of sampleFacts) {
    await upsertUserFact(demoUser.id, fact.factType, fact.key, fact.value, fact.confidence, 'demo')
  }
  
  console.log('✅ Demo user seeded successfully')
}

// Main execution
async function main() {
  const args = process.argv.slice(2)
  
  if (args.includes('--seed-demo')) {
    await seedDemoUser()
  } else {
    await runNightlyDistillation()
  }
}

// Run if called directly (ES module compatible)
const isMainModule = process.argv[1] === new URL(import.meta.url).pathname
if (isMainModule) {
  main()
    .then(() => {
      console.log('🎉 Distillation complete')
      process.exit(0)
    })
    .catch((error) => {
      console.error('💥 Distillation failed:', error)
      process.exit(1)
    })
}

export { runNightlyDistillation, seedDemoUser }
