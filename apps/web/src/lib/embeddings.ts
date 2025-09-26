import { openai } from '@/lib/clients/openai'
import { getCachedEmbedding, cacheEmbedding } from './redis'

/**
 * Generate embeddings for text with caching and fallback
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // Try cache first
  const cached = await getCachedEmbedding(text)
  if (cached) {
    return cached
  }

  try {
    // Try OpenAI embeddings
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000), // Limit text length
      encoding_format: 'float'
    })

    const embedding = response.data[0]?.embedding
    if (!embedding) {
      throw new Error('No embedding returned from OpenAI')
    }

    // Cache the result
    await cacheEmbedding(text, embedding)
    return embedding
  } catch (error) {
    console.warn('OpenAI embeddings failed, using fallback:', error)
    
    // Fallback: Generate a simple hash-based vector
    return generateFallbackEmbedding(text)
  }
}

/**
 * Fallback embedding using simple text hashing
 * This allows the system to work without OpenAI API keys
 */
export function generateFallbackEmbedding(text: string): number[] {
  const dimension = 1536 // Same as OpenAI text-embedding-3-small
  const embedding = new Array(dimension).fill(0)
  
  // Simple hash-based approach
  const words = text.toLowerCase().split(/\s+/)
  const uniqueWords = [...new Set(words)]
  
  for (let i = 0; i < uniqueWords.length && i < dimension; i++) {
    const word = uniqueWords[i]
    let hash = 0
    for (let j = 0; j < word.length; j++) {
      const char = word.charCodeAt(j)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    
    // Normalize to [-1, 1] range
    embedding[i % dimension] = (hash % 2000) / 1000 - 1
  }
  
  // Normalize the vector
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0))
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= magnitude
    }
  }
  
  return embedding
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have the same dimension')
  }
  
  let dotProduct = 0
  let normA = 0
  let normB = 0
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  return denominator === 0 ? 0 : dotProduct / denominator
}

/**
 * Find similar chunks using embeddings or fallback text search
 */
export async function findSimilarChunks(
  queryText: string,
  userId: string,
  limit = 5,
  threshold = 0.7
): Promise<Array<{ content: string; similarity: number; metadata?: any }>> {
  const { prisma } = await import('@/lib/clients/prisma')
  
  try {
    // Check if pgvector is available by trying a simple query
    await prisma.$queryRaw`SELECT 1`
    const hasPgVector = true // You could check for vector extension here
    
    if (hasPgVector) {
      // TODO: Implement pgvector similarity search when column is enabled
      // const queryEmbedding = await generateEmbedding(queryText)
      // return await pgvectorSearch(queryEmbedding, userId, limit, threshold)
    }
    
    // Fallback to text-based search
    return await textBasedSearch(queryText, userId, limit)
  } catch (error) {
    console.warn('Embedding search failed, using text fallback:', error)
    return await textBasedSearch(queryText, userId, limit)
  }
}

/**
 * Fallback text-based similarity search
 */
async function textBasedSearch(
  queryText: string,
  userId: string,
  limit: number
): Promise<Array<{ content: string; similarity: number; metadata?: any }>> {
  const { prisma } = await import('@/lib/clients/prisma')
  
  const chunks = await prisma.semanticChunk.findMany({
    where: { userId },
    take: 50, // Get more for filtering
    orderBy: { createdAt: 'desc' }
  })
  
  const queryWords = queryText.toLowerCase().split(/\s+/)
  const scoredChunks = chunks.map(chunk => {
    const chunkWords = chunk.content.toLowerCase().split(/\s+/)
    const commonWords = queryWords.filter(word => chunkWords.includes(word))
    const similarity = commonWords.length / Math.max(queryWords.length, chunkWords.length)
    
    return {
      content: chunk.content,
      similarity,
      metadata: chunk.metadata
    }
  })
  
  return scoredChunks
    .filter(chunk => chunk.similarity > 0.1)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
}

/**
 * Create semantic chunks from text with embeddings
 */
export async function createSemanticChunk(
  userId: string,
  content: string,
  source: 'EMAIL' | 'SLACK' | 'MANUAL' | 'CALENDAR',
  chunkType: string,
  sourceId?: string,
  metadata?: any
) {
  const { prisma } = await import('@/lib/clients/prisma')
  
  // Generate embedding (or fallback)
  const embedding = await generateEmbedding(content)
  
  // For now, we'll store without the embedding column until pgvector is enabled
  return await prisma.semanticChunk.create({
    data: {
      userId,
      content,
      source,
      sourceId,
      chunkType,
      metadata,
      // embedding would go here when pgvector is enabled
    }
  })
}
