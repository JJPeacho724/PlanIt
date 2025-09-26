'use client'

import { useState } from 'react'
import { ThumbsUp, ThumbsDown, Brain, Star, BookOpen, Zap } from 'lucide-react'

interface LearningMetadata {
  variant?: string
  confidence?: number
  personalized?: boolean
  usedSources?: string[]
  canProvideFeedback?: boolean
}

interface LearningFeedbackProps {
  learning: LearningMetadata
  planContent: string
  onFeedback?: (feedback: 'positive' | 'negative', details?: string) => void
  className?: string
}

export function LearningFeedback({ learning, planContent, onFeedback, className = '' }: LearningFeedbackProps) {
  const [feedbackGiven, setFeedbackGiven] = useState<'positive' | 'negative' | null>(null)
  const [feedbackDetails, setFeedbackDetails] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleFeedback = async (type: 'positive' | 'negative') => {
    if (!learning.canProvideFeedback || isSubmitting) return
    
    setIsSubmitting(true)
    
    try {
      // Send signal to the learning system
      await fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: type === 'positive' ? 'plan_accepted' : 'plan_rejected',
          signal: JSON.stringify({
            planContent: planContent.slice(0, 200),
            variant: learning.variant,
            confidence: learning.confidence,
            personalized: learning.personalized,
            feedback: type,
            details: feedbackDetails,
            timestamp: new Date().toISOString()
          }),
          delta: type === 'positive' ? 0.2 : -0.1,
          banditKey: learning.variant ? `planner:variant:${learning.variant}` : undefined,
          success: type === 'positive',
          metadata: {
            usedSources: learning.usedSources,
            confidence: learning.confidence
          }
        })
      })
      
      setFeedbackGiven(type)
      onFeedback?.(type, feedbackDetails)
    } catch (error) {
      console.error('Failed to submit feedback:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return 'text-gray-500'
    if (confidence >= 0.8) return 'text-green-600'
    if (confidence >= 0.5) return 'text-yellow-600'
    return 'text-orange-600'
  }

  const getConfidenceLabel = (confidence?: number) => {
    if (!confidence) return 'Unknown'
    if (confidence >= 0.8) return 'High'
    if (confidence >= 0.5) return 'Medium'
    return 'Learning'
  }

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'user_profile': return <Star className="h-3 w-3" />
      case 'learned_patterns': return <Brain className="h-3 w-3" />
      case 'semantic_memory': return <BookOpen className="h-3 w-3" />
      case 'current_tasks': return <Zap className="h-3 w-3" />
      default: return <Brain className="h-3 w-3" />
    }
  }

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'user_profile': return 'Profile'
      case 'learned_patterns': return 'Patterns'
      case 'semantic_memory': return 'Memory'
      case 'current_tasks': return 'Tasks'
      case 'calendar_events': return 'Calendar'
      default: return source
    }
  }

  if (!learning.canProvideFeedback) {
    return null
  }

  return (
    <div className={`bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-4 border border-blue-200 ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="h-5 w-5 text-blue-600" />
          <h4 className="font-medium text-gray-900">
            {learning.personalized ? 'Personalized Plan' : 'AI Plan'}
          </h4>
          {learning.variant && (
            <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-full">
              Variant {learning.variant}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500">Confidence:</span>
          <span className={`text-xs font-medium ${getConfidenceColor(learning.confidence)}`}>
            {learning.confidence ? `${Math.round(learning.confidence * 100)}%` : 'N/A'}
            <span className="ml-1 text-gray-400">
              ({getConfidenceLabel(learning.confidence)})
            </span>
          </span>
        </div>
      </div>

      {/* Data sources */}
      {learning.usedSources && learning.usedSources.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-gray-500 mb-1">Based on:</div>
          <div className="flex flex-wrap gap-1">
            {learning.usedSources.map((source, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-white bg-opacity-60 text-gray-700 rounded-full border"
              >
                {getSourceIcon(source)}
                {getSourceLabel(source)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Feedback section */}
      {feedbackGiven ? (
        <div className="flex items-center gap-2 text-sm">
          {feedbackGiven === 'positive' ? (
            <>
              <ThumbsUp className="h-4 w-4 text-green-600" />
              <span className="text-green-700">Thanks for the positive feedback! This helps me learn.</span>
            </>
          ) : (
            <>
              <ThumbsDown className="h-4 w-4 text-orange-600" />
              <span className="text-orange-700">Thanks for the feedback! I'll use this to improve.</span>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-gray-600">
            Help me learn by rating this plan:
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleFeedback('positive')}
              disabled={isSubmitting}
              className="flex items-center gap-1 px-3 py-1 text-sm bg-green-100 hover:bg-green-200 text-green-700 rounded-md transition-colors disabled:opacity-50"
            >
              <ThumbsUp className="h-3 w-3" />
              Helpful
            </button>
            
            <button
              onClick={() => handleFeedback('negative')}
              disabled={isSubmitting}
              className="flex items-center gap-1 px-3 py-1 text-sm bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-md transition-colors disabled:opacity-50"
            >
              <ThumbsDown className="h-3 w-3" />
              Not helpful
            </button>
          </div>

          <input
            type="text"
            placeholder="Optional: What could be improved?"
            value={feedbackDetails}
            onChange={(e) => setFeedbackDetails(e.target.value)}
            className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      )}
    </div>
  )
}

// Hook for easy integration with planner responses
export function useLearningFeedback() {
  const recordSignal = async (
    key: string,
    signal: any,
    delta?: number,
    banditKey?: string,
    success?: boolean,
    metadata?: any
  ) => {
    try {
      const response = await fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          signal: JSON.stringify(signal),
          delta,
          banditKey,
          success,
          metadata
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to record signal')
      }
      
      return await response.json()
    } catch (error) {
      console.error('Failed to record learning signal:', error)
      throw error
    }
  }

  const recordMemory = async (factType: string, key: string, value: string, confidence = 0.9) => {
    try {
      const response = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          remember: {
            factType,
            key,
            value,
            confidence,
            source: 'explicit'
          }
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to record memory')
      }
      
      return await response.json()
    } catch (error) {
      console.error('Failed to record memory:', error)
      throw error
    }
  }

  return {
    recordSignal,
    recordMemory
  }
}
