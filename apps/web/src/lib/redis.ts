import { createClient } from 'redis'

// Redis client for short-term memory and caching
let redis: ReturnType<typeof createClient> | null = null

export async function getRedis() {
  if (!redis) {
    try {
      redis = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
      })

      redis.on('error', (err) => {
        console.log('Redis Client Error (will use memory fallback):', err.message)
      })

      redis.on('connect', () => {
        console.log('Connected to Redis')
      })

      redis.on('disconnect', () => {
        console.log('Disconnected from Redis')
      })

      await redis.connect()
    } catch (error) {
      console.log('Redis not available, using memory fallback')
      redis = null
      throw error
    }
  }

  return redis
}

/**
 * Store short-term working memory for a user session
 */
export async function setWorkingMemory(
  userId: string,
  key: string,
  value: any,
  ttlSeconds = 3600 // 1 hour default
) {
  try {
    const client = await getRedis()
    const redisKey = `working_memory:${userId}:${key}`
    await client.setEx(redisKey, ttlSeconds, JSON.stringify(value))
  } catch (error) {
    console.warn('Failed to set working memory:', error)
    // Graceful fallback - don't fail the request
  }
}

/**
 * Retrieve short-term working memory for a user session
 */
export async function getWorkingMemory(userId: string, key: string) {
  try {
    const client = await getRedis()
    const redisKey = `working_memory:${userId}:${key}`
    const value = await client.get(redisKey)
    return value ? JSON.parse(value) : null
  } catch (error) {
    console.warn('Failed to get working memory:', error)
    return null
  }
}

/**
 * Store recent conversation context
 */
export async function setConversationContext(
  userId: string,
  context: {
    messages: Array<{ role: string; content: string }>
    planningState?: any
    lastPlanRequest?: string
  },
  ttlSeconds = 1800 // 30 minutes
) {
  return setWorkingMemory(userId, 'conversation_context', context, ttlSeconds)
}

/**
 * Get recent conversation context
 */
export async function getConversationContext(userId: string) {
  return getWorkingMemory(userId, 'conversation_context')
}

/**
 * Cache embeddings temporarily
 */
export async function cacheEmbedding(
  text: string,
  embedding: number[],
  ttlSeconds = 86400 // 24 hours
) {
  try {
    const client = await getRedis()
    const textHash = Buffer.from(text).toString('base64').slice(0, 32)
    const redisKey = `embedding:${textHash}`
    await client.setEx(redisKey, ttlSeconds, JSON.stringify(embedding))
  } catch (error) {
    console.warn('Failed to cache embedding:', error)
  }
}

/**
 * Get cached embedding
 */
export async function getCachedEmbedding(text: string): Promise<number[] | null> {
  try {
    const client = await getRedis()
    const textHash = Buffer.from(text).toString('base64').slice(0, 32)
    const redisKey = `embedding:${textHash}`
    const value = await client.get(redisKey)
    return value ? JSON.parse(value) : null
  } catch (error) {
    console.warn('Failed to get cached embedding:', error)
    return null
  }
}

/**
 * Graceful shutdown
 */
export async function disconnectRedis() {
  if (redis) {
    await redis.disconnect()
    redis = null
  }
}

// Handle process shutdown
process.on('SIGINT', async () => {
  await disconnectRedis()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await disconnectRedis()
  process.exit(0)
})
