'use client'

import { useState, useEffect } from 'react'
import { Loader2, Brain, Sparkles, BookOpen, Settings } from 'lucide-react'
import { LearningFeedback, useLearningFeedback } from './LearningFeedback'
import ReactMarkdown from 'react-markdown'

interface PlannerResponse {
  success: boolean
  reply: string
  eventDrafts?: any[]
  learning?: {
    variant?: string
    confidence?: number
    personalized?: boolean
    usedSources?: string[]
    canProvideFeedback?: boolean
  }
  eventGeneration?: {
    eventDrafts: any[]
    metadata: any
    insights: string
  }
}

export function PersonalizedPlanner() {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PlannerResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [autoGenerateEvents, setAutoGenerateEvents] = useState(true)
  const [userPreference, setUserPreference] = useState<boolean | null>(null)
  const { recordSignal, recordMemory } = useLearningFeedback()

  // Load user preferences on component mount
  useEffect(() => {
    const loadUserPreferences = async () => {
      try {
        const response = await fetch('/api/onboarding/preferences')
        if (response.ok) {
          const data = await response.json()
          const userAutoGeneratePref = data.preferences?.planning?.autoGenerateEvents
          if (userAutoGeneratePref !== undefined) {
            setAutoGenerateEvents(userAutoGeneratePref)
            setUserPreference(userAutoGeneratePref)
          }
        }
      } catch (error) {
        console.error('Failed to load user preferences:', error)
      }
    }

    loadUserPreferences()
  }, [])

  const handlePlanRequest = async () => {
    if (!message.trim()) return
    
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          autoGenerateEvents,
          includeGoogleData: true
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate plan')
      }

      const data = await response.json()
      setResult(data)
      
      // Record that a plan was requested
      if (data.learning?.canProvideFeedback) {
        await recordSignal(
          'plan_requested',
          { message, autoGenerateEvents },
          0.05,
          undefined,
          undefined,
          { timestamp: new Date().toISOString() }
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate plan')
    } finally {
      setLoading(false)
    }
  }

  const handleFeedback = async (feedback: 'positive' | 'negative', details?: string) => {
    console.log(`Plan feedback: ${feedback}`, details)
    // The LearningFeedback component handles sending the signal
  }

  const handleAutoGenerateChange = async (checked: boolean) => {
    setAutoGenerateEvents(checked)

    try {
      // Save preference to database
      const response = await fetch('/api/onboarding/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planning: {
            autoGenerateEvents: checked
          }
        })
      })

      if (response.ok) {
        setUserPreference(checked)
        // Record this as a memory for learning
        await recordMemory('preference', 'auto_generate_events', checked ? 'enabled' : 'disabled')
      } else {
        console.error('Failed to save auto-generate preference')
        // Revert on failure
        setAutoGenerateEvents(userPreference ?? true)
      }
    } catch (error) {
      console.error('Failed to save auto-generate preference:', error)
      // Revert on failure
      setAutoGenerateEvents(userPreference ?? true)
    }
  }

  const handleRememberThis = async () => {
    const preference = prompt('What should I remember about your planning preferences?')
    if (preference) {
      try {
        await recordMemory('preference', 'user_stated', preference)
        alert('Preference saved! I\'ll remember this for future plans.')
      } catch (error) {
        alert('Failed to save preference. Please try again.')
      }
    }
  }

  const getQuickSuggestions = () => [
    "Plan my day based on my emails and calendar",
    "Help me prioritize today's tasks",
    "Create a time-blocked schedule for tomorrow", 
    "What should I focus on this morning?",
    "Schedule my important tasks around existing meetings",
    "Plan a productive afternoon work session"
  ]

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
              <Brain className="h-5 w-5 text-blue-600" />
              Personalized AI Planner
            </h3>
            <button
              onClick={handleRememberThis}
              className="flex items-center gap-1 px-3 py-1 text-sm bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-md transition-colors"
            >
              <BookOpen className="h-3 w-3" />
              Remember This
            </button>
          </div>
        </div>
        
        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <label htmlFor="message" className="block text-sm font-medium text-gray-700">
              What would you like help planning?
            </label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g., Plan my day based on my priorities and calendar..."
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 resize-none"
              rows={3}
            />
          </div>

          {/* Quick suggestions */}
          <div className="space-y-2">
            <div className="text-xs text-gray-500">Quick suggestions:</div>
            <div className="flex flex-wrap gap-2">
              {getQuickSuggestions().map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => setMessage(suggestion)}
                  className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={autoGenerateEvents}
                onChange={(e) => handleAutoGenerateChange(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <Sparkles className="h-4 w-4" />
              Auto-generate calendar events
              {userPreference !== null && (
                <span className="text-xs text-green-600 ml-1">
                  (saved preference)
                </span>
              )}
            </label>

            <button
              onClick={handlePlanRequest}
              disabled={loading || !message.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
              Generate Plan
            </button>
          </div>

          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-md">
              {error}
            </div>
          )}
        </div>
      </div>

      {result && (
        <div className="space-y-6">
          {/* Learning feedback section */}
          {result.learning && (
            <LearningFeedback
              learning={result.learning}
              planContent={result.reply}
              onFeedback={handleFeedback}
            />
          )}

          {/* Plan content */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Your Personalized Plan</h3>
            </div>
            <div className="p-6">
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown>{result.reply}</ReactMarkdown>
              </div>
            </div>
          </div>

          {/* Event drafts */}
          {result.eventDrafts && result.eventDrafts.length > 0 && (
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-600" />
                  Generated Calendar Events ({result.eventDrafts.length})
                </h3>
              </div>
              <div className="p-6">
                <div className="space-y-3">
                  {result.eventDrafts.slice(0, 10).map((draft: any, index: number) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-200">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{draft.title}</div>
                        <div className="text-sm text-gray-600">
                          {new Date(draft.startsAt).toLocaleDateString()} at{' '}
                          {new Date(draft.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                          {new Date(draft.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        {draft.rationale && (
                          <div className="text-xs text-gray-500 mt-1">{draft.rationale}</div>
                        )}
                      </div>
                      {draft.confidence && (
                        <div className="text-xs text-gray-500">
                          {Math.round(draft.confidence * 100)}% confident
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {result.eventDrafts.length > 10 && (
                    <div className="text-sm text-gray-500 text-center">
                      ... and {result.eventDrafts.length - 10} more events
                    </div>
                  )}
                </div>

                {result.eventGeneration?.insights && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                    <div className="text-sm font-medium text-blue-800 mb-1">Scheduling Insights:</div>
                    <div className="text-sm text-blue-700">{result.eventGeneration.insights}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* User profile hint */}
          {result.learning?.canProvideFeedback && !result.learning?.personalized && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-yellow-800">
                <Settings className="h-4 w-4" />
                <span className="text-sm font-medium">Tip: The more you interact, the more personalized your plans become!</span>
              </div>
              <div className="text-xs text-yellow-700 mt-1">
                Rate plans, use the "Remember This" feature, and complete tasks to help me learn your preferences.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
