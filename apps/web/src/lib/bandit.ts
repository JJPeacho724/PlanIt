/**
 * Multi-armed bandit implementation for A/B testing planner variants
 */

import { prisma } from '@/lib/clients/prisma'

export interface BanditArm {
  name: string
  pulls: number
  rewards: number
  successRate: number
  confidenceInterval: [number, number]
}

export class EpsilonGreedyBandit {
  private epsilon: number
  private decayRate: number

  constructor(epsilon = 0.1, decayRate = 0.99) {
    this.epsilon = epsilon
    this.decayRate = decayRate
  }

  /**
   * Select a variant using epsilon-greedy strategy with graceful fallback
   */
  async selectVariant(userId: string, banditKey: string): Promise<string> {
    try {
      const arms = await this.getBanditArms(userId, banditKey)
      
      // If no arms exist, create default variants
      if (arms.length === 0) {
        await this.initializeDefaultArms(userId, banditKey)
        return 'A' // Default to variant A
      }

      // Epsilon-greedy selection
      if (Math.random() < this.epsilon) {
        // Explore: randomly select an arm
        const randomArm = arms[Math.floor(Math.random() * arms.length)]
        await this.incrementPulls(userId, banditKey, randomArm.name)
        return randomArm.name
      } else {
        // Exploit: select the arm with highest success rate
        const bestArm = arms.reduce((best, current) => 
          current.successRate > best.successRate ? current : best
        )
        await this.incrementPulls(userId, banditKey, bestArm.name)
        return bestArm.name
      }
    } catch (error) {
      console.log('Bandit tables not available, using fallback variant selection')
      // Fallback to random selection when tables don't exist
      const variants = ['A', 'B', 'C']
      return variants[Math.floor(Math.random() * variants.length)]
    }
  }

  /**
   * Record outcome for a bandit arm
   */
  async recordOutcome(
    userId: string, 
    banditKey: string, 
    armName: string, 
    success: boolean
  ): Promise<void> {
    try {
      if (success) {
        await prisma.banditPolicy.update({
          where: {
            userId_banditKey_armName: {
              userId,
              banditKey,
              armName
            }
          },
          data: {
            rewards: { increment: 1 }
          }
        })
      }

      // Record in signals table for analysis
      await prisma.signal.create({
        data: {
          userId,
          key: `bandit_outcome:${banditKey}`,
          signal: armName,
          banditKey: `${banditKey}:${armName}`,
          success,
          metadata: {
            timestamp: new Date().toISOString(),
            banditKey,
            armName
          }
        }
      })

      // Decay epsilon over time
      this.epsilon *= this.decayRate
    } catch (error) {
      console.error('Failed to record bandit outcome:', error)
    }
  }

  /**
   * Get current bandit arms with statistics
   */
  async getBanditArms(userId: string, banditKey: string): Promise<BanditArm[]> {
    const policies = await prisma.banditPolicy.findMany({
      where: { userId, banditKey },
      orderBy: { armName: 'asc' }
    })

    return policies.map(policy => {
      const successRate = policy.pulls > 0 ? policy.rewards / policy.pulls : 0
      const confidenceInterval = this.calculateConfidenceInterval(
        policy.rewards, 
        policy.pulls
      )

      return {
        name: policy.armName,
        pulls: policy.pulls,
        rewards: policy.rewards,
        successRate,
        confidenceInterval
      }
    })
  }

  /**
   * Calculate Wilson confidence interval for success rate
   */
  private calculateConfidenceInterval(
    successes: number, 
    trials: number, 
    confidence = 0.95
  ): [number, number] {
    if (trials === 0) return [0, 1]

    const z = 1.96 // 95% confidence
    const p = successes / trials
    const n = trials

    const denominator = 1 + (z * z) / n
    const center = (p + (z * z) / (2 * n)) / denominator
    const margin = (z / denominator) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))

    return [
      Math.max(0, center - margin),
      Math.min(1, center + margin)
    ]
  }

  /**
   * Initialize default arms for a new bandit
   */
  private async initializeDefaultArms(userId: string, banditKey: string): Promise<void> {
    const defaultArms = ['A', 'B', 'C']
    
    for (const armName of defaultArms) {
      await prisma.banditPolicy.create({
        data: {
          userId,
          banditKey,
          armName,
          pulls: 0,
          rewards: 0
        }
      })
    }
  }

  /**
   * Increment pull count for an arm
   */
  private async incrementPulls(
    userId: string, 
    banditKey: string, 
    armName: string
  ): Promise<void> {
    await prisma.banditPolicy.upsert({
      where: {
        userId_banditKey_armName: {
          userId,
          banditKey,
          armName
        }
      },
      update: {
        pulls: { increment: 1 }
      },
      create: {
        userId,
        banditKey,
        armName,
        pulls: 1,
        rewards: 0
      }
    })
  }
}

/**
 * Learning service for processing user signals
 */
