/**
 * Daily decay worker
 * Applies exponential decay to user facts and cleans up old data
 */

import { prisma } from '@/lib/clients/prisma'

interface DecayConfig {
  maxAge: number // Maximum age in days before facts are deleted
  minConfidence: number // Minimum confidence before facts are deleted
  batchSize: number // Number of records to process at once
}

const DEFAULT_CONFIG: DecayConfig = {
  maxAge: 90, // 3 months
  minConfidence: 0.01, // 1%
  batchSize: 100
}

/**
 * Main decay process
 */
async function runDailyDecay(config: DecayConfig = DEFAULT_CONFIG) {
  console.log('⏰ Starting daily decay process...')
  
  const startTime = Date.now()
  let processedFacts = 0
  let deletedFacts = 0
  let deletedChunks = 0
  let deletedSignals = 0

  try {
    // 1. Apply exponential decay to user facts
    const decayResults = await applyFactDecay(config)
    processedFacts = decayResults.processed
    deletedFacts = decayResults.deleted

    // 2. Clean up old semantic chunks
    deletedChunks = await cleanupOldChunks(config)

    // 3. Clean up old signals
    deletedSignals = await cleanupOldSignals(config)

    // 4. Update bandit policy statistics
    await updateBanditStatistics()

    const duration = Date.now() - startTime
    console.log(`🎉 Decay complete! Processed in ${duration}ms`)
    console.log(`📊 Results:`)
    console.log(`  - Facts processed: ${processedFacts}`)
    console.log(`  - Facts deleted: ${deletedFacts}`)
    console.log(`  - Chunks deleted: ${deletedChunks}`)
    console.log(`  - Signals deleted: ${deletedSignals}`)

  } catch (error) {
    console.error('💥 Daily decay failed:', error)
    throw error
  }
}

/**
 * Apply exponential decay to user facts based on half-life
 */
async function applyFactDecay(config: DecayConfig): Promise<{ processed: number; deleted: number }> {
  console.log('📉 Applying fact decay...')
  
  let processed = 0
  let deleted = 0
  let offset = 0
  
  while (true) {
    const facts = await prisma.userFact.findMany({
      take: config.batchSize,
      skip: offset,
      orderBy: { updatedAt: 'asc' }
    })
    
    if (facts.length === 0) break
    
    for (const fact of facts) {
      const ageInDays = Math.floor((Date.now() - fact.updatedAt.getTime()) / (1000 * 60 * 60 * 24))
      
      // Skip if fact was updated recently (same day)
      if (ageInDays === 0) {
        processed++
        continue
      }
      
      // Calculate decay based on half-life
      const halfLifeDays = fact.halfLifeDays
      const decayFactor = Math.pow(0.5, ageInDays / halfLifeDays)
      const newConfidence = fact.confidence * decayFactor
      
      // Delete if confidence is too low or fact is too old
      if (newConfidence < config.minConfidence || ageInDays > config.maxAge) {
        await prisma.userFact.delete({
          where: { id: fact.id }
        })
        deleted++
        console.log(`🗑️ Deleted fact: ${fact.factType}:${fact.key} (confidence: ${newConfidence.toFixed(3)})`)
      } else {
        // Update with decayed confidence
        await prisma.userFact.update({
          where: { id: fact.id },
          data: { confidence: newConfidence }
        })
        processed++
      }
    }
    
    offset += config.batchSize
    
    // Log progress every 1000 records
    if (processed % 1000 === 0) {
      console.log(`📊 Processed ${processed} facts, deleted ${deleted}`)
    }
  }
  
  return { processed, deleted }
}

/**
 * Clean up old semantic chunks
 */
async function cleanupOldChunks(config: DecayConfig): Promise<number> {
  console.log('🧹 Cleaning up old semantic chunks...')
  
  const cutoffDate = new Date(Date.now() - config.maxAge * 24 * 60 * 60 * 1000)
  
  const result = await prisma.semanticChunk.deleteMany({
    where: {
      createdAt: { lt: cutoffDate }
    }
  })
  
  console.log(`🗑️ Deleted ${result.count} old semantic chunks`)
  return result.count
}

/**
 * Clean up old signals (keep for analysis but not forever)
 */
