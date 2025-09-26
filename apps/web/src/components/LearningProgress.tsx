'use client'

import { useState, useEffect } from 'react'
import { Brain, TrendingUp, Target, Clock, BarChart3, Loader2 } from 'lucide-react'

interface UserFact {
  id: string
  factType: string
  key: string
  value: string
  confidence: number
  source: string
  lastValidated: string
}

interface LearningStats {
  totalFacts: number
  highConfidenceFacts: number
  avgConfidence: number
  recentSignals: number
  planAcceptanceRate: number
  topPreferences: UserFact[]
  learningTrends: Array<{
    date: string
    factsLearned: number
    confidence: number
  }>
}

export function LearningProgress() {
  const [stats, setStats] = useState<LearningStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchLearningStats()
  }, [])

  const fetchLearningStats = async () => {
    try {
      setLoading(true)
      
      // Fetch user facts
      const factsResponse = await fetch('/api/memory?type=facts&limit=50')
      const signalsResponse = await fetch('/api/signals?limit=100')
      
      if (!factsResponse.ok || !signalsResponse.ok) {
        throw new Error('Failed to fetch learning data')
      }
      
      const factsData = await factsResponse.json()
      const signalsData = await signalsResponse.json()
      
      const facts = factsData.data?.facts || []
      const signals = signalsData.signals || []
      
      // Calculate statistics
      const totalFacts = facts.length
      const highConfidenceFacts = facts.filter((f: UserFact) => f.confidence >= 0.7).length
      const avgConfidence = totalFacts > 0 
        ? facts.reduce((sum: number, f: UserFact) => sum + f.confidence, 0) / totalFacts 
        : 0
      
      const recentSignals = signals.filter((s: any) => {
        const signalDate = new Date(s.createdAt)
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        return signalDate >= weekAgo
      }).length
      
      const planSignals = signals.filter((s: any) => s.key.includes('plan_'))
      const acceptedPlans = planSignals.filter((s: any) => s.success === true).length
      const planAcceptanceRate = planSignals.length > 0 ? acceptedPlans / planSignals.length : 0
      
      const topPreferences = facts
        .filter((f: UserFact) => f.factType === 'preference' && f.confidence >= 0.5)
        .sort((a: UserFact, b: UserFact) => b.confidence - a.confidence)
        .slice(0, 5)
      
      setStats({
        totalFacts,
        highConfidenceFacts,
        avgConfidence,
        recentSignals,
        planAcceptanceRate,
        topPreferences,
        learningTrends: [] // Could implement trend analysis
      })
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load learning progress')
    } finally {
      setLoading(false)
    }
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600 bg-green-100'
    if (confidence >= 0.6) return 'text-yellow-600 bg-yellow-100'
    if (confidence >= 0.4) return 'text-orange-600 bg-orange-100'
    return 'text-red-600 bg-red-100'
  }

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return 'High Confidence'
    if (confidence >= 0.6) return 'Medium Confidence'
    if (confidence >= 0.4) return 'Learning'
    return 'Low Confidence'
  }

  const formatFactKey = (key: string) => {
    return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  if (loading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-600">Loading learning progress...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="text-red-600">Error: {error}</div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="text-gray-500">No learning data available yet.</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-600" />
            Learning Progress
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            See how the AI is learning your preferences and patterns
          </p>
        </div>
      </div>

      {/* Stats overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white shadow rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <BarChart3 className="h-8 w-8 text-blue-600" />
            </div>
            <div className="ml-3 flex-1">
              <p className="text-sm font-medium text-gray-900">Total Facts</p>
              <p className="text-2xl font-bold text-blue-600">{stats.totalFacts}</p>
            </div>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Target className="h-8 w-8 text-green-600" />
            </div>
            <div className="ml-3 flex-1">
              <p className="text-sm font-medium text-gray-900">High Confidence</p>
              <p className="text-2xl font-bold text-green-600">{stats.highConfidenceFacts}</p>
            </div>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <TrendingUp className="h-8 w-8 text-purple-600" />
            </div>
            <div className="ml-3 flex-1">
              <p className="text-sm font-medium text-gray-900">Avg Confidence</p>
              <p className="text-2xl font-bold text-purple-600">
                {Math.round(stats.avgConfidence * 100)}%
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Clock className="h-8 w-8 text-orange-600" />
            </div>
            <div className="ml-3 flex-1">
              <p className="text-sm font-medium text-gray-900">Plan Success</p>
              <p className="text-2xl font-bold text-orange-600">
                {Math.round(stats.planAcceptanceRate * 100)}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Top preferences */}
      {stats.topPreferences.length > 0 && (
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h4 className="text-lg font-medium text-gray-900">Top Learned Preferences</h4>
            <p className="text-sm text-gray-600">Your strongest preferences based on behavior and feedback</p>
          </div>
          <div className="p-6">
            <div className="space-y-3">
              {stats.topPreferences.map((fact) => (
                <div key={fact.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">
                      {formatFactKey(fact.key)}
                    </div>
                    <div className="text-sm text-gray-600">{fact.value}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Source: {fact.source} • Last updated: {new Date(fact.lastValidated).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="ml-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getConfidenceColor(fact.confidence)}`}>
                      {Math.round(fact.confidence * 100)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Learning insights */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6 border border-blue-200">
        <h4 className="font-medium text-gray-900 mb-3">Learning Insights</h4>
        <div className="space-y-2 text-sm text-gray-700">
          {stats.recentSignals > 0 ? (
            <p>✨ You've been active with {stats.recentSignals} interactions this week!</p>
          ) : (
            <p>💡 Interact more with plans to help me learn your preferences faster.</p>
          )}
          
          {stats.avgConfidence > 0.7 ? (
            <p>🎯 I have high confidence in your preferences - plans should be well-personalized!</p>
          ) : stats.avgConfidence > 0.4 ? (
            <p>📈 I'm learning your patterns - keep providing feedback to improve personalization.</p>
          ) : (
            <p>🌱 I'm just starting to learn about you - the more you use the planner, the better it gets!</p>
          )}
          
          {stats.planAcceptanceRate > 0.8 ? (
            <p>🎉 You're accepting most of my plans - great job on the personalization!</p>
          ) : stats.planAcceptanceRate > 0.5 ? (
            <p>⚡ I'm getting better at understanding what works for you.</p>
          ) : stats.planAcceptanceRate > 0 ? (
            <p>🔄 I'm still learning what works best for you - your feedback helps me improve.</p>
          ) : (
            <p>🚀 Generate some plans and provide feedback to start the learning process!</p>
          )}
        </div>
      </div>

      {/* Action items */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h4 className="text-lg font-medium text-gray-900">Boost Your Learning</h4>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 border border-gray-200 rounded-lg">
              <h5 className="font-medium text-gray-900 mb-2">Rate More Plans</h5>
              <p className="text-sm text-gray-600 mb-3">
                Use the thumbs up/down buttons to help me understand what works for you.
              </p>
              <div className="text-xs text-gray-500">
                Current plan ratings: {Math.round(stats.planAcceptanceRate * 100)}%
              </div>
            </div>
            
            <div className="p-4 border border-gray-200 rounded-lg">
              <h5 className="font-medium text-gray-900 mb-2">Use "Remember This"</h5>
              <p className="text-sm text-gray-600 mb-3">
                Explicitly tell me your preferences using the "Remember This" button.
              </p>
              <div className="text-xs text-gray-500">
                Explicit preferences: {stats.topPreferences.filter(f => f.source === 'explicit').length}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