export class LearningService {
  /**
   * Record a user signal for learning with graceful fallback
   */
  async recordSignal(
    userId: string,
    key: string,
    signal: string,
    delta?: number,
    banditKey?: string,
    success?: boolean,
    metadata?: any
  ): Promise<void> {
    try {
      await prisma.signal.create({
        data: {
          userId,
          key,
          signal,
          delta,
          banditKey,
          success,
          metadata: {
            ...metadata,
            timestamp: new Date().toISOString()
          }
        }
      })

      // Process immediate learning updates
      await this.processSignalLearning(userId, key, signal, delta)
    } catch (error) {
      console.log('Signal tables not available, signal not recorded:', { key, userId })
      // Graceful degradation - don't fail the request
    }
  }

  /**
   * Process signal for immediate learning updates
   */
  private async processSignalLearning(
    userId: string,
    key: string,
    signal: string,
    delta?: number
  ): Promise<void> {
    // Update user facts based on signals
    switch (key) {
      case 'plan_accepted':
        await this.updatePlanningPreferences(userId, signal, true, delta)
        break
      case 'plan_rejected':
        await this.updatePlanningPreferences(userId, signal, false, delta)
        break
      case 'task_completed':
        await this.updateTaskPatterns(userId, signal, delta)
        break
      case 'optimal_time_confirmed':
        await this.updateTimePreferences(userId, signal, delta)
        break
    }
  }

  /**
   * Update planning preferences based on acceptance/rejection
   */
  private async updatePlanningPreferences(
    userId: string,
    signal: string,
    accepted: boolean,
    delta?: number
  ): Promise<void> {
    const confidence = accepted ? 0.1 : -0.1
    const adjustedConfidence = delta ? confidence * delta : confidence

    // Extract planning characteristics from signal
    const planningData = this.extractPlanningCharacteristics(signal)
    
    for (const [key, value] of Object.entries(planningData)) {
      await this.updateUserFact(
        userId,
        'preference',
        key,
        value,
        adjustedConfidence
      )
    }
  }

  /**
   * Update task completion patterns
   */
  private async updateTaskPatterns(
    userId: string,
    signal: string,
    delta?: number
  ): Promise<void> {
    const confidence = delta || 0.05
    
    // Extract task characteristics
    const taskData = JSON.parse(signal)
    const hour = new Date().getHours()
    const dayOfWeek = new Date().getDay()
    
    await this.updateUserFact(
      userId,
      'pattern',
      'productive_hour',
      hour.toString(),
      confidence
    )
    
    await this.updateUserFact(
      userId,
      'pattern',
      'productive_day',
      dayOfWeek.toString(),
      confidence
    )
  }

  /**
   * Update time preferences
   */
  private async updateTimePreferences(
    userId: string,
    signal: string,
    delta?: number
  ): Promise<void> {
    const confidence = delta || 0.1
    const timeData = JSON.parse(signal)
    
    await this.updateUserFact(
      userId,
      'preference',
      'preferred_time_block',
      timeData.duration,
      confidence
    )
  }

  /**
   * Update or create a user fact
   */
  private async updateUserFact(
    userId: string,
    factType: string,
    key: string,
    value: string,
    confidenceDelta: number
  ): Promise<void> {
    await prisma.userFact.upsert({
      where: {
        userId_factType_key: {
          userId,
          factType,
          key
        }
      },
      update: {
        value,
        confidence: {
          increment: confidenceDelta
        },
        lastValidated: new Date()
      },
      create: {
        userId,
        factType,
        key,
        value,
        confidence: Math.max(0.1, confidenceDelta),
        source: 'inferred',
        lastValidated: new Date()
      }
    })
  }

  /**
   * Extract planning characteristics from signal
   */
  private extractPlanningCharacteristics(signal: string): Record<string, string> {
    try {
      const data = JSON.parse(signal)
      const characteristics: Record<string, string> = {}
      
      if (data.timeOfDay) characteristics.preferred_planning_time = data.timeOfDay
      if (data.breakDuration) characteristics.preferred_break_duration = data.breakDuration
      if (data.workBlockDuration) characteristics.preferred_work_block = data.workBlockDuration
      if (data.planningStyle) characteristics.planning_style = data.planningStyle
      
      return characteristics
    } catch {
      return {}
    }
  }
}

// Export singleton instances
export const bandit = new EpsilonGreedyBandit()
export const learningService = new LearningService()

/**
 * Helper functions for common bandit operations
 */
export async function selectVariant(userId: string, banditKey: string): Promise<string> {
  return bandit.selectVariant(userId, banditKey)
}

export async function recordBanditOutcome(
  userId: string,
  banditKey: string,
  armName: string,
  success: boolean
): Promise<void> {
  return bandit.recordOutcome(userId, banditKey, armName, success)
}

export async function recordSignal(
  userId: string,
  key: string,
  signal: string,
  delta?: number,
  banditKey?: string,
  success?: boolean,
  metadata?: any
): Promise<void> {
  return learningService.recordSignal(userId, key, signal, delta, banditKey, success, metadata)
}