async function cleanupOldSignals(config: DecayConfig): Promise<number> {
  console.log('🧹 Cleaning up old signals...')
  
  // Keep signals longer than other data for analysis (6 months)
  const signalRetentionDays = Math.max(config.maxAge * 2, 180)
  const cutoffDate = new Date(Date.now() - signalRetentionDays * 24 * 60 * 60 * 1000)
  
  const result = await prisma.signal.deleteMany({
    where: {
      createdAt: { lt: cutoffDate }
    }
  })
  
  console.log(`🗑️ Deleted ${result.count} old signals`)
  return result.count
}

/**
 * Update bandit policy statistics and clean up unused arms
 */
async function updateBanditStatistics() {
  console.log('🎰 Updating bandit statistics...')
  
  // Find bandit policies with no recent activity
  const inactivePolicies = await prisma.banditPolicy.findMany({
    where: {
      AND: [
        { pulls: 0 },
        { createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } // 30 days old
      ]
    }
  })
  
  // Delete inactive policies
  for (const policy of inactivePolicies) {
    await prisma.banditPolicy.delete({
      where: { id: policy.id }
    })
  }
  
  console.log(`🗑️ Cleaned up ${inactivePolicies.length} inactive bandit policies`)
  
  // Reset epsilon for users with sufficient data
  const userStats = await prisma.banditPolicy.groupBy({
    by: ['userId', 'banditKey'],
    _sum: { pulls: true },
    having: {
      pulls: { _sum: { gte: 100 } } // Users with 100+ pulls
    }
  })
  
  console.log(`📊 Found ${userStats.length} mature bandit experiments`)
}

/**
 * Generate decay report for monitoring
 */
async function generateDecayReport() {
  console.log('📋 Generating decay report...')
  
  const report = {
    timestamp: new Date().toISOString(),
    userStats: await getUserStats(),
    factStats: await getFactStats(),
    chunkStats: await getChunkStats(),
    signalStats: await getSignalStats(),
    banditStats: await getBanditStats()
  }
  
  console.log('📊 Decay Report:')
  console.log(JSON.stringify(report, null, 2))
  
  return report
}

async function getUserStats() {
  const totalUsers = await prisma.user.count()
  const activeUsers = await prisma.user.count({
    where: {
      OR: [
        { signals: { some: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } } },
        { chunks: { some: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } } }
      ]
    }
  })
  
  return { totalUsers, activeUsers }
}

async function getFactStats() {
  const totalFacts = await prisma.userFact.count()
  const highConfidenceFacts = await prisma.userFact.count({
    where: { confidence: { gte: 0.7 } }
  })
  const avgConfidence = await prisma.userFact.aggregate({
    _avg: { confidence: true }
  })
  
  return { 
    totalFacts, 
    highConfidenceFacts, 
    avgConfidence: avgConfidence._avg.confidence 
  }
}

async function getChunkStats() {
  const totalChunks = await prisma.semanticChunk.count()
  const chunksBySource = await prisma.semanticChunk.groupBy({
    by: ['source'],
    _count: true
  })
  
  return { totalChunks, chunksBySource }
}

async function getSignalStats() {
  const totalSignals = await prisma.signal.count()
  const recentSignals = await prisma.signal.count({
    where: {
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }
  })
  
  return { totalSignals, recentSignals }
}

async function getBanditStats() {
  const totalPolicies = await prisma.banditPolicy.count()
  const activePolicies = await prisma.banditPolicy.count({
    where: { pulls: { gt: 0 } }
  })
  
  return { totalPolicies, activePolicies }
}

/**
 * Vacuum database to reclaim space (PostgreSQL specific)
 */
async function vacuumDatabase() {
  try {
    console.log('🧹 Running database vacuum...')
    
    // Note: This requires appropriate database permissions
    await prisma.$executeRaw`VACUUM ANALYZE`
    
    console.log('✅ Database vacuum completed')
  } catch (error) {
    console.warn('⚠️ Database vacuum failed (this may be normal):', error)
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2)
  
  if (args.includes('--report-only')) {
    await generateDecayReport()
  } else if (args.includes('--vacuum')) {
    await vacuumDatabase()
  } else {
    await runDailyDecay()
    await generateDecayReport()
    
    if (args.includes('--with-vacuum')) {
      await vacuumDatabase()
    }
  }
}

// Run if called directly (ES module compatible)
const isMainModule = process.argv[1] === new URL(import.meta.url).pathname
if (isMainModule) {
  main()
    .then(() => {
      console.log('🎉 Daily decay complete')
      process.exit(0)
    })
    .catch((error) => {
      console.error('💥 Daily decay failed:', error)
      process.exit(1)
    })
}

export { runDailyDecay, generateDecayReport }
